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

test('the lobule stands aside only once the sinusoid is whole over it', async () => {
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/scene/micro3d/sinusoid3d.ts', import.meta.url), 'utf8');
  const m = /this\.fade\.value = d == null \? 1 : smooth\(([\d.]+), ([\d.]+), d\)/.exec(src)!;
  assert.ok(m, 'the sinusoid fades in on the dive share');
  assert.ok(Number(m[1]) >= SIN_SHOW_FROM && LOBULE_UNDER_FROM >= Number(m[2]), `sinusoid whole by ${m[2]}, lobule goes from ${LOBULE_UNDER_FROM}`);
});
