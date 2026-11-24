import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ORGAN_MESHES, ORGAN_IDS, setOrganData } from '../src/scene/organs/meshes.ts';
import { anglesOf, creaseGain } from './helpers-dihedral.ts';
import { applyOrganEdit, cageRest, softLimit, softLimit3, organBox, organCentroid, organPointMap, wendland } from '../src/editor/organ-apply.ts';
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

test('the editor\'s live cage matches the built organ, and setCageHandle holds its limit', async () => {
  const { LiveStrokes } = await import('../src/ui/debug/editor/strokes.ts');
  const { setCageHandle } = await import('../src/ui/debug/editor/state.ts');
  const ref = ORGAN_MESHES[id]!(), r = pos(ref), c = organCentroid(ref), box = organBox(ref);
  let o = setCageHandle({ version: 1 }, id, 13, [0.02, -0.01, 0.005], [0.05, 0.05, 0.05]);
  const cage = o.organs![id]!.cage!;
  const built = ORGAN_MESHES[id]!();
  applyOrganEdit(built, { cage });
  const live = ORGAN_MESHES[id]!();
  new LiveStrokes(live, undefined, c, box).set(undefined, cage);
  const a = pos(built), b = pos(live);
  for (let i = 0; i < a.length; i++) assert.ok(Math.abs(a[i]! - b[i]!) < 1e-5);
  assert.notDeepEqual(a, r);
  o = setCageHandle(o, id, 13, [9, 0, 0], [0.05, 0.05, 0.05]);
  assert.equal(o.organs![id]!.cage!.d[13]![0], 0.05);
  o = setCageHandle(o, id, 13, [0, 0, 0], [0.05, 0.05, 0.05]);
  assert.equal(o.organs?.[id], undefined);
});

test('limits are soft: no plateau edge, monotonic, below the limit, linear while small', () => {
  assert.equal(softLimit(0.01, 0.04), 0.01);
  let prev = 0;
  for (let v = 0; v < 1; v += 0.001) { const r = softLimit(v, 0.04); assert.ok(r >= prev - 1e-12 && r <= 0.04); prev = r; }
  assert.equal(softLimit(-0.3, 0.04), -softLimit(0.3, 0.04));
  assert.ok(Math.abs(softLimit(0.0200001, 0.04) - softLimit(0.0199999, 0.04)) < 1e-6);   // (continuous at the knee)
  const [x, y, z] = softLimit3(3, 4, 0, 0.04);
  assert.ok(Math.hypot(x, y, z) <= 0.04 && Math.abs(x / y - 0.75) < 1e-9);
});

test('a moderate cage drag or brush stroke creases no edge by more than 0.1 rad, even past the limits', () => {
  for (const name of ['liver', 'spleen', 'kidney-l'].filter((n) => ORGAN_IDS.includes(n))) {
    const r = ORGAN_MESHES[name]!(), ra = anglesOf(r), b = organBox(r), c = organCentroid(r), sz = b.hi[0] - b.lo[0];
    const d = Array.from({ length: 27 }, () => [0, 0, 0] as [number, number, number]);
    d[13] = [sz * 0.1, sz * 0.05, 0];
    const cage = ORGAN_MESHES[name]!(); applyOrganEdit(cage, { cage: { n: [3, 3, 3], d } });
    const brush = ORGAN_MESHES[name]!(); applyOrganEdit(brush, { strokes: [{ at: c, radius: sz * 0.3, by: [0.02, 0, 0] }] });
    const past = ORGAN_MESHES[name]!(); applyOrganEdit(past, { strokes: [0, 1, 2].map(() => ({ at: c, radius: sz * 0.3, by: [0.2, 0, 0] as [number, number, number] })) });
    for (const g of [cage, brush, past]) { const q = creaseGain(r, ra, g); assert.ok(q.max < 0.1, `${name}: ${q.max}`); }
  }
});

