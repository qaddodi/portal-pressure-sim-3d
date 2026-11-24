// The anatomy editor's pure parts (WS-C): the edits and their limits, the undo history, the export, the drag and pick maths, and that the editor is behind its flag only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector3 } from 'three';
import { EMPTY, LIQUIFY_LIMIT, ORGAN_LIMITS } from '../src/editor/types.ts';
import type { Stroke } from '../src/editor/types.ts';
import { core, fileText, fileOverrides, staleNote, differs, addControl, removeControl, knotsOf, strokeToReference, dragToOffsets, toReference, History, addStroke, clearStrokes, controlOf, exportText, isEmpty, nodeOf, organOf, parseOverrides, resetOrgan, setControl, setNode, setOrgan, tidy, MAX_STROKES } from '../src/ui/debug/editor/state.ts';
import { dotSize, hitRadius, dragDelta, ndcOf, nearest, nearestLine, nearestParam } from '../src/ui/debug/editor/picking.ts';
import { liveCourses, dotted } from '../src/ui/debug/editor/live-vessels.ts';
import { VIEW_KEY, loadView, saveView, EXPORT_REMIND_MS, exportReminder, noteExported, persistHistory, restorableHistory, clearHistory, type StorageLike } from '../src/ui/debug/editor/session.ts';
import { knownIds, orphansOf, orphanCount, withoutOrphans } from '../src/ui/debug/editor/orphans.ts';
import committedOverrides from '../src/editor/overrides.json' with { type: 'json' };
import { LiveStrokes } from '../src/ui/debug/editor/strokes.ts';
import { liveTransform } from '../src/ui/debug/editor/live.ts';
import { pointAt, uAtIndex } from '../src/ui/debug/editor/source.ts';
import { applyVesselOverrides } from '../src/editor/vessel-apply.ts';
import { editableSkeleton } from '../src/editor/vessel-skeleton.ts';
import { applyOrganEdit, organCentroid } from '../src/editor/organ-apply.ts';
import { x2d, y2d, x3, y3 } from '../src/scene/frame2d.ts';
import { BoxGeometry } from 'three';
import { flagOn, flagValue, knownFlags } from '../src/ui/debug/flags.ts';

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
  assert.deepEqual(controlOf(setControl(o, 'V', 0.25, { dx: 0, dy: 0 }), 'V', 0.25), { dx: 0, dy: 0, dz: 0 }, 'a point dragged back to zero stays (it is removed on purpose)');
  o = removeControl(removeControl(o, 'V', 0.25), 'V', 0.51);
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

