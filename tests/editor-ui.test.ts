// The anatomy editor's pure parts (WS-C): the edits and their limits, the undo history, the export, the drag and pick maths, and that the editor is behind its flag only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { EMPTY, LIQUIFY_LIMIT, ORGAN_LIMITS } from '../src/editor/types.ts';
import { History, addStroke, clearStrokes, controlOf, exportText, isEmpty, nodeOf, organOf, parseOverrides, resetOrgan, setControl, setNode, setOrgan, tidy, MAX_STROKES } from '../src/ui/debug/editor/state.ts';
import { dragDelta, ndcOf, nearest, nearestLine } from '../src/ui/debug/editor/picking.ts';
import { pointAt } from '../src/ui/debug/editor/source.ts';
import { flagOn, knownFlags } from '../src/ui/debug/flags.ts';

test('a node move is kept, and moving it back removes it', () => {
  const a = setNode(EMPTY, 'PV', { dx: 4, dy: -2, dz: 0.01 });
  assert.deepEqual(nodeOf(a, 'PV'), { dx: 4, dy: -2, dz: 0.01 });
  assert.equal(isEmpty(setNode(a, 'PV', { dx: 0, dy: 0 })), true);
  assert.equal(EMPTY.nodes, undefined, 'the shared empty is never written');
});

test('control points merge near one another, stay sorted, and zero removes', () => {
  let o = setControl(EMPTY, 'V', 0.5, { dx: 1, dy: 1 });
  o = setControl(o, 'V', 0.25, { dx: 2, dy: 0 });
  o = setControl(o, 'V', 0.51, { dx: 3, dy: 3 });
  assert.deepEqual(o.vessels!.V!.pts.map((p) => p.u), [0.25, 0.51]);
  assert.deepEqual(controlOf(o, 'V', 0.5), { dx: 3, dy: 3, dz: 0 });
  o = setControl(setControl(o, 'V', 0.25, { dx: 0, dy: 0 }), 'V', 0.51, { dx: 0, dy: 0 });
  assert.equal(isEmpty(o), true);
});

test('organ edits are held to the limits', () => {
  const o = setOrgan(EMPTY, 'liver', { move: [1, 0, 0], rotY: 9, scale: 3 });
  const e = organOf(o, 'liver');
  assert.ok(Math.hypot(...e.move) <= ORGAN_LIMITS.move + 1e-9);
  assert.equal(e.rotY, ORGAN_LIMITS.rotY);
  assert.equal(e.scale, ORGAN_LIMITS.scaleMax);
  assert.equal(organOf(setOrgan(o, 'liver', { scale: 0 }), 'liver').scale, ORGAN_LIMITS.scaleMin);
  assert.equal(isEmpty(resetOrgan(o, 'liver')), true);
  assert.equal(isEmpty(setOrgan(EMPTY, 'liver', { move: [0, 0, 0], scale: 1 })), true);
  assert.ok(Number.isFinite(organOf(setOrgan(EMPTY, 'liver', { rotY: NaN, scale: 1.1 }), 'liver').rotY));
});

test('a liquify stroke is held to the limit, the list is capped, and clearing empties it', () => {
  let o = addStroke(EMPTY, 'spleen', { at: [0, 0, 0], radius: 0.1, by: [1, 0, 0] });
  assert.ok(Math.hypot(...o.organs!.spleen!.strokes![0]!.by) <= LIQUIFY_LIMIT + 1e-9);
  for (let i = 0; i < MAX_STROKES + 20; i++) o = addStroke(o, 'spleen', { at: [i * 0.001, 0, 0], radius: 0.1, by: [0.01, 0, 0] });
  assert.equal(organOf(o, 'spleen').strokes, MAX_STROKES);
  assert.equal(isEmpty(clearStrokes(o, 'spleen')), true);
});

test('undo and redo: a drag is one step, a new edit drops the redo', () => {
  const h = new History(EMPTY);
  h.mark();
  for (let i = 1; i <= 5; i++) h.commit(setNode(h.now, 'N', { dx: i, dy: 0 }), true);
  assert.equal(nodeOf(h.now, 'N').dx, 5);
  assert.equal(h.undo(), true);
  assert.equal(isEmpty(h.now), true);
  assert.equal(h.canUndo, false);
  assert.equal(h.redo(), true);
  assert.equal(nodeOf(h.now, 'N').dx, 5);
  h.undo();
  h.commit(setNode(h.now, 'M', { dx: 1, dy: 1 }));
  assert.equal(h.canRedo, false);
  assert.equal(h.redo(), false);
});

test('export is the file as the store reads it, and an untouched draft is EMPTY', () => {
  assert.deepEqual(tidy({ version: 1, nodes: {}, vessels: {}, organs: {} }), EMPTY);
  const o = setNode(setOrgan(EMPTY, 'liver', { rotY: 0.1 }), 'N', { dx: 1, dy: 2 });
  assert.deepEqual(parseOverrides(exportText(o)), tidy(o));
  assert.equal(parseOverrides('{"version":2}'), null);
  assert.equal(parseOverrides('nope'), null);
});

test('a drag on the facing plane moves the handle with the pointer', () => {
  const cam = new PerspectiveCamera(30, 1, 0.1, 100); cam.position.set(0, 0, 5); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
  const at = new Vector3(0, 0, 0);
  const d = dragDelta(cam, at, ndcOf(500, 500, 1000, 1000), ndcOf(600, 500, 1000, 1000));
  assert.ok(d.x > 0 && Math.abs(d.y) < 1e-9 && Math.abs(d.z) < 1e-9);
  const half = 5 * Math.tan((30 * Math.PI) / 360);   // half the view's height at the plane
  assert.ok(Math.abs(d.x - 0.2 * half) < 1e-6);
});

test('picking: nearest handle within the finger radius, nearest line', () => {
  assert.equal(nearest([[0, 0], [100, 100], null], 98, 103, 20), 1);
  assert.equal(nearest([[0, 0]], 50, 50, 20), -1);
  assert.equal(nearestLine([[[0, 0], [100, 0]], [[0, 50], [100, 50]]], 40, 45, 10), 1);
  assert.equal(nearestLine([[[0, 0], [100, 0]]], 40, 45, 10), -1);
  assert.deepEqual(pointAt([[0, 0, 0], [2, 0, 0], [2, 2, 0]], 0.5), [2, 0, 0]);
});

test('the editor flag is known and off without ?editor', () => {
  assert.ok(knownFlags().some((f) => f.id === 'editor' && f.gate === 'local'));
  assert.equal(flagOn('editor', '?perf'), false);
  assert.equal(flagOn('editor', '?editor'), true);
});
