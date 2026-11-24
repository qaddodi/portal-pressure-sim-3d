// The coarse organs (kidney, spleen, heart, atrium, duodenum, the caudate lobe: 600 to 2400 points) get one round of interpolating subdivision when they are built (organs/subdivide.ts, run by prepare.ts, so in
// the build's bake): their outlines and shade bands were jagged up close (Mohammad, 22 Nov). New points follow the cubic through each edge's ends and normals (a butterfly stencil rippled the duodenum's skinny triangles). Pinned here: every original point stays, the surface stays closed and about the same size, the surface really is
// smoother (the angle between neighbouring triangles falls), the big organs and the liver's nodular outline are untouched, and the baked file rebuilds the children from the parent triangles alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { ORGAN_MESHES, setOrganData } from '../src/scene/organs/meshes.ts';
import { caudateGeometry } from '../src/scene/organs/caudate.ts';
import { smoothSilhouette } from '../src/scene/organs/contour.ts';
import { COARSE_VERTS, splitIndex, subdivideOrgan } from '../src/scene/organs/subdivide.ts';
import { prepareOrgans } from '../src/scene/organs/prepare.ts';
import { decodeOrgans, encodeOrgans } from '../src/scene/organs/baked.ts';
import { PLACED } from '../src/scene/anatomy/source.ts';
import { TUBE_IDS } from '../src/scene/organs/placed.ts';
import { INFLATED_IDS } from '../src/scene/organs/placed-map.ts';

const file = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
setOrganData(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);
const ALL: Record<string, () => BufferGeometry> = { ...ORGAN_MESHES, caudate: caudateGeometry };
// (placed path: a gut tube and an inflated organ are never subdivided, prepare.ts: the tube's rings are already round, and the mock's organs are refined twice already)
const COARSE = Object.keys(ALL).filter((id) => !(PLACED && (TUBE_IDS.has(id) || INFLATED_IDS.includes(id))) && ALL[id]!().getAttribute('position').count < COARSE_VERTS);

/** The mean angle (radians) between the face normals of triangles that share an edge: how faceted the surface is. */
function facet(g: BufferGeometry): number {
  const p = g.getAttribute('position'), idx = g.index!.array, nTri = idx.length / 3, fn: number[][] = [];
  for (let t = 0; t < nTri; t++) {
    const [i, j, k] = [idx[3 * t]!, idx[3 * t + 1]!, idx[3 * t + 2]!];
    const u = [p.getX(j) - p.getX(i), p.getY(j) - p.getY(i), p.getZ(j) - p.getZ(i)], v = [p.getX(k) - p.getX(i), p.getY(k) - p.getY(i), p.getZ(k) - p.getZ(i)];
    const c = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!], l = Math.hypot(c[0]!, c[1]!, c[2]!) || 1;
    fn.push([c[0]! / l, c[1]! / l, c[2]! / l]);
  }
  const edge = new Map<string, number>(); let sum = 0, n = 0;
  for (let t = 0; t < nTri; t++) for (let e = 0; e < 3; e++) {
    const a = idx[3 * t + e]!, b = idx[3 * t + (e + 1) % 3]!, k = a < b ? `${a}|${b}` : `${b}|${a}`, o = edge.get(k);
    if (o === undefined) edge.set(k, t); else { const x = fn[o]!, y = fn[t]!; sum += Math.acos(Math.min(1, Math.max(-1, x[0]! * y[0]! + x[1]! * y[1]! + x[2]! * y[2]!))); n++; }
  }
  return sum / n;
}
/** The sharpest angle between two neighbouring triangles. */
function sharpest(g: BufferGeometry): number {
  const p = g.getAttribute('position'), idx = g.index!.array, fn: number[][] = [], edge = new Map<string, number>(); let mx = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const [i, j, k] = [idx[t]!, idx[t + 1]!, idx[t + 2]!];
    const u = [p.getX(j) - p.getX(i), p.getY(j) - p.getY(i), p.getZ(j) - p.getZ(i)], v = [p.getX(k) - p.getX(i), p.getY(k) - p.getY(i), p.getZ(k) - p.getZ(i)];
    const c = [u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!], l = Math.hypot(c[0]!, c[1]!, c[2]!) || 1;
    fn.push([c[0]! / l, c[1]! / l, c[2]! / l]);
  }
  for (let t = 0; t < fn.length; t++) for (let e = 0; e < 3; e++) {
    const a = idx[3 * t + e]!, b = idx[3 * t + (e + 1) % 3]!, k = a < b ? `${a}|${b}` : `${b}|${a}`, o = edge.get(k);
    if (o === undefined) edge.set(k, t); else { const x = fn[o]!, y = fn[t]!; mx = Math.max(mx, Math.acos(Math.min(1, Math.max(-1, x[0]! * y[0]! + x[1]! * y[1]! + x[2]! * y[2]!)))); }
  }
  return mx;
}
const area = (g: BufferGeometry): number => {
  const p = g.getAttribute('position'), idx = g.index!.array; let a = 0;
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const [i, j, k] = [idx[t]!, idx[t + 1]!, idx[t + 2]!];
    const u = [p.getX(j) - p.getX(i), p.getY(j) - p.getY(i), p.getZ(j) - p.getZ(i)], v = [p.getX(k) - p.getX(i), p.getY(k) - p.getY(i), p.getZ(k) - p.getZ(i)];
    a += Math.hypot(u[1]! * v[2]! - u[2]! * v[1]!, u[2]! * v[0]! - u[0]! * v[2]!, u[0]! * v[1]! - u[1]! * v[0]!) / 2;
  }
  return a;
};
const edgeCounts = (g: BufferGeometry): number[] => {
  const idx = g.index!.array, m = new Map<string, number>();
  for (let t = 0; t < idx.length; t += 3) for (let e = 0; e < 3; e++) { const a = idx[t + e]!, b = idx[t + (e + 1) % 3]!, k = a < b ? `${a}|${b}` : `${b}|${a}`; m.set(k, (m.get(k) ?? 0) + 1); }
  return [...m.values()];
};

