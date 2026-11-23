// Plan 24 (Mohammad 22 Nov: "why doesn't the fibrous bands inside the central vein look like the fibrous bands outside it"), now by cv-band.ts: the same one band inside the wall and outside it (the shape and numbers: tests/cv-band.test.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BufferGeometry } from 'three';
import { buildCvScar } from '../src/scene/micro3d/lobule3d.ts';
import { CV_MESH_IN, CV_WALL, cvScarGrowth } from '../src/scene/lobule/cv-intima.ts';
import { LOBULE_PLATE_FS, LOBULE_SCAR_VS } from '../src/scene/lobule/plate.ts';

test('the scar mesh is a plain annulus from CV_MESH_IN of the wall to just short of it (the round lumen is the shader\'s, no lobes in the mesh)', () => {
  const rw = 0.21, g = new BufferGeometry(); buildCvScar(g, rw, 0.03);
  const pos = g.getAttribute('position')!;
  let lo = 9, hi = 0;
  for (let i = 0; i < pos.count; i++) { const r = Math.hypot(pos.getX(i), pos.getY(i)); lo = Math.min(lo, r); hi = Math.max(hi, r); assert.ok(Math.abs(pos.getZ(i) - 0.03) < 1e-6, 'one layer'); }
  assert.ok(Math.abs(lo - rw * CV_MESH_IN) < 1e-6 && Math.abs(hi - rw * CV_WALL) < 1e-6, `${lo} ${hi}`);
  assert.ok(CV_WALL < 1 && CV_WALL > 0.99);
  assert.equal(cvScarGrowth(0), 0);
});

test('the scar\'s shader is the plate\'s: the plate\'s own band function, laid over the pool\'s tone from its own place on the plate, whole', () => {
  assert.match(LOBULE_PLATE_FS, /uBase \* \(1\.0 - CV_A\) \+ bc \* CV_A/, 'the band laid over the tissue\'s tone, whole (no see-through)');
  assert.match(LOBULE_PLATE_FS, /cvRelief\(cvR,/);
  assert.match(LOBULE_SCAR_VS, /vUv = position\.xy \/ uSide \+ 0\.5/);
});

test('the scar material has no flat tint and samples the plate\'s textures, shared with the marks', async () => {
  const src = (await import('node:fs')).readFileSync(new URL('../src/scene/micro3d/lobule3d.ts', import.meta.url), 'utf8');
  assert.match(src, /\.\.\.this\.marksMat\.uniforms, opacity: \{ value: 0 \}, uBaseK: \{ value: 1 \}, uScarK: \{ value: 1 \}/);
  assert.doesNotMatch(src, /CV_SCAR_ALPHA/);
  assert.doesNotMatch(src, /mk\('central-vein-scar'/);
});

test('GLSL: the plate shader and the scar vertex shader parse', async () => {
  let parse: ((s: string) => unknown) | null = null;
  const name = '@shaderfrog/glsl-parser';
  try { const m = await import(name); parse = (s) => m.parser.parse(s, { quiet: true }); } catch { /* not installed */ }
  if (!parse) return;
  parse(LOBULE_SCAR_VS.replace(/^\n/, ''));
  parse(LOBULE_PLATE_FS.replace(/^\n/, '').replace(/^#include.*$/gm, ''));
});
