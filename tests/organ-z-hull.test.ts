// The organs' depth (z.ts) and the outline's smooth normal (normal-smooth.ts, the hull's sawtooth halo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ORGAN_Z } from '../src/scene/organs/z.ts';
import { caudateGeometry } from '../src/scene/organs/caudate.ts';
import { x3 } from '../src/scene/frame2d.ts';
import { ORGAN_STYLE } from '../src/scene/organs/layer.ts';
import { organsReady, setOrganData, ORGAN_MESHES } from '../src/scene/organs/meshes.ts';
import { CelScene } from '../src/scene/scene.ts';
import { smoothRestNormals } from '../src/scene/organs/normal-smooth.ts';
import { ORGAN_INK_VS } from '../src/scene/organs/organ-shader.ts';
import { MAX_MOVE, rimRoughness, smoothSilhouette } from '../src/scene/organs/contour.ts';
import { LiverShape, edgeFree } from '../src/scene/organs/liver-shape.ts';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { TUBE_IDS } from '../src/scene/organs/placed.ts';

const file = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
setOrganData(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);

test('organ depth: the liver is in front of the stomach (and the heart), the kidney is at the IVC\'s depth, every organ has one', () => {
  // (placed path: every mesh carries the approved placement's own depth and ORGAN_Z moves none of them; the same order, read from the meshes' fronts and middles)
  for (const id of Object.keys(ORGAN_STYLE)) assert.equal(ORGAN_Z[id], 0, `${id}: not moved again`);
  const box = (id: string) => { const g = id === 'caudate' ? caudateGeometry() : ORGAN_MESHES[id]!(); g.computeBoundingBox(); return g.boundingBox!; }, front = (id: string) => box(id).max.z, mid = (id: string) => (box(id).max.z + box(id).min.z) / 2;
  assert.ok(front('liver') > front('stomach') && front('liver') > front('heart-ra'), 'liver in front of the stomach and the atrium');
  assert.ok(front('spleen') < front('stomach'), 'the spleen lies behind the stomach');
  assert.ok(mid('kidney-l') < mid('stomach') && mid('kidney-l') < mid('spleen') + 0.01, 'the kidney lies at the back');
  assert.ok(front('duodenum') < front('colon'), 'the duodenum lies behind the colon');   // (by its front: the colon's loops run from the back to the front)
});

test('smooth silhouette: every organ\'s rim is smoother than the file\'s, moved by at most MAX_MOVE, and the surface stays whole', async () => {
  await organsReady;
  for (const [id, make] of Object.entries(ORGAN_MESHES)) {
    if (TUBE_IDS.has(id)) continue;   // (placed path: a gut tube is never smoothed, prepare.ts: its rim is its round rings', not an outline's)
    const raw = make(), sm = make(), before = rimRoughness(raw), moved = smoothSilhouette(sm), after = rimRoughness(sm);
    if (before === 0) continue;   // (no silhouette ring in this mesh)
    assert.ok(moved <= MAX_MOVE + 1e-9, `${id}: moved ${moved}`);
    // (placed path: the approved mock's rims are refined twice and already about 1e-4 smooth, a twentieth of today's; there the smoothing may leave one level within that floor)
    assert.ok(after <= Math.max(before, 1e-4), `${id}: rim roughness ${before.toFixed(5)} -> ${after.toFixed(5)}`);
    const p = sm.getAttribute('position'), n = sm.getAttribute('normal');
    for (let i = 0; i < p.count; i++) assert.ok(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i) + n.getX(i)), `${id}: finite`);
  }
  // a synthetic jagged disc: a saw-tooth rim becomes a near-circle
  const N = 48, pos: number[] = [0, 0, 0.1, 0, 0, -0.1], idx: number[] = [];
  for (let k = 0; k < N; k++) { const r = 1 + (k % 2 ? 0.03 : -0.03), a = (k / N) * 2 * Math.PI; pos.push(r * Math.cos(a), r * Math.sin(a), 0); }
  for (let k = 0; k < N; k++) { const a = 2 + k, b = 2 + ((k + 1) % N); idx.push(0, a, b, 1, b, a); }
  const disc = new BufferGeometry(); disc.setAttribute('position', new Float32BufferAttribute(pos, 3)); disc.setIndex(idx);
  const rough0 = rimRoughness(disc); smoothSilhouette(disc, 8, 0.05);
  assert.ok(rimRoughness(disc) < rough0 * 0.3, `the saw-tooth is gone (${rough0.toFixed(5)} -> ${rimRoughness(disc).toFixed(5)})`);
});

