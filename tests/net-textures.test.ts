// WP1 of the vessel-geometry plan (?geom=net): the bone and edge-state textures, and the table that says where every per-vessel uniform goes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VESSEL_FS, VESSEL_VS } from '../src/scene/vessels/shaders.ts';
import { DOUBLE_MAPPED, MAPPED_UNIFORMS, shaderUniforms, uniformFate } from '../src/scene/vessels/net/uniform-map.ts';
import { EDGE_COLUMNS, EDGE_LAYOUT, EDGE_SLOTS, EDGE_TEXELS, EdgeStateTable, type EdgeInit } from '../src/scene/vessels/net/edge-state.ts';
import { BONES_PER_ROW, BONE_ROW_TEXELS, BoneTable, MAX_BONES_PER_EDGE, bonePos, frameToQuat, packBone, quatToFrame, unpackBone } from '../src/scene/vessels/net/bones.ts';
import type { Vec3 } from '../src/scene/anatomy/vessels.ts';
import type { Bone } from '../src/scene/vessels/net/types.ts';

const shaderNames = [...new Set([...shaderUniforms(VESSEL_VS), ...shaderUniforms(VESSEL_FS)])];

// ── the uniform table ─────────────────────────────────────────────────────────────────────────────────────────────────────────

test('the shaders\' uniform list is read whole (a regex that finds none would make the coverage test pass for nothing)', () => {
  assert.ok(shaderNames.length > 100, `${shaderNames.length} uniforms read`);
  for (const n of ['fadeA', 'wedgeD', 'seamB', 'laneColA', 'mate0', 'skinCut', 'radius', 'dustP']) assert.ok(shaderNames.includes(n), n);
});

test('every uniform of VESSEL_VS and VESSEL_FS has an edge column, a bone, a global or a reason it is dropped', () => {
  const missing = shaderNames.filter((n) => !uniformFate(n));
  assert.deepEqual(missing, [], `uncovered: add an edge column in edge-state.ts, or an entry in uniform-map.ts, for ${missing.join(', ')}`);
});

test('the table names nothing the shaders no longer declare, and no uniform twice', () => {
  assert.deepEqual(MAPPED_UNIFORMS.filter((n) => !shaderNames.includes(n)), [], 'stale entries: remove them');
  assert.deepEqual(DOUBLE_MAPPED, []);
});

test('the review\'s dropped list is dropped, and every drop says why', () => {
  for (const n of ['mate0', 'mate1', 'nbrMate', 'bury', 'cmate0', 'cmate1', 'cease']) assert.equal(uniformFate(n)?.kind, 'dropped', n);
  for (const n of shaderNames) { const f = uniformFate(n)!; if (f.kind === 'dropped' || f.kind === 'global') assert.ok(f.why.length > 8, n); }
});

test('what a slide, a pick, a fade or the highlight writes per vessel is an edge column, never a global', () => {
  for (const n of ['fade', 'fadeA', 'fadeMode', 'hiOn', 'hiColor', 'lensSpan', 'stump', 'wedge', 'wedgeD', 'liveW', 'reveal', 'solidK', 'veilK', 'circW', 'vindex', 'lensIndex', 'baseD', 'widthKind', 'len', 'seamA']) {
    assert.equal(uniformFate(n)?.kind, 'edge', n);
  }
});

// ── the edge-state texture ────────────────────────────────────────────────────────────────────────────────────────────────────

test('the packer: no two columns share a float, a vector never straddles a texel, and the row is compact', () => {
  const seen = new Set<string>();
  for (const s of EDGE_SLOTS) {
    const whole = s.size === 8;
    if (!whole) assert.ok(s.comp + s.size <= 4, `${s.name} fits its texel`);
    else assert.equal(s.comp, 0);
    const texels = whole ? [s.texel, s.texel + 1] : [s.texel];
    for (const t of texels) for (let c = whole ? 0 : s.comp; c < (whole ? 4 : s.comp + s.size); c++) { const k = `${t}.${c}`; assert.ok(!seen.has(k), `${s.name} overlaps at ${k}`); seen.add(k); assert.ok(t < EDGE_TEXELS); }
  }
  const floats = EDGE_COLUMNS.reduce((a, c) => a + c.size, 0);
  assert.ok(EDGE_TEXELS * 4 - floats <= 12, `${EDGE_TEXELS} texels hold ${floats} floats: wasteful packing`);
  assert.equal(new Set(EDGE_COLUMNS.map((c) => c.name)).size, EDGE_COLUMNS.length, 'column names are unique');
});

