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

test('the lobule stands aside only once the sinusoid is whole over it, and the sinusoid grows out from its lumen, never a whole-frame crossfade (eyes 20 Nov: two scenes at once)', async () => {
  const { REVEAL_FROM, REVEAL_TO } = await import('../src/scene/micro3d/sinusoid3d.ts');
  assert.ok(REVEAL_FROM >= SIN_SHOW_FROM && LOBULE_UNDER_FROM >= REVEAL_TO, `sinusoid whole by ${REVEAL_TO}, lobule goes from ${LOBULE_UNDER_FROM}`);
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/scene/micro3d/sinusoid3d.ts', import.meta.url), 'utf8');
  assert.match(src, /this\.fade\.value = d == null \|\| d >= REVEAL_FROM \? 1 : 0;/, 'no dissolve of the whole frame');
  assert.match(src, /this\.reveal\.value = d == null \? 0 : Math\.max\(1e-3, across\);/, 'grows out from the channel');
  assert.match(src, /lerp\(REVEAL_CHANNEL, ACROSS \+ 30,/, 'the channel first, then across');
  assert.match(src, /this\.revealAx\.value = d == null \? 1 : Math\.max\(1, \(REACH \+ 30\) \/ Math\.max\(across, 1e-3\)\);/, 'along the whole channel at once (not a disc)');
  const { MICRO_FS, MICRO_INK_FS } = await import('../src/scene/micro3d/cel3d.ts');
  assert.match(MICRO_FS, /if \(unrevealed\(vP\.xy\)\) discard;/); assert.match(MICRO_INK_FS, /if \(unrevealed\(vXY\)\) discard;/);
});