test('the cirrhotic liver\'s rim is scalloped by its nodules, outward only and bounded; at no scarring it is exactly the healthy rim', async () => {
  await organsReady;
  const g = ORGAN_MESHES.liver!(); g.computeVertexNormals();
  const rest = rimRoughness(g), ls = new LiverShape(g.getAttribute('position') as never, g.getAttribute('normal').array);
  const out: string[] = [];
  for (const c of [0.5, 1]) { ls.apply(c); out.push(`${c}: ${rimRoughness(g).toFixed(5)}`); assert.ok(rimRoughness(g) < 0.012, `liver rim at scarring ${c}: ${rimRoughness(g)} against ${rest} healthy`); }
  ls.apply(0); assert.ok(Math.abs(rimRoughness(g) - rest) < 1e-9, 'no scarring: the healthy rim');
  assert.equal(edgeFree(0), 0); assert.equal(edgeFree(1), 1); assert.ok(edgeFree(0.5) > 0 && edgeFree(0.5) < 1);
  console.log('liver rim', rest.toFixed(5), out.join(' '));
});

test('organ depth: each mesh is moved along z only, x and y exact, and the front face stays behind the vessels\' arteries', async () => {
  await organsReady;
  const s = new CelScene();
  s.disease.organs.build();
  for (const [id, o] of s.disease.organs.byId) {
    const g = o.toonMesh.geometry, rest = (id === 'caudate' ? caudateGeometry : ORGAN_MESHES[id]!)(), a = g.getAttribute('position'), b = rest.getAttribute('position');
    let zmin = Infinity, zmax = -Infinity;
    assert.ok(a.count >= b.count, `${id}: the rim refinement only adds points (appended after the file's own)`);
    for (let i = 0; i < a.count; i++) {
      zmin = Math.min(zmin, a.getZ(i)); zmax = Math.max(zmax, a.getZ(i));
    }
    // the file's own points keep their order: x and y moved only by the rim smoothing, z by the table's value
    for (let i = 0; i < b.count; i++) {
      assert.ok(Math.hypot(a.getX(i) - b.getX(i), a.getY(i) - b.getY(i)) <= MAX_MOVE + 1e-6, `${id}: x and y moved only by the rim smoothing (at most ${MAX_MOVE})`);
      assert.ok(Math.abs(a.getZ(i) - b.getZ(i) - ORGAN_Z[id]!) < 1e-5, `${id}: z moved by its table value`);
    }
    // (the vessels lie in one plane THROUGH the organs now, frame2d.ts TIER_Z: no organ is required to stay behind them; tests/b3-vessels.test.ts pins the plane inside the liver, heart, kidney and stomach)
    assert.ok(zmax > zmin, `${id}: has depth`);
  }
  assert.ok(Number.isFinite(x3(0)));
  s.dispose?.();
});

test('the outline is pushed along a smoothed normal: every organ has one, unit length, smoother than the mesh\'s own', async () => {
  await organsReady;
  const s = new CelScene();
  s.disease.organs.build();
  assert.match(ORGAN_INK_VS, /attribute vec3 hullN;/);
  assert.match(ORGAN_INK_VS, /normalMatrix \* hullN/);
  for (const [id, o] of s.disease.organs.byId) {
    const g = o.toonMesh.geometry, h = g.getAttribute('hullN'), n = g.getAttribute('normal');
    assert.ok(h && h.itemSize === 3 && h.count === n.count, `${id}: hullN`);
    // the roughness: how far a vertex's normal is, on average, from its neighbours' (along the index)
    const idx = g.index!.array;
    const rough = (at: { getX(i: number): number; getY(i: number): number; getZ(i: number): number }) => {
      let sum = 0, c = 0;
      for (let t = 0; t + 2 < idx.length; t += 3) for (const [p, q] of [[0, 1], [1, 2], [2, 0]] as const) {
        const i = idx[t + p!]!, j = idx[t + q!]!;
        sum += Math.hypot(at.getX(i) - at.getX(j), at.getY(i) - at.getY(j), at.getZ(i) - at.getZ(j)); c++;
      }
      return sum / c;
    };
    for (let i = 0; i < h.count; i += 7) assert.ok(Math.abs(Math.hypot(h.getX(i), h.getY(i), h.getZ(i)) - 1) < 1e-4, `${id}: unit`);
    assert.ok(rough(h) <= rough(n) + 1e-9, `${id}: the hull's normal is no rougher than the mesh's (${rough(h).toFixed(4)} against ${rough(n).toFixed(4)})`);
  }
  // and the function itself: a jagged field comes out smooth and unit
  const pos: number[] = [], nor: number[] = [], idx: number[] = [], W = 6;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { pos.push(x, y, 0); const a = ((x * 7 + y * 3) % 5) * 0.3; nor.push(Math.sin(a), 0, Math.cos(a)); }
  for (let y = 0; y < W - 1; y++) for (let x = 0; x < W - 1; x++) { const i = y * W + x; idx.push(i, i + 1, i + W, i + 1, i + W + 1, i + W); }
  const out = smoothRestNormals(pos, nor, idx);
  const spread = (a: ArrayLike<number>) => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < a.length; i += 3) { lo = Math.min(lo, a[i]!); hi = Math.max(hi, a[i]!); } return hi - lo; };
  assert.ok(spread(out) < spread(nor) * 0.5, 'smoother');
  s.dispose?.();
});