const EDGES: EdgeInit[] = [{ tone: 'portal', tier: 'net' }, { tone: 'artery', tier: 'art' }, { tone: 'sys', tier: 'back', widthKind: 2 }, { tone: 'portal', tier: 'mid' }];

test('a new row starts from what vessel-object.ts gives a uniform when a vessel is built', () => {
  const t = new EdgeStateTable(EDGES);
  assert.deepEqual(t.get(0, 'fade'), [1]); assert.deepEqual(t.get(0, 'fadeA'), [0, 1, 1, 1]); assert.deepEqual(t.get(0, 'hiEnds'), [1e3, 1e3]); assert.deepEqual(t.get(0, 'lensSpan'), [0, 1]);
  assert.deepEqual(t.get(0, 'wedgeD'), [0, 0, -1, Math.fround(0.02)]); assert.deepEqual(t.get(0, 'stentU'), [0, 0, 1, 0]); assert.deepEqual(t.get(0, 'circRow'), [-1]);
  assert.deepEqual(t.get(0, 'lensUse'), [1]); assert.deepEqual(t.get(1, 'lensUse'), [0], 'an artery keeps its own colour');
  assert.deepEqual(t.get(1, 'widthKind'), [1]); assert.deepEqual(t.get(2, 'widthKind'), [2]); assert.deepEqual(t.get(0, 'widthKind'), [0]);
  assert.deepEqual(t.get(2, 'circW'), [8, 1, 0, 4.5], 'a bed\'s Circuit width');
  assert.deepEqual([0, 1, 2].map((i) => t.get(i, 'tone')[0]), [0, 2, 1]);
  assert.deepEqual(t.get(3, 'seamA'), new Array(8).fill(0));
});

test('a write lands in its own row and column only', () => {
  const t = new EdgeStateTable(EDGES);
  const before = Float32Array.from(t.data);
  assert.equal(t.set(2, 'fadeA', [0.1, 0.9, 0.2, 0.3]), true);
  assert.equal(t.set(2, 'fade', 0.5), true);
  const changed: number[] = [];
  t.data.forEach((v, i) => { if (v !== before[i]) changed.push(i); });
  const rowFloats = EDGE_TEXELS * 4;
  assert.ok(changed.every((i) => Math.floor(i / rowFloats) === 2), 'only row 2 changed');
  assert.deepEqual(t.get(2, 'fadeA'), [0.1, 0.9, 0.2, 0.3].map(Math.fround)); assert.deepEqual(t.get(2, 'fade'), [0.5]);
  assert.deepEqual(t.get(1, 'fadeA'), [0, 1, 1, 1]);
  assert.throws(() => t.set(0, 'fadeA', [1, 2]), RangeError); assert.throws(() => t.set(9, 'fade', 1), RangeError); assert.throws(() => t.set(0, 'nope', 1), /no column/);
});

test('rewriting the same numbers marks nothing and uploads nothing (a state written every frame is free until it changes)', () => {
  const t = new EdgeStateTable(EDGES), tex = t.texture();
  assert.equal(t.dirtyRows(), null);
  assert.equal(t.set(1, 'fade', 1), false); assert.equal(t.set(1, 'hiEnds', [1e3, 1e3]), false);
  assert.equal(t.dirtyRows(), null); assert.equal(t.writes, 0);
  t.flush(); assert.equal(tex.updateRanges.length, 0);
});

