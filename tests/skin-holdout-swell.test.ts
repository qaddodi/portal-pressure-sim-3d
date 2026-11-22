// "The collaterals' arms at the azygos are thin spikes, the tubes cut short with a ribbon between" (Mohammad, 22 Nov, Budd-Chiari). ROOT CAUSE: the outline's depth hold-out (skin/shaders.ts skinArmPx) measured the pixel's REST
// surface (a whole radius out of the arm's axis) against the arm's capsule at its LIVE width. An arm narrower than it was built (a collateral at swell 0.53, the cava at 0.72) put its own rest surface 1 - swell radii outside its
// capsule, so the arm was held out of the union at its own pixels and the band dropped them. The gap is now judged against the rest capsule, whatever the engine's width.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sd3 } from './skin-gate-lib.ts';
import type { ArmAxis } from '../src/scene/vessels/skin/skin-object.ts';

const axis = { pts: [[0, 0, 0], [0, 0.02, 0], [0, 0.06, 0], [0, 0.1, 0]], radii: [0.0105, 0.0105, 0.0157, 0.0157] } as unknown as ArmAxis;

test('a pixel on an arm\'s own rest surface is no distance from its rest capsule, however narrow the arm is live', () => {
  const rest = [0.0157, 0.08, 0];   // (on the rest surface, a whole radius out of the axis)
  assert.ok(Math.abs(sd3(axis, rest, 1)) < 1e-9, 'at rest it lies on the capsule');
  assert.ok(sd3(axis, rest, 0.53) > 0.006, 'against the live capsule at swell 0.53 it lay 0.47 radii outside: the bug');
});

test('the shader judges the hold-out against the rest capsule (swell 1), and the live width only draws the arm', () => {
  const src = readFileSync(new URL('../src/scene/vessels/skin/shaders.ts', import.meta.url), 'utf8');
  assert.ok(src.includes('float gap = skinArmSd3(fragP, arm, 1.0, g3, r3)'), 'the gap is measured at the arm\'s rest width');
  assert.ok(!/skinArmSd3\(fragP, arm, swell/.test(src), 'never at the live width');
});