test('strokes fold into a grid: nothing dropped, same shape, cost independent of the stroke count', async () => {
  const { foldStrokes, gridSample } = await import('../src/editor/organ-apply.ts');
  const { FOLD_AT } = await import('../src/editor/types.ts');
  const ref = ORGAN_MESHES[id]!(), r = pos(ref), c = organCentroid(ref), b = organBox(ref), sz = b.hi[0] - b.lo[0];
  const strokes = Array.from({ length: 150 }, (_, i) => ({ at: [c[0] + (i % 15 - 7) * sz * 0.03, c[1] + (Math.floor(i / 15) - 5) * sz * 0.03, c[2]] as [number, number, number], radius: sz * 0.25, by: [0.004, 0.002, 0] as [number, number, number] }));
  const edit = { strokes };
  assert.ok(strokes.length > FOLD_AT);
  const f = foldStrokes(edit);
  assert.equal(f.strokes, undefined);
  assert.ok(f.grid && f.grid.d.length === 3 * 16 ** 3);
  const g = ORGAN_MESHES[id]!();
  applyOrganEdit(g, edit);   // (more than FOLD_AT strokes: read through the grid)
  const p = pos(g);
  let worst = 0, moved = 0, err = 0;
  for (let i = 0; i < p.length; i += 3) {
    let sx = 0, sy = 0, sz2 = 0;   // the exact pull: every stroke, summed, held by the soft limit
    for (const s of strokes) { const d = Math.hypot(r[i]! - s.at[0], r[i + 1]! - s.at[1], r[i + 2]! - s.at[2]); if (d < s.radius) { const w = wendland(d / s.radius); sx += s.by[0] * w; sy += s.by[1] * w; sz2 += s.by[2] * w; } }
    const [ex, ey, ez] = softLimit3(sx, sy, sz2, LIQUIFY_LIMIT);
    const d = Math.hypot(p[i]! - r[i]!, p[i + 1]! - r[i + 1]!, p[i + 2]! - r[i + 2]!);
    err = Math.max(err, Math.hypot(p[i]! - r[i]! - ex, p[i + 1]! - r[i + 1]! - ey, p[i + 2]! - r[i + 2]! - ez));
    if (d > 1e-6) moved++; worst = Math.max(worst, d);
  }
  assert.ok(moved > 0 && worst <= 0.12);
  assert.ok(err < 0.004, `grid vs exact strokes: ${err}`);   // (a tenth of the liquify limit)
  const more = foldStrokes({ ...f, strokes: [{ at: c, radius: sz * 0.2, by: [0.01, 0, 0] }] });
  assert.ok(Math.hypot(...gridSample(more.grid!, c)) >= Math.hypot(...gridSample(f.grid!, c)) - 0.004);   // (an old grid is carried into the next fold)
  const map = organPointMap(edit, c, b)!;
  for (let i = 0; i < p.length; i += 300) { const q = map([r[i]!, r[i + 1]!, r[i + 2]!]); assert.ok(Math.hypot(q[0] - p[i]!, q[1] - p[i + 1]!, q[2] - p[i + 2]!) < 1e-5); }
});

test('boot cost: a long stroke list is read once through the grid, and a baked file has no strokes to pay for', async () => {
  const { resolveEdit, bakeOverrides } = await import('../src/editor/organ-apply.ts');
  const strokes = Array.from({ length: 400 }, (_, i) => ({ at: [i * 0.001, 0, 0] as [number, number, number], radius: 0.1, by: [0.01, 0, 0] as [number, number, number] }));
  const edit = { strokes };
  const a = resolveEdit(edit);
  assert.equal(a, resolveEdit(edit), 'folded once per edit object');
  assert.equal(a.strokes, undefined);
  const baked = bakeOverrides({ version: 1, organs: { liver: edit, spleen: { move: [0.01, 0, 0] } } });
  assert.equal(baked.organs!.liver!.strokes, undefined);
  assert.ok(baked.organs!.liver!.grid);
  assert.equal(baked.organs!.spleen!.grid, undefined);
  assert.ok(JSON.stringify(baked).length < 400_000, 'the baked grid stays small');
  const short = { strokes: strokes.slice(0, 3) };
  assert.equal(resolveEdit(short), short);
});