test('a coil step (one edge\'s columns) uploads that edge\'s row and nothing else', () => {
  const t = new EdgeStateTable(EDGES), tex = t.texture();
  t.set(2, 'len', 7.5); t.set(2, 'fade', 0.25);
  assert.deepEqual(t.dirtyRows(), [2, 2]); assert.equal(t.writes, 2);
  t.flush();
  const stride = EDGE_TEXELS * 4;
  assert.deepEqual(tex.updateRanges, [{ start: 2 * stride, count: stride }], 'exactly row 2');
  assert.equal(t.dirtyRows(), null, 'flushed');
  t.set(0, 'hiOn', 1); t.set(3, 'hiOn', 1); t.flush();
  assert.deepEqual(tex.updateRanges.slice(1), [{ start: 0, count: 4 * stride }], 'two rows apart are one range from the first to the last');
});

test('the texture is the table\'s own array, RGBA float, one row per edge', () => {
  const t = new EdgeStateTable(EDGES), tex = t.texture();
  assert.equal(tex.image.width, EDGE_TEXELS); assert.equal(tex.image.height, EDGES.length); assert.strictEqual(tex.image.data, t.data);
  assert.strictEqual(t.texture(), tex);
  assert.equal(EDGE_LAYOUT.get('fadeA')!.size, 4);
});

// ── the bone texture ──────────────────────────────────────────────────────────────────────────────────────────────────────────