test('the small organs are the ones subdivided: kidney, spleen, heart, atrium, duodenum and the caudate lobe', () => {
  // (placed path: the six organs are the approved mock's twice-refined meshes, the gut is tubes and the lobe's egg is made fine enough: no organ is coarse, and the split is held on today's organs)
  if (PLACED) { assert.deepEqual(COARSE, []); return; }
  for (const id of ['kidney-l', 'spleen', 'heart', 'heart-ra', 'duodenum', 'caudate']) assert.ok(COARSE.includes(id), `${id} is coarse`);
  for (const id of ['liver', 'stomach', 'colon', 'bowel']) assert.ok(!COARSE.includes(id), `${id} is not`);
});

test('subdivideOrgan: every original point stays exactly, each triangle becomes four, the surface stays closed and the same size', () => {
  for (const id of COARSE) {
    const g = ALL[id]!(); smoothSilhouette(g);
    const before = Float32Array.from(g.getAttribute('position').array), t0 = g.index!.count / 3, a0 = area(g), c0 = edgeCounts(g);
    const added = subdivideOrgan(g), p = g.getAttribute('position');
    assert.ok(added > 0 && p.count === before.length / 3 + added, `${id}: points added`);
    for (let i = 0; i < before.length; i++) assert.equal(p.array[i], before[i], `${id}: original coordinate ${i} kept`);
    assert.equal(g.index!.count / 3, t0 * 4, `${id}: four triangles each`);
    for (let i = 0; i < g.index!.count; i++) assert.ok(g.index!.array[i]! < p.count, `${id}: index in range`);
    for (let i = 0; i < p.array.length; i++) assert.ok(Number.isFinite(p.array[i]!), `${id}: finite`);
    assert.ok(Math.abs(area(g) - a0) / a0 < 0.02, `${id}: area kept (${a0.toFixed(4)} -> ${area(g).toFixed(4)})`);
    assert.equal(edgeCounts(g).filter((c) => c !== 2).length, c0.filter((c) => c !== 2).length, `${id}: no new open or pinched edges`);
  }
});

test('subdivideOrgan: the surface is smoother (the mean angle between neighbouring triangles falls, by about half on the pillows, and the sharpest one does not grow)', () => {
  const falls: number[] = [];
  for (const id of COARSE) {
    const g = ALL[id]!(); smoothSilhouette(g);
    const f0 = facet(g), m0 = sharpest(g); subdivideOrgan(g); const f1 = facet(g);
    falls.push(1 - f1 / f0);
    assert.ok(f1 < f0 * 0.88, `${id}: ${f0.toFixed(4)} -> ${f1.toFixed(4)} rad`);
    assert.ok(sharpest(g) <= m0 * 1.02, `${id}: the sharpest edge does not get sharper (${m0.toFixed(3)} -> ${sharpest(g).toFixed(3)})`);
  }
  if (!COARSE.length) return;   // (placed path: no organ is split, the test above)
  assert.ok(falls.reduce((a, b) => a + b, 0) / falls.length > 0.35, `on average the facets fall by a third or more (${falls.map((x) => x.toFixed(2)).join(' ')})`);
});

