// The organs' depth (z.ts) and the outline's smooth normal (normal-smooth.ts, the hull's sawtooth halo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ORGAN_Z } from '../src/scene/organs/z.ts';
import { TIER_Z, x3 } from '../src/scene/frame2d.ts';
import { ORGAN_STYLE } from '../src/scene/organs/layer.ts';
import { organsReady, setOrganData, ORGAN_MESHES } from '../src/scene/organs/meshes.ts';
import { CelScene } from '../src/scene/scene.ts';
import { smoothRestNormals } from '../src/scene/organs/normal-smooth.ts';
import { ORGAN_INK_VS } from '../src/scene/organs/organ-shader.ts';

const file = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
setOrganData(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);

test('organ depth: the liver is in front of the stomach (and the heart), the kidney is at the IVC\'s depth, every organ has one', () => {
  assert.ok(ORGAN_Z.liver! > ORGAN_Z.stomach!, 'liver in front of the stomach');
  assert.ok(ORGAN_Z.liver! > ORGAN_Z.heart! && ORGAN_Z.liver! > ORGAN_Z['heart-ra']!);
  assert.equal(ORGAN_Z['kidney-l'], TIER_Z.back, 'the kidney lies where the cava and the renal veins lie (the back tier)');
  assert.ok(ORGAN_Z.spleen! < ORGAN_Z.stomach!, 'the spleen lies behind the stomach');
  assert.ok(ORGAN_Z.bowel! < ORGAN_Z.liver! && ORGAN_Z.colon! < ORGAN_Z.liver!, 'the gut lies behind the liver');
  for (const id of Object.keys(ORGAN_STYLE)) assert.ok(typeof ORGAN_Z[id] === 'number', `${id} has a z`);
});

test('organ depth: each mesh is moved along z only, x and y exact, and the front face stays behind the vessels\' arteries', async () => {
  await organsReady;
  const s = new CelScene();
  s.disease.organs.build();
  for (const [id, o] of s.disease.organs.byId) {
    const g = o.toonMesh.geometry, rest = ORGAN_MESHES[id]!(), a = g.getAttribute('position'), b = rest.getAttribute('position');
    let zmin = Infinity, zmax = -Infinity;
    for (let i = 0; i < a.count; i++) {
      assert.ok(Math.abs(a.getX(i) - b.getX(i)) < 1e-6 && Math.abs(a.getY(i) - b.getY(i)) < 1e-6, `${id}: x and y exact`);
      assert.ok(Math.abs(a.getZ(i) - b.getZ(i) - ORGAN_Z[id]!) < 1e-5, `${id}: z moved by its table value`);
      zmin = Math.min(zmin, a.getZ(i)); zmax = Math.max(zmax, a.getZ(i));
    }
    assert.ok(zmax < TIER_Z.art, `${id}: its front (${zmax.toFixed(2)}) stays behind the arteries (${TIER_Z.art})`);
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