test('a liquify stroke is held to the limit, a long list is folded into the grid (never dropped), and clearing empties it', () => {
  let o = addStroke(EMPTY, 'spleen', { at: [0, 0, 0], radius: 0.1, by: [1, 0, 0] });
  assert.ok(Math.hypot(...o.organs!.spleen!.strokes![0]!.by) <= LIQUIFY_LIMIT + 1e-9);
  for (let i = 0; i < MAX_STROKES + 20; i++) o = addStroke(o, 'spleen', { at: [i * 0.001, 0, 0], radius: 0.1, by: [0.01, 0, 0] });
  assert.ok(organOf(o, 'spleen').strokes < MAX_STROKES && o.organs!.spleen!.grid, 'folded into the grid, not dropped');
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

test('a drag round-trips: the handle moved on the screen plane puts the node (and every arm end there) at the handle', () => {
  const sk = editableSkeleton();
  const node = sk.nodes.find((n) => n.arms.length >= 2)!;
  const cam = new PerspectiveCamera(30, 1, 0.1, 100); cam.position.set(0, 0, 5); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();
  const at = new Vector3(...node.pos);
  const w = dragDelta(cam, at, ndcOf(500, 500, 1000, 1000), ndcOf(540, 470, 1000, 1000));   // (the body frame is the world here)
  const o = setNode(EMPTY, node.id, dragToOffsets({ dx: 0, dy: 0, dz: 0 }, w));
  for (const arm of node.arms) {
    const v = sk.vessels.find((q) => q.id === arm.id)!;
    const path = v.course.map((p): [number, number] => [x2d(p[0]), y2d(p[1])]);
    const r = applyVesselOverrides({ id: v.id, from: v.from, to: v.to }, path, o).path;
    const end = arm.end ? r[r.length - 1]! : r[0]!, was = v.course[arm.end ? v.course.length - 1 : 0]!;
    assert.ok(Math.abs(x3(end[0]) - (was[0] + w.x)) < 1e-6 && Math.abs(y3(end[1]) - (was[1] + w.y)) < 1e-6, `${arm.id} end follows the handle`);
  }
});

test('a control point dragged lands where the pointer put it (plan units, depth in scene units)', () => {
  const d = dragToOffsets({ dx: 1, dy: 2, dz: 0.03 }, { x: 0.1, y: -0.2 });
  assert.deepEqual(d, { dx: 31, dy: 62, dz: 0.03 });
});

test('a stroke written from a hit on the built organ lands on the same place in the reference frame', () => {
  const ref = new BoxGeometry(1, 1, 1);
  const c = organCentroid(ref), edit = { move: [0.05, -0.02, 0.01] as const, rotY: 0.2, scale: 1.1 };
  const built = applyOrganEdit(ref.clone(), edit, { centroid: c });
  const p = ref.getAttribute('position'), b = built.getAttribute('position');
  for (const i of [0, 7, 13]) {
    const back = toReference([b.getX(i), b.getY(i), b.getZ(i)], edit, c);
    assert.ok(Math.hypot(back[0] - p.getX(i), back[1] - p.getY(i), back[2] - p.getZ(i)) < 1e-5);
  }
});

test('a stroke on a rotated and scaled organ moves the vertex by the drag as seen on the built organ', () => {
  const ref = new BoxGeometry(1, 1, 1, 6, 6, 6), c = organCentroid(ref), edit = { move: [0.03, 0, -0.02] as const, rotY: 0.3, scale: 1.1 };
  const built = applyOrganEdit(ref.clone(), edit, { centroid: c }), b = built.getAttribute('position');
  const i = 40, hit: [number, number, number] = [b.getX(i), b.getY(i), b.getZ(i)], drag: [number, number, number] = [0.01, -0.005, 0.006];
  const st = strokeToReference(drag, 0.2, edit);
  const edited = applyOrganEdit(ref.clone(), { ...edit, strokes: [{ at: toReference(hit, edit, c), radius: st.radius, by: st.by }] }, { centroid: c }).getAttribute('position');
  const got = [edited.getX(i) - hit[0], edited.getY(i) - hit[1], edited.getZ(i) - hit[2]];
  drag.forEach((v, k) => assert.ok(Math.abs(got[k]! - v) < 1e-5, `axis ${k}: ${got[k]} vs ${v}`));
});

test('live: the organ transformed by the draft over its loaded edit equals the organ Save builds', () => {
  const ref = new BoxGeometry(1, 1, 1, 4, 4, 4), c = organCentroid(ref);
  const loadedE = { move: [0.02, 0.01, -0.03] as const, rotY: -0.1, scale: 0.95 }, nowE = { move: [-0.04, 0.03, 0.05] as const, rotY: 0.25, scale: 1.12 };
  const built = applyOrganEdit(ref.clone(), loadedE, { centroid: c }), want = applyOrganEdit(ref.clone(), nowE, { centroid: c });
  const t = liveTransform(loadedE, nowE, c), b = built.getAttribute('position'), w = want.getAttribute('position');
  const cs = Math.cos(t.rotY), sn = Math.sin(t.rotY);
  for (const i of [0, 9, 31, 60]) {
    const x = b.getX(i) * t.scale, y = b.getY(i) * t.scale, z = b.getZ(i) * t.scale;   // three's order: scale, turn about Y, then position
    const got = [x * cs + z * sn + t.position[0], y + t.position[1], -x * sn + z * cs + t.position[2]];
    assert.ok(Math.hypot(got[0]! - w.getX(i), got[1]! - w.getY(i), got[2]! - w.getZ(i)) < 1e-5);
  }
  assert.deepEqual(liveTransform(loadedE, loadedE, c), { position: [0, 0, 0], rotY: 0, scale: 1 });
});

test('live vessels: the centreline the editor draws is the one Save builds, and only for what changed', () => {
  const sk = editableSkeleton(), node = sk.nodes.find((n) => n.arms.length >= 2 && n.arms.every((a) => liveCourses({ version: 1, nodes: { [n.id]: { dx: 9, dy: 0 } } }, EMPTY, sk.vessels).has(a.id)))!;
  assert.ok(node, 'a node whose arms all have a plan course');
  const now = setNode(EMPTY, node.id, { dx: 9, dy: -6, dz: 0.02 });
  const live = liveCourses(now, EMPTY, sk.vessels);
  assert.deepEqual([...live.keys()].sort(), sk.vessels.filter((v) => v.from === node.id || v.to === node.id).map((v) => v.id).filter((id) => live.has(id)).sort());
  for (const arm of node.arms) {
    const v = sk.vessels.find((q) => q.id === arm.id)!, c = live.get(arm.id)!, end = arm.end ? c[c.length - 1]! : c[0]!, was = v.course[arm.end ? v.course.length - 1 : 0]!;
    assert.ok(Math.abs(end[0] - (was[0] + 9 / 300)) < 1e-6 && Math.abs(end[1] - (was[1] + 6 / 300)) < 1e-6 && Math.abs(end[2] - (was[2] + 0.02)) < 1e-6, `${arm.id} end`);
  }
  assert.equal(liveCourses(now, now, sk.vessels).size, 0, 'nothing differs from what was built: nothing is drawn');
  assert.equal(liveCourses(EMPTY, EMPTY, sk.vessels).size, 0);
  const d = dotted([[0, 0, 0], [0.1, 0, 0]], 0.01);
  assert.ok(d.length >= 10 && d.length <= 12);
});

test('live liquify: strokes on the on-screen geometry equal the organ Save builds, incrementally and after an undo', () => {
  const ref = new BoxGeometry(1, 1, 1, 8, 8, 8), c = organCentroid(ref);
  const loadedE = { move: [0.02, 0, -0.01] as const, rotY: 0.2, scale: 1.05 };
  const g = applyOrganEdit(ref.clone(), loadedE, { centroid: c });
  const live = new LiveStrokes(g, loadedE, c);
  const s1 = { at: [0.5, 0.2, 0.5] as const, radius: 0.4, by: [0.03, 0.01, -0.02] as const }, s2 = { at: [0.5, 0.25, 0.45] as const, radius: 0.3, by: [0.03, 0, 0.02] as const };
  const near = (a: ArrayLike<number>, b: ArrayLike<number>): boolean => { for (let i = 0; i < a.length; i++) if (Math.abs(a[i]! - b[i]!) > 1e-5) return false; return true; };
  const saved = (strokes: readonly Stroke[]): ArrayLike<number> => applyOrganEdit(ref.clone(), { ...loadedE, strokes }, { centroid: c }).getAttribute('position').array;
  live.set([s1]); assert.ok(near(g.getAttribute('position').array, saved([s1])), 'one stroke');
  live.set([s1, s2]); assert.ok(near(g.getAttribute('position').array, saved([s1, s2])), 'two strokes, the second added on top');
  live.set([s1]); assert.ok(near(g.getAttribute('position').array, saved([s1])), 'undone');
  live.set(undefined); assert.ok(near(g.getAttribute('position').array, saved([])), 'cleared');
});

test('handles are easy to grab: touch radius at least 22 px and larger than the mouse, dots larger on touch', () => {
  assert.ok(hitRadius(false) >= 22 && hitRadius(true) > hitRadius(false));
  assert.ok(dotSize(9, true) > dotSize(9, false));
});

test('a drag on a side view moves the handle in depth, and a lock keeps one axis', () => {
  const cam = new PerspectiveCamera(30, 1, 0.1, 100); cam.position.set(5, 0, 0); cam.lookAt(0, 0, 0); cam.updateMatrixWorld();   // looking along -x: the screen plane is y-z
  const w = dragDelta(cam, new Vector3(0, 0, 0), ndcOf(500, 500, 1000, 1000), ndcOf(600, 450, 1000, 1000));
  assert.ok(Math.abs(w.z) > 0.05 && Math.abs(w.x) < 1e-9, 'the pointer moved along z and y, not x');
  const free = dragToOffsets({ dx: 0, dy: 0, dz: 0 }, w);
  assert.ok(Math.abs(free.dz - w.z) < 1e-9 && Math.abs(free.dy + w.y * 300) < 1e-9);
  assert.deepEqual(dragToOffsets({ dx: 0, dy: 0, dz: 0 }, w, 'z'), { dx: 0, dy: 0, dz: free.dz });
  assert.equal(dragToOffsets({ dx: 0, dy: 0, dz: 0 }, w, 'y').dz, 0);
  assert.equal(dragToOffsets({ dx: 0, dy: 0, dz: 0.29 }, { x: 0, y: 0, z: 1 }).dz, 0.3, 'depth is held to its limit');
});

const memory = (): StorageLike & { map: Map<string, string> } => { const map = new Map<string, string>(); return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => { map.set(k, v); }, removeItem: (k) => { map.delete(k); } }; };

test('autosave: the undo history survives a reload, after a Save and after a crash, and only for the page it belongs to', () => {
  const st = memory();
  const h = new History(EMPTY);
  h.commit(setNode(h.now, 'A', { dx: 1, dy: 1 })); h.commit(setNode(h.now, 'B', { dx: 2, dy: 2 }));
  persistHistory(st, EMPTY, h, 1000);
  const crash = restorableHistory(st, EMPTY)!;   // (the page was built with EMPTY: unsaved work recovered)
  assert.ok(crash && isEmpty(crash.past[0]!) && nodeOf(crash.now, 'B').dx === 2);
  const h2 = new History(EMPTY); h2.restore(crash); assert.equal(h2.undo(), true); assert.equal(nodeOf(h2.now, 'B').dx, 0); assert.equal(h2.canRedo, true);
  assert.ok(restorableHistory(st, h.now), 'after a Save the page is built with the draft: the history goes on');
  assert.equal(restorableHistory(st, setNode(EMPTY, 'Z', { dx: 5, dy: 5 })), null, 'another page: not offered');
  clearHistory(st); assert.equal(restorableHistory(st, EMPTY), null);
  st.setItem('pps3d.editor.history.v1', '{nonsense'); assert.equal(restorableHistory(st, EMPTY), null);
});

test('export reminder: said when the edits exist only in this browser, quiet after an Export', () => {
  const st = memory(), now = setNode(EMPTY, 'A', { dx: 1, dy: 1 });
  assert.equal(exportReminder(st, EMPTY, EMPTY, 0), null, 'nothing to keep');
  assert.match(exportReminder(st, now, EMPTY, 0)!, /only in this browser/);
  noteExported(st, now, 1000);
  assert.equal(exportReminder(st, now, EMPTY, 1000 + EXPORT_REMIND_MS * 2), null, 'exported and unchanged since');
  const later = setNode(now, 'B', { dx: 1, dy: 1 });
  assert.equal(exportReminder(st, later, EMPTY, 2000), null, 'just changed: not yet');
  assert.match(exportReminder(st, later, EMPTY, 1000 + EXPORT_REMIND_MS + 1)!, /Changed since the last Export/);
});

test('import: an exported file reads back to the same overrides, and a bad file is refused', () => {
  const o = setOrgan(setControl(setNode(EMPTY, 'N', { dx: 3, dy: -4, dz: 0.01 }), 'V', 0.4, { dx: 1, dy: 2 }), 'liver', { rotY: 0.1 });
  assert.deepEqual(parseOverrides(exportText(o)), tidy(o));
  assert.equal(parseOverrides(''), null); assert.equal(parseOverrides('[]'), null); assert.equal(parseOverrides('{"version":9}'), null);
});

test('control points: added anywhere, any number, removed on purpose; a tap finds its place along the vessel', () => {
  let o = EMPTY;
  assert.deepEqual(knotsOf(o, 'V'), [0.25, 0.5, 0.75], 'three starting places while there are none');
  for (const u of [0.1, 0.33, 0.5, 0.62, 0.9]) o = addControl(o, 'V', u);
  assert.deepEqual(knotsOf(o, 'V'), [0.1, 0.33, 0.5, 0.62, 0.9], 'five points, in order');
  o = setControl(o, 'V', 0.33, { dx: 4, dy: 0 });
  assert.equal(controlOf(o, 'V', 0.33).dx, 4);
  o = removeControl(o, 'V', 0.5);
  assert.deepEqual(knotsOf(o, 'V'), [0.1, 0.33, 0.62, 0.9]);
  const screen: [number, number][] = [[0, 0], [100, 0], [100, 100]], course: [number, number, number][] = [[0, 0, 0], [1, 0, 0], [1, 1, 0]];
  const f = nearestParam(screen, 100, 50, 10)!;
  assert.ok(Math.abs(f - 1.5) < 1e-9 && Math.abs(uAtIndex(course, f) - 0.75) < 1e-9, 'a tap on the middle of the second leg is three quarters along');
  assert.equal(nearestParam(screen, 50, 50, 10), null);
});

test('the view comes back after a Save reload: camera, mode and picks round-trip, and a bad entry is ignored', () => {
  const st = memory();
  assert.equal(loadView(st), null);
  saveView(st, { yaw: 1.2, pitch: -0.3, mode: 'vessels', organ: 'liver', vessel: 'PV', panel: false });
  assert.deepEqual(loadView(st), { yaw: 1.2, pitch: -0.3, mode: 'vessels', organ: 'liver', vessel: 'PV', panel: false });
  st.setItem(VIEW_KEY, JSON.stringify({ yaw: 'x', pitch: 0, mode: 'organs' })); assert.equal(loadView(st), null);
  st.setItem(VIEW_KEY, '{oops'); assert.equal(loadView(st), null);
});

test('?editor=view is still the editor flag (the draft is read), and says view (no panel)', () => {
  assert.equal(flagOn('editor', '?editor=view'), true);
  assert.equal(flagValue('editor', '?editor=view'), 'view');
  assert.notEqual(flagValue('editor', '?editor'), 'view');
});

test('orphans: every id in the committed overrides.json exists in this build, and a missing one is found and droppable', () => {
  const k = knownIds();
  const real = orphansOf(committedOverrides as never, k);
  assert.equal(orphanCount(real), 0, `the committed overrides name parts the build lacks: ${JSON.stringify(real)}`);
  const sk = editableSkeleton();
  const good = setOrgan(setControl(setNode(EMPTY, sk.nodes[0]!.id, { dx: 1, dy: 1 }), sk.vessels[0]!.id, 0.5, { dx: 1, dy: 1 }), 'liver', { rotY: 0.1 });
  assert.equal(orphanCount(orphansOf(good, k)), 0, 'real ids are known');
  const bad = setOrgan(setControl(setNode(good, 'NO_SUCH_NODE', { dx: 1, dy: 1 }), 'NO_SUCH_VESSEL', 0.5, { dx: 1, dy: 1 }), 'no-such-organ', { rotY: 0.1 });
  assert.deepEqual(orphansOf(bad, k), { nodes: ['NO_SUCH_NODE'], vessels: ['NO_SUCH_VESSEL'], organs: ['no-such-organ'] });
  assert.deepEqual(withoutOrphans(bad, k), good);
});

test('history: a step noticed after the change (a slider) goes back to what it was; one that changed nothing makes none', () => {
  const h = new History(EMPTY), before = h.now;
  h.commit(setNode(before, 'A', { dx: 2, dy: 2 }), true); h.markAs(before);
  assert.equal(h.undo(), true); assert.equal(isEmpty(h.now), true);
  const g = new History(EMPTY); assert.equal(g.canUndo, false);
});

test('differs: equal drafts in different objects are the same, and the answer is cached per object', () => {
  const a = setNode(EMPTY, 'A', { dx: 1, dy: 1 }), b = setNode(EMPTY, 'A', { dx: 1, dy: 1 });
  assert.equal(differs(a, b), false); assert.equal(differs(a, a), false); assert.equal(differs(a, EMPTY), true);
});

test('versioning: the file carries the base commit and snapshots, edits are judged without them, migration refuses unknown versions', () => {
  const o = setNode(EMPTY, 'A', { dx: 1, dy: 2 }), snap = { v1: core(setNode(EMPTY, 'B', { dx: 3, dy: 3 })) };
  const text = fileText(o, snap, 'abc1234def');
  const back = parseOverrides(text)!;
  assert.equal(back.meta?.base, 'abc1234def'); assert.deepEqual(back.snapshots, snap);
  assert.equal(exportText(back), exportText(o), 'meta and snapshots are not edits');
  assert.equal(differs(back, o), false);
  assert.deepEqual(core(fileOverrides(o, snap, 'x')), core(o));
  assert.equal(parseOverrides('{"version":2,"nodes":{}}'), null, 'a newer format is refused, not guessed at');
  assert.match(staleNote('abc1234def', 'fff0000aaa')!, /abc1234/); assert.equal(staleNote('abc1234def', 'abc1234def'), null); assert.equal(staleNote(undefined, 'x'), null);
  assert.equal(fileText(EMPTY, {}, ''), '{\n  "version": 1\n}\n');
});
