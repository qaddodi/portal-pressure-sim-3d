// The Lobule -> Sinusoid handoff (eyes 20 Nov: a pale washed frame, then a different scene at a different scale): one scale across it, and never both scenes half gone at once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SIN_LOCAL, SIN_REL } from '../src/scene/lobule/frames.ts';
import { LOBULE_R } from '../src/scene/lobule/shots.ts';
import { sinRadius } from '../src/scene/lobule/widths.ts';
import { U } from '../src/scene/sinusoid/view.ts';
import { UM } from '../src/scene/sinusoid/layout.ts';
import { LOBULE_UNDER_FROM, SIN_SHOW_FROM } from '../src/scene/scene.ts';

test('the 3D sinusoid\'s lumen is as wide as the 3D lobule\'s tube it grows out of', () => {
  const rho = Math.hypot(SIN_LOCAL[0], SIN_LOCAL[1]) / LOBULE_R;
  const tube = 2 * sinRadius('s1', rho) * LOBULE_R, lumen = 2 * UM.lum * U * SIN_REL;
  assert.ok(Math.abs(lumen / tube - 1) < 0.05, `lumen ${lumen.toFixed(4)} against tube ${tube.toFixed(4)} (lobule units)`);
});

test('the dive is a focus pull: the picture goes soft, the sinusoid dissolves in inside the blur, then sharpens; the lobule stands aside only once it is whole (Mohammad 20 Nov: "like an old TV")', async () => {
  const { FOCUS } = await import('../src/scene/micro3d/sinusoid3d.ts');
  const { TURN_FROM, TURN_TO } = await import('../src/scene/sinusoid/portrait.ts');
  assert.ok(SIN_SHOW_FROM <= FOCUS[0] && FOCUS[0] < FOCUS[1] && FOCUS[1] < FOCUS[2] && FOCUS[2] <= LOBULE_UNDER_FROM, 'blur, dissolve inside it, then the lobule goes');
  assert.ok(TURN_FROM >= FOCUS[1] && TURN_TO <= FOCUS[2], 'a phone\'s turn happens inside the blur');
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/scene/micro3d/sinusoid3d.ts', import.meta.url), 'utf8');
  assert.match(src, /this\.fade\.value = d == null \? 1 : smooth\(FOCUS\[1\], FOCUS\[2\], d\);/, 'dissolves in inside the blur');
  assert.match(src, /const open = d == null \? 1 : smooth\(FOCUS\[2\], 1, d\);/, 'then sharpens to its own band');
  assert.match(src, /return d == null \? this\.fade\.value : smooth\(FOCUS\[0\], FOCUS\[1\], d\);/, 'the blur comes in first');
  const { MICRO_FS } = await import('../src/scene/micro3d/cel3d.ts');
  assert.doesNotMatch(MICRO_FS, /unrevealed/, 'no window, band or disc');
});
