// The organ outline is a polyline along the mesh's rim, and the file's rim has a point every 2.5 figure units: on a big screen the ink line that follows it shows its corners as facets (Mohammad 20 Nov: jagged
// organ outlines). refineRim (contour.ts) puts a point on the smooth curve through the rim in the middle of every rim edge (both triangles on it split), so the chords are half as long and the line a truer curve.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BufferGeometry, Float32BufferAttribute } from 'three';
import { ORGAN_MESHES, organsReady, setOrganData } from '../src/scene/organs/meshes.ts';
import { refineRim, rimRoughness, smoothSilhouette } from '../src/scene/organs/contour.ts';

const file = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
setOrganData(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);

const area = (g: BufferGeometry): number => {
  const p = g.getAttribute('position'), idx = g.index!.array;
  let a = 0;
  for (let t = 0; t + 2 < idx.length; t += 3) {
    const i = idx[t]!, j = idx[t + 1]!, k = idx[t + 2]!;
    a += Math.abs((p.getX(j) - p.getX(i)) * (p.getY(k) - p.getY(i)) - (p.getX(k) - p.getX(i)) * (p.getY(j) - p.getY(i))) / 2;
  }
  return a;
};

test('refineRim: every organ keeps a whole surface, gains rim points, and its rim chords shorten', async () => {
  await organsReady;
  for (const [id, make] of Object.entries(ORGAN_MESHES)) {
    const g = make(); smoothSilhouette(g);
    const n0 = g.getAttribute('position').count, a0 = area(g), r0 = rimRoughness(g);
    if (r0 === 0) continue;
    const added = refineRim(g), p = g.getAttribute('position'), idx = g.index!.array;
    assert.ok(added > 0 && p.count === n0 + added, `${id}: ${added} points added`);
    for (let i = 0; i < idx.length; i++) assert.ok(idx[i]! < p.count, `${id}: index in range`);
    for (let i = 0; i < p.count; i++) assert.ok(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i)), `${id}: finite`);
    assert.ok(Math.abs(area(g) - a0) / a0 < 0.01, `${id}: the area is kept (${a0.toFixed(4)} -> ${area(g).toFixed(4)})`);
    assert.ok(rimRoughness(g) <= r0 * 1.05, `${id}: the rim is no rougher (${r0.toFixed(5)} -> ${rimRoughness(g).toFixed(5)})`);
    // the rim is as smooth: its second difference per chord falls (a curve sampled twice as finely bends half as much per step)
    assert.ok(rimRoughness(g) < r0 * 0.75, `${id}: a finer rim bends less per step (${r0.toFixed(5)} -> ${rimRoughness(g).toFixed(5)})`);
  }
});

test('refineRim on a disc: a 24-gon becomes a 48-gon on the same circle, both faces split', () => {
  const N = 24, pos: number[] = [0, 0, 0.1, 0, 0, -0.1], idx: number[] = [];
  for (let k = 0; k < N; k++) { const a = (k / N) * 2 * Math.PI; pos.push(Math.cos(a), Math.sin(a), 0); }
  for (let k = 0; k < N; k++) { const a = 2 + k, b = 2 + ((k + 1) % N); idx.push(0, a, b, 1, b, a); }
  const g = new BufferGeometry(); g.setAttribute('position', new Float32BufferAttribute(pos, 3)); g.setIndex(idx);
  assert.equal(refineRim(g), N);
  assert.equal(g.getAttribute('position').count, 2 + 2 * N);
  assert.equal(g.index!.count, 3 * 4 * N, 'each of the 2N triangles split in two');
  const p = g.getAttribute('position');
  for (let i = 2; i < p.count; i++) assert.ok(Math.abs(Math.hypot(p.getX(i), p.getY(i)) - 1) < 0.01, 'on the circle');
});
