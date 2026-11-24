import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ORGAN_MESHES, ORGAN_IDS, setOrganData } from '../src/scene/organs/meshes.ts';
import { applyOrganEdit, cageRest, organBox, organCentroid, organPointMap, wendland } from '../src/editor/organ-apply.ts';
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

test('the caudate anchor and its veins follow the lobe edit; empty overrides change nothing', async () => {
  const { caudateAnchor3, CAUDATE_ANCHOR } = await import('../src/scene/organs/caudate.ts');
  const { caudateVeinSet } = await import('../src/scene/vessels/caudate-veins.ts');
  const { x3, y3 } = await import('../src/scene/frame2d.ts');
  const was = overrides();
  try {
    setOverridesForTest({ version: 1 });
    caudateGeometry();
    const a0 = caudateAnchor3(), v0 = JSON.stringify(caudateVeinSet(16));
    assert.deepEqual(a0, [x3(CAUDATE_ANCHOR[0]), y3(CAUDATE_ANCHOR[1])]);
    setOverridesForTest({ version: 1, organs: { caudate: { move: [0.1, 0, 0] } } });
    const a1 = caudateAnchor3();
    assert.ok(Math.abs(a1[0] - a0[0] - 0.1) < 1e-6 && Math.abs(a1[1] - a0[1]) < 1e-6);
    const s0 = JSON.parse(v0).list[0].pts, s1 = caudateVeinSet(16).list[0]!.pts;
    assert.ok(s1[0]![0] > s0[0][0] + 1);
    assert.deepEqual(s1.at(-1), s0.at(-1));
  } finally { setOverridesForTest(was); }
});

test('cage: zero offsets are the identity; a handle bulges smoothly, is clamped, and the anchor map matches the vertex', () => {
  const ref = ORGAN_MESHES[id]!(), r = pos(ref), box = organBox(ref), c = organCentroid(ref);
  const n = [3, 3, 3] as const, zero = Array.from({ length: 27 }, () => [0, 0, 0] as [number, number, number]);
  const g0 = ORGAN_MESHES[id]!();
  applyOrganEdit(g0, { cage: { n, d: zero } });
  assert.deepEqual(pos(g0), r);
  assert.equal(cageRest(n, box).length, 27);
  const d = zero.map((v) => [...v] as [number, number, number]);
  d[13] = [9, 0.02, 0];   // the middle handle: x far past the limit
  const edit = { cage: { n, d }, move: [0.01, 0, 0] as const, rotY: 0.1, scale: 1.05 };
  const g = ORGAN_MESHES[id]!();
  applyOrganEdit(g, edit);
  const p = pos(g), map = organPointMap(edit, c, box)!;
  const size = box.hi[0] - box.lo[0];
  let maxMove = 0;
  for (let i = 0; i < p.length; i += 3) {
    assert.ok(Number.isFinite(p[i]! + p[i + 1]! + p[i + 2]!));
    const q = map([r[i]!, r[i + 1]!, r[i + 2]!]);
    assert.ok(Math.hypot(q[0] - p[i]!, q[1] - p[i + 1]!, q[2] - p[i + 2]!) < 1e-5);
    maxMove = Math.max(maxMove, Math.abs(p[i]! - r[i]!));
  }
  assert.ok(maxMove > 0.01 && maxMove < 0.35 * size * 1.3 + 0.3);
  const gc = ORGAN_MESHES[id]!();
  applyOrganEdit(gc, { cage: { n, d: d.map((v) => [v[0] * 2, v[1], v[2]] as [number, number, number]) } });
  const gd = ORGAN_MESHES[id]!();
  applyOrganEdit(gd, { cage: { n, d: d.map((v) => [v[0], v[1], v[2]] as [number, number, number]) } });
  assert.deepEqual(pos(gc), pos(gd));   // (past the limit a bigger pull changes nothing)
});