function rand(seed: number): () => number { let s = seed >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
const unit = (v: Vec3): Vec3 => { const l = Math.hypot(...v); return [v[0] / l, v[1] / l, v[2] / l]; };
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
function randomFrame(r: () => number): [Vec3, Vec3, Vec3] {
  const t = unit([r() - 0.5, r() - 0.5, r() - 0.5]);
  let n = unit(cross(t, [r() - 0.5, r() - 0.5, r() - 0.5]));
  n = unit(n);
  return [t, n, cross(t, n)];
}
function bonesOf(edges: number[], r: () => number): { bones: Bone[]; spans: [number, number][] } {
  const bones: Bone[] = [], spans: [number, number][] = [];
  edges.forEach((count, edge) => {
    spans.push([bones.length, count]);
    for (let k = 0; k < count; k++) bones.push({ edge, u: count === 1 ? 0 : k / (count - 1), pos: [[r() * 3, r() * 3, r() * 3], [r() * 9, r() * 9, r() * 9]], r: [0.01 + r() * 0.03, 0.02 + r() * 0.1], frame: randomFrame(r) });
  });
  return { bones, spans };
}
const maxDiff = (a: readonly number[], b: readonly number[]) => Math.max(...a.map((v, i) => Math.abs(v - b[i]!)));

test('a frame survives the quaternion: orthonormal in, the same frame out, for 20000 random frames', () => {
  const r = rand(7);
  let worst = 0;
  for (let i = 0; i < 20000; i++) {
    const f = randomFrame(r), q = frameToQuat(f);
    assert.ok(q[3] >= 0, 'w >= 0');
    assert.ok(Math.abs(Math.hypot(...q) - 1) < 1e-12);
    // the texture stores x, y, z as float32 and rebuilds w
    const back = quatToFrame(Math.fround(q[0]), Math.fround(q[1]), Math.fround(q[2]));
    worst = Math.max(worst, maxDiff(f.flat(), back.flat()));
  }
  assert.ok(worst < 1e-3, `worst frame error after float32 and the rebuilt w: ${worst}`);
});

test('the identity and the axis swings are exact', () => {
  assert.deepEqual(quatToFrame(...(frameToQuat([[1, 0, 0], [0, 1, 0], [0, 0, 1]]).slice(0, 3) as [number, number, number])), [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  const flip = quatToFrame(...(frameToQuat([[-1, 0, 0], [0, -1, 0], [0, 0, 1]]).slice(0, 3) as [number, number, number]));   // 180 degrees about z: w = 0
  assert.ok(maxDiff(flip.flat(), [-1, 0, 0, 0, -1, 0, 0, 0, 1]) < 1e-6);
});

test('a bone packs into three texels and reads back: positions and radii exactly, the edge and u, the frame', () => {
  const { bones } = bonesOf([5, 70 > MAX_BONES_PER_EDGE ? 60 : 70], rand(3));
  const data = new Float32Array(BONE_ROW_TEXELS * 4 * 4);
  bones.forEach((b, i) => packBone(data, bonePos(i), b));
  bones.forEach((b, i) => {
    const o = unpackBone(data, i);
    assert.equal(o.edge, b.edge); assert.ok(Math.abs(o.u - b.u) < 2e-5, `u ${o.u} vs ${b.u}`);
    assert.ok(maxDiff(o.pos.flat(), b.pos.flat()) < 1e-6 * 10); assert.ok(maxDiff(o.r, b.r) < 1e-7);
    assert.ok(maxDiff(o.frame.flat(), b.frame.flat()) < 1e-3);
  });
});

test('bone i is at texel (i % 64) * 3 and row floor(i / 64): the index NetMesh.bone stores', () => {
  assert.equal(bonePos(0), 0); assert.equal(bonePos(1), 12); assert.equal(bonePos(63), 63 * 12);
  assert.equal(bonePos(64), BONE_ROW_TEXELS * 4); assert.equal(bonePos(65), BONE_ROW_TEXELS * 4 + 12);
  assert.equal(BONES_PER_ROW * 3, BONE_ROW_TEXELS);
});

test('a frame that is not right-handed orthonormal is refused by name, not packed as a wrong rotation', () => {
  const b = bonesOf([1], rand(1)).bones[0]!;
  const out = new Float32Array(12);
  assert.throws(() => packBone(out, 0, { ...b, frame: [b.frame[0], b.frame[1], [-b.frame[2][0], -b.frame[2][1], -b.frame[2][2]]] }), /right-handed/);
  assert.throws(() => packBone(out, 0, { ...b, u: 1.5 }), RangeError);
  assert.throws(() => packBone(out, 0, { ...b, edge: 300 }), RangeError);
});

test('70 edges of 64 bones fit under the budget: under 1 MB, one texture row of 192 texels per 64 bones', () => {
  const { bones, spans } = bonesOf(new Array(70).fill(64), rand(5));
  const t = new BoneTable(bones, spans.map((s) => ({ bones: s })));
  assert.equal(t.rows, 70); assert.ok(t.data.byteLength < 1e6, `${t.data.byteLength} bytes`);
  assert.deepEqual(t.bone(64 * 69 + 10).edge, 69);
  assert.throws(() => new BoneTable(bones, [{ bones: [0, MAX_BONES_PER_EDGE + 1] }]), /holds/);   // (an edge holds up to MAX_BONES_PER_EDGE: 64, and more where a corner needs them, 22 Nov)
});

test('a coil step rewrites only that edge\'s bones and uploads only the rows they lie in', () => {
  const r = rand(11);
  const { bones, spans } = bonesOf([40, 30, 64, 20, 50], r);
  const t = new BoneTable(bones), tex = t.texture();
  assert.equal(t.dirtyBones(), null);
  const [first, count] = spans[2]!;
  const coiled = bones.slice(first, first + count).map((b) => ({ ...b, pos: [[b.pos[0][0] + 0.5, b.pos[0][1], b.pos[0][2]], b.pos[1]] as Bone['pos'] }));
  const before = Float32Array.from(t.data);
  t.writeEdge(first, coiled);
  assert.equal(t.writes, count, 'only that edge\'s bones were written');
  assert.deepEqual(t.dirtyBones(), [first, first + count - 1]);
  const rowFloats = BONE_ROW_TEXELS * 4;
  const rows = t.dirtyRows()!;
  assert.ok(rows[1] - rows[0] <= 1, `a 64-bone edge lies in at most two rows (${rows})`);
  // nothing outside the edge's bones changed
  const lo = bonePos(first), hi = bonePos(first + count - 1) + 12;
  t.data.forEach((v, i) => { if (v !== before[i]) assert.ok(i >= lo && i < hi, `float ${i} changed outside edge 2`); });
  assert.ok(Math.abs(t.bone(first).pos[0][0] - (bones[first]!.pos[0][0] + 0.5)) < 1e-5);
  t.flush();
  assert.deepEqual(tex.updateRanges, [{ start: rows[0] * rowFloats, count: (rows[1] - rows[0] + 1) * rowFloats }]);
  assert.equal(t.dirtyBones(), null);
  t.flush(); assert.equal(tex.updateRanges.length, 1, 'a second flush with nothing written adds nothing');
  assert.throws(() => t.writeEdge(first, bones.slice(0, 1000)), RangeError);
});
