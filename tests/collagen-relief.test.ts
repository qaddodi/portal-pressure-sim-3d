// Fibrosis is mock C "Raised relief" (Mohammad, 23 Nov 2026; docs/approved/fibrosis.md): the painter's soft cream passes and fibre streaks as painted, the faint passes' alpha
// softened by a coarser copy of itself, a subtle relief from the slope of the height against the one light, no cel step, no edge line and no glow on the collagen.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOBULE_PLATE_FS } from '../src/scene/lobule/plate.ts';
import { COLL_RELIEF_G, RELIEF_D_PX, RELIEF_LOD, reliefColour } from '../src/scene/lobule/relief.ts';
import { badSamplers, usedBeforeDeclared } from './gl-undeclared.ts';

test('the plate shader reads each declared name after its declaration, and every sampler call is well formed', () => {
  assert.deepEqual(usedBeforeDeclared(LOBULE_PLATE_FS), []);
  assert.deepEqual(badSamplers(LOBULE_PLATE_FS), []);
});

test('the collagen keeps the painter\'s own colour and only its faint passes\' alpha is softened (mip 3), the dense core as painted', () => {
  assert.match(LOBULE_PLATE_FS, /vec4 softPass\(vec4 sharp, vec4 soft\)/);
  assert.match(LOBULE_PLATE_FS, /smoothstep\(0\.35, 0\.75, sharp\.a\)/);
  assert.match(LOBULE_PLATE_FS, /cs = softPass\(cs, collAt\(uvS, 3\.0\)\)/);
  assert.match(LOBULE_PLATE_FS, /cu = softPass\(cu, collAt\(uvT, 3\.0\)\)/);
});

test('the relief is read from a coarse mip before the dissolve\'s discard, and shades the collagen only by its coverage (no cel step, no edge line over it)', () => {
  const at = (re: RegExp): number => LOBULE_PLATE_FS.search(re);
  assert.ok(at(/reliefSlope\(vUv, fr\)/) > 0 && at(/reliefSlope\(vUv, fr\)/) < at(/if \(fadedOut\(\)\) discard;/), 'the relief samples come before the first discard');
  assert.match(LOBULE_PLATE_FS, /float kc = smoothstep\(0\.0, 0\.2, cov\)/);
  assert.match(LOBULE_PLATE_FS, /\(1\.0 - kc\)\);/, 'the plate edge line is weighted out over the collagen');
  assert.match(LOBULE_PLATE_FS, /cf = mix\(cf, reliefColour\(cf, rs\), kc\)/);
  assert.equal(RELIEF_LOD, 4);
  assert.equal(RELIEF_D_PX, 8, 'half a mip-4 texel: the slope never aliases into stripes');
  assert.ok(COLL_RELIEF_G > 0 && COLL_RELIEF_G < 100, 'the gain is the mock\'s subtle one');
});

test('healthy tissue is untouched: no relief colour change at s = 0, lit side lighter, shade side deeper, always in range', () => {
  const c = [0.76, 0.69, 0.57];
  assert.deepEqual(reliefColour(c, 0), c);
  const lit = reliefColour(c, 1), shade = reliefColour(c, -1);
  for (let i = 0; i < 3; i++) { assert.ok(lit[i]! >= c[i]! && lit[i]! <= 1); assert.ok(shade[i]! <= c[i]! && shade[i]! >= 0); }
  assert.ok(lit[0]! + lit[1]! + lit[2]! > c[0]! + c[1]! + c[2]!);
  assert.ok(shade[0]! + shade[1]! + shade[2]! < c[0]! + c[1]! + c[2]!);
});