test('subdivideOrgan on a coarse sphere: the new points land on the sphere, much closer than edge middles would', () => {
  // an octahedron refined twice by plain midpoints (a 66-point ball), then one round
  const pos: number[] = [1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 1, 0, 0, -1];
  let idx = [0, 2, 4, 2, 1, 4, 1, 3, 4, 3, 0, 4, 2, 0, 5, 1, 2, 5, 3, 1, 5, 0, 3, 5];
  for (let r = 0; r < 2; r++) {
    const { index, edges } = splitIndex(idx);
    for (const [a, b] of edges) { const q = [0, 1, 2].map((k) => (pos[3 * a + k]! + pos[3 * b + k]!) / 2), l = Math.hypot(q[0]!, q[1]!, q[2]!); pos.push(q[0]! / l, q[1]! / l, q[2]! / l); }
    idx = Array.from(index);
  }
  const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  const n0 = pos.length / 3, parentEdges = splitIndex(idx).edges;
  subdivideOrgan(g);
  const p = g.getAttribute('position');
  let worst = 0, mean = 0, chord = 0;
  for (let i = n0; i < p.count; i++) { const e = Math.abs(Math.hypot(p.getX(i), p.getY(i), p.getZ(i)) - 1); worst = Math.max(worst, e); mean += e / (p.count - n0); }
  for (const [a, b] of parentEdges) chord += (1 - Math.hypot(pos[3 * a]! + pos[3 * b]!, pos[3 * a + 1]! + pos[3 * b + 1]!, pos[3 * a + 2]! + pos[3 * b + 2]!) / 2) / parentEdges.length;
  assert.ok(worst < 0.02, `new points within 2% of the sphere (${worst.toFixed(4)})`);
  assert.ok(mean < chord / 3, `a third of the chords' sag or less (${mean.toFixed(4)} vs ${chord.toFixed(4)})`);
});

test('prepareOrgans: the coarse organs come out with four times the triangles, the big ones and the liver are as before', () => {
  const made = Object.fromEntries(prepareOrgans({ ...ORGAN_MESHES, caudate: caudateGeometry }));
  for (const id of COARSE) {
    const g = made[id]; if (!g) continue;
    assert.ok(g.getAttribute('position').count > ALL[id]!().getAttribute('position').count * 3.5, `${id} has about four times the points`);
    assert.ok(g.getAttribute('ringD') && g.getAttribute('hullN') && g.getAttribute('depthAo'), `${id}: its attributes are made on the finer mesh`);
    assert.equal(g.getAttribute('ringD').count, g.getAttribute('position').count);
  }
  const liver = made.liver!, raw = ORGAN_MESHES.liver!();
  assert.ok(liver.getAttribute('position').count < raw.getAttribute('position').count * 1.2, 'the liver keeps its mesh (only its rim refined)');
});

test('the baked file keeps a subdivided organ as its parent triangles and the page splits them again: same organ, smaller file', () => {
  const live = prepareOrgans({ ...ORGAN_MESHES, caudate: caudateGeometry });
  const bytes = encodeOrgans(live, 'd'), back = decodeOrgans(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)!;
  const head = JSON.parse(new TextDecoder().decode(bytes.subarray(8, 8 + new DataView(bytes.buffer, bytes.byteOffset).getUint32(4, true))));
  const subs = head.organs.filter((o: { sub?: number }) => o.sub);
  assert.ok(subs.length >= COARSE.length - 1, `${subs.length} organs are stored as parents`);
  for (let k = 0; k < live.length; k++) assert.deepEqual(Array.from(back.organs[k]![1].index!.array), Array.from(live[k]![1].index!.array), `${live[k]![0]} triangles`);
  const plain = encodeOrgans(live.map(([id, g]) => { const c = g.clone(); c.userData = {}; return [id, c] as [string, BufferGeometry]; }), 'd');
  if (!COARSE.length) return;   // (placed path: no organ is split, so the two files are the same)
  assert.ok(bytes.length < plain.length, `smaller than storing the children (${bytes.length} < ${plain.length})`);
});