test('live edits touch only what changed: a stroke moves only its vertices, a handle matches the build, normals match a full pass', async () => {
  const { LiveStrokes } = await import('../src/ui/debug/editor/strokes.ts');
  const ref = ORGAN_MESHES[id]!(), c = organCentroid(ref), box = organBox(ref), sz = box.hi[0] - box.lo[0];
  const near = (a: ArrayLike<number>, b: ArrayLike<number>, e = 1e-5): boolean => { for (let i = 0; i < a.length; i++) if (Math.abs(a[i]! - b[i]!) > e) return false; return true; };
  const live = ORGAN_MESHES[id]!(), ls = new LiveStrokes(live, undefined, c, box);
  ls.set(undefined);
  const n = live.getAttribute('position').count;
  const s1 = { at: [c[0], c[1], c[2]] as [number, number, number], radius: sz * 0.12, by: [0.02, 0.01, 0] as [number, number, number] };
  ls.set([s1]);
  console.log(`live stroke touched ${ls.lastMoved} of ${n} vertices`);
  assert.ok(ls.lastMoved > 0 && ls.lastMoved < n / 2, `touched ${ls.lastMoved} of ${n}`);
  const built = ORGAN_MESHES[id]!(); applyOrganEdit(built, { strokes: [s1] }, { box });
  assert.ok(near(pos(live), pos(built)), 'positions equal the build');
  const full = (g: typeof live): Float32Array => { const h = g.clone(); h.computeVertexNormals(); return Float32Array.from(h.getAttribute('normal').array); };
  assert.ok(near(live.getAttribute('normal').array, full(live), 1e-4), 'local normals equal a full pass');
  const s2 = { ...s1, at: [c[0] + sz * 0.05, c[1], c[2]] as [number, number, number] };
  ls.set([s1, s2]);
  assert.ok(near(live.getAttribute('normal').array, full(live), 1e-4), 'and after a second stroke');
  const d = Array.from({ length: 27 }, () => [0, 0, 0] as [number, number, number]);
  d[13] = [sz * 0.1, 0, 0];
  ls.set([s1, s2], { n: [3, 3, 3], d });
  const d2 = d.map((v) => [...v] as [number, number, number]);
  d2[4] = [0, sz * 0.08, 0];
  ls.set([s1, s2], { n: [3, 3, 3], d: d2 });
  const b2 = ORGAN_MESHES[id]!(); applyOrganEdit(b2, { strokes: [s1, s2], cage: { n: [3, 3, 3], d: d2 } }, { box });
  assert.ok(near(pos(live), pos(b2), 1e-4), 'cage after two single-handle changes equals the build');
  ls.set([s1, s2]);
  const b3 = ORGAN_MESHES[id]!(); applyOrganEdit(b3, { strokes: [s1, s2] }, { box });
  assert.ok(near(pos(live), pos(b3), 1e-4), 'cage removed');
});

test('overlap hints: an edit that pushes one organ into another is flagged against the reference, untouched organs are not', async () => {
  const { organHints, columnsOf, vesselHint } = await import('../src/editor/overlap.ts');
  const { BoxGeometry } = await import('three');
  const box = (x: number, z: number) => { const g = new BoxGeometry(0.2, 0.2, 0.1, 6, 6, 3); g.translate(x, 0, z); return g; };
  const a = box(0, 0), b = box(0.5, 0), p = (g: typeof a) => Float32Array.from(g.getAttribute('position').array);
  const clear = organHints({ a: { edited: p(a), reference: p(a), index: a.index!.array }, b: { edited: p(b), reference: p(b), index: b.index!.array } });
  assert.deepEqual(clear, [], 'nothing moved, nothing flagged');
  const moved = b.clone(); moved.translate(-0.4, 0, 0);   // b into a
  const hints = organHints({ a: { edited: p(a), reference: p(a), index: a.index!.array }, b: { edited: p(moved), reference: p(b), index: b.index!.array } });
  assert.equal(hints.length, 1);
  assert.ok(hints[0]!.depth > 0.02 && hints[0]!.was === 0);
  const overlapAlready = organHints({ a: { edited: p(a), reference: p(a) }, b: { edited: p(a), reference: p(a) } });
  assert.deepEqual(overlapAlready, [], 'overlap the reference already had is not news');
  const cols = columnsOf(p(a), a.index!.array);
  const line = Array.from({ length: 10 }, (_, i) => [-0.1 + i * 0.02, 0, 0] as [number, number, number]);
  const through = vesselHint(line, 0.01, cols, columnsOf(p(b), b.index!.array));
  assert.ok(through.flagged && through.depth > 0);
  assert.equal(vesselHint(line, 0.01, cols, cols).flagged, false);
});
