import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ORGAN_MESHES, ORGAN_IDS, setOrganData } from '../src/scene/organs/meshes.ts';
import { applyOrganEdit, organCentroid, wendland } from '../src/editor/organ-apply.ts';
import { caudateGeometry } from '../src/scene/organs/caudate.ts';
import { setOverridesForTest, overrides } from '../src/editor/store.ts';
import { editableOrgans } from '../src/scene/organs/meshes.ts';
import { LIQUIFY_LIMIT, ORGAN_LIMITS } from '../src/editor/types.ts';

const bin = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
setOrganData(bin.buffer.slice(bin.byteOffset, bin.byteOffset + bin.byteLength));
const id = ORGAN_IDS.includes('liver') ? 'liver' : ORGAN_IDS[0]!;
const pos = (g: { getAttribute(n: string): { array: ArrayLike<number> } }) => Float32Array.from(g.getAttribute('position').array);

test('empty edits leave identical buffers', () => {
  const ref = pos(ORGAN_MESHES[id]!());
  for (const e of [undefined, {}, { strokes: [] }, { move: [0, 0, 0] as const, scale: 1, rotY: 0 }]) {
    const g = ORGAN_MESHES[id]!();
    applyOrganEdit(g, e);
    assert.deepEqual(pos(g), ref);
  }
});

test('wendland falls from 1 to 0 smoothly', () => {
  assert.equal(wendland(0), 1); assert.equal(wendland(1), 0); assert.equal(wendland(2), 0);
  assert.ok(wendland(0.5) > 0 && wendland(0.5) < 1);
});

test('move, rotation and scale are clamped to the limits', () => {
  const ref = ORGAN_MESHES[id]!(), c = organCentroid(ref), r = pos(ref);
  const g = ORGAN_MESHES[id]!();
  applyOrganEdit(g, { move: [5, 0, 0] });
  const p = pos(g);
  assert.ok(Math.abs(p[0]! - r[0]! - ORGAN_LIMITS.move) < 1e-5);
  const h = ORGAN_MESHES[id]!();
  applyOrganEdit(h, { scale: 9 });
  const q = pos(h);
  assert.ok(Math.abs((q[0]! - c[0]) - (r[0]! - c[0]) * ORGAN_LIMITS.scaleMax) < 1e-5);
  const a = ORGAN_MESHES[id]!(), b = ORGAN_MESHES[id]!();
  applyOrganEdit(a, { rotY: 100 }); applyOrganEdit(b, { rotY: ORGAN_LIMITS.rotY });
  assert.deepEqual(pos(a), pos(b));
});

test('liquify is clamped per vertex, finite, and welded vertices stay together', () => {
  const ref = ORGAN_MESHES[id]!(), r = pos(ref), c = organCentroid(ref);
  const g = ORGAN_MESHES[id]!();
  applyOrganEdit(g, { strokes: [{ at: [c[0], c[1], c[2]], radius: 10, by: [1, 1, 1] }, { at: [c[0], c[1], c[2]], radius: 10, by: [1, 1, 1] }, { at: [NaN, 0, 0], radius: 1, by: [1, 0, 0] }] });
  const p = pos(g);
  let moved = 0;
  const at = new Map<string, string>();
  for (let i = 0; i < p.length; i += 3) {
    assert.ok(Number.isFinite(p[i]! + p[i + 1]! + p[i + 2]!));
    const d = Math.hypot(p[i]! - r[i]!, p[i + 1]! - r[i + 1]!, p[i + 2]! - r[i + 2]!);
    assert.ok(d <= LIQUIFY_LIMIT + 1e-5);
    if (d > 1e-6) moved++;
    const k = `${Math.round(r[i]! * 1e4)},${Math.round(r[i + 1]! * 1e4)},${Math.round(r[i + 2]! * 1e4)}`, v = `${p[i]},${p[i + 1]},${p[i + 2]}`;
    const prev = at.get(k);
    if (prev) assert.equal(prev, v); else at.set(k, v);
  }
  assert.ok(moved > 0);
  const nrm = g.getAttribute('normal').array;
  for (const v of nrm) assert.ok(Number.isFinite(v));
});

test('a local stroke moves only vertices inside its radius, and exact welds move together', () => {
  const ref = ORGAN_MESHES[id]!(), r = pos(ref), c = organCentroid(ref);
  const g = ORGAN_MESHES[id]!();
  applyOrganEdit(g, { strokes: [{ at: c, radius: 0.05, by: [0.02, 0, 0] }] });
  const p = pos(g), groups = new Map<string, Set<string>>();
  for (let i = 0; i < p.length; i += 3) {
    const d = Math.hypot(r[i]! - c[0], r[i + 1]! - c[1], r[i + 2]! - c[2]);
    if (d >= 0.05) assert.equal(p[i], r[i]);
    const k = `${r[i]},${r[i + 1]},${r[i + 2]}`;
    (groups.get(k) ?? groups.set(k, new Set()).get(k)!).add(`${p[i]},${p[i + 1]},${p[i + 2]}`);
  }
  for (const s of groups.values()) assert.equal(s.size, 1);
});

test('the caudate (built from the 2D outline) takes its edit; empty overrides give identical buffers', () => {
  const was = overrides();
  try {
    setOverridesForTest({ version: 1 });
    const ref = pos(caudateGeometry());
    assert.deepEqual(pos(caudateGeometry()), ref);
    assert.ok(editableOrgans().some((o) => o.id === 'caudate'));
    setOverridesForTest({ version: 1, organs: { caudate: { move: [0.05, 0, 0], strokes: [{ at: [0, 0, 0], radius: 5, by: [9, 9, 9] }] } } });
    const p = pos(caudateGeometry());
    assert.notDeepEqual(p, ref);
    for (const v of p) assert.ok(Number.isFinite(v));
  } finally { setOverridesForTest(was); }
});
