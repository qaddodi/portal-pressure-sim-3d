// An organ's glow (and its AO seat) is ONE soft hull with ONE monotonic ramp, never stacked flat hulls (Mohammad, 22 Nov: the glow round a selected organ was about six hard concentric bands).
// ROOT CAUSE: the glow was five hull shells, each a flat plateau of alpha with only a one-pixel edge (26 / 19 / 13 / 8 / 4 units at 0.05 .. 0.2): stacked, they are a staircase, and a staircase of
// a few levels each is a band on a dark ground. The ramp itself must also span the whole hull at every zoom (vW), and the ring count it reads must reach across it (RING_CAP).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { INK_FS } from '../src/scene/materials/shaders.ts';
import { ORGAN_INK_VS } from '../src/scene/organs/organ-shader.ts';
import { ORGAN_GLOW, GLOW_DEFINES } from '../src/scene/highlight.ts';
import { RING_CAP, ringDistance, refineRim, smoothSilhouette } from '../src/scene/organs/contour.ts';
import { ORGAN_MESHES, organsReady, setOrganData } from '../src/scene/organs/meshes.ts';

const file = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
setOrganData(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);

test('the glow is one hull with one alpha, and a program that ramps it (INK_GLOW)', () => {
  assert.equal(typeof ORGAN_GLOW.out, 'number'); assert.equal(typeof ORGAN_GLOW.alpha, 'number');
  assert.ok(!Array.isArray(ORGAN_GLOW), 'not a list of stacked shells');
  assert.ok('INK_GLOW' in GLOW_DEFINES && 'INK_EDGE' in GLOW_DEFINES);
  assert.match(INK_FS, /#if defined\(INK_SEAT\) \|\| defined\(INK_GLOW\)[\s\S]*float sk = clamp\(dev \/ max\(vW, 1\.0\), 0\.0, 1\.0\);/);
  assert.match(INK_FS, /#else\s+cov \*= sk \* sk;/);
});

test('the ramp spans the hull\'s own width at every zoom: the vertex stage hands the fragment stage the hull\'s width in device pixels', () => {
  assert.match(ORGAN_INK_VS, /varying float vW;/);
  assert.match(ORGAN_INK_VS, /vW = w \* dpr;/);
  assert.match(INK_FS, /varying float vW;/);
  assert.doesNotMatch(INK_FS, /\(px \+ 1\.0 \/ max\(dpr, 1\.0\)\) \* max\(dpr, 1\.0\)/, 'no fixed pixel count for the ramp: it is the hull\'s own width');
});

test('the glow\'s fall is smooth: the JS twin of the ramp never steps and never rises going out, and it holds a tail to the hull\'s outer edge', () => {
  const fall = (sk: number) => ORGAN_GLOW.alpha * sk * sk;   // (INK_FS: cov *= sk * sk, sk 1 at the outline and 0 at the hull's outer edge)
  let last = fall(1);
  assert.ok(Math.abs(last - ORGAN_GLOW.alpha) < 1e-12, 'full at the outline');
  const N = 400;
  for (let i = 1; i <= N; i++) {
    const a = fall(1 - i / N);
    assert.ok(a <= last + 1e-12, 'never rises going out');
    assert.ok(last - a < 0.012, `no step (${(last - a).toFixed(4)} at ${i}/${N}): a single plateau edge of the old stack was 0.05 to 0.2`);
    last = a;
  }
  assert.equal(fall(0), 0, 'nothing at the outer edge');
});

test('no code stacks flat hulls into a glow: a shell list with an alpha each is the staircase this fixes', () => {
  const hl = readFileSync('src/scene/highlight.ts', 'utf8');
  assert.doesNotMatch(hl, /\{ out: \d+, alpha: [\d.]+ \}, \{ out:/, 'a table of shells');
  assert.doesNotMatch(hl, /ORGAN_GLOW\.map|ORGAN_GLOW\.length/);
});

test('the ring count the ramp reads reaches across the whole glow hull (a cap of 3 made the ramp end in a hard step a few steps in)', async () => {
  await organsReady;
  assert.ok(RING_CAP >= 32, `RING_CAP ${RING_CAP}`);
  const g = ORGAN_MESHES['liver']!(); smoothSilhouette(g); refineRim(g);
  const d = ringDistance(g);
  let max = 0;
  for (const v of d) { assert.ok(v >= 0 && v <= RING_CAP); if (v > max) max = v; }
  assert.ok(max > 10, `the liver counts steps well past 3 (${max}), so a ramp over a wide hull has numbers to run on`);
});
