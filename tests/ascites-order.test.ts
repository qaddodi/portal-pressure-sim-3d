// The pool is painted over the organ plate and the vessels in 2D (veins-gl.js fluidAt), and the AO seat fades with the organ's line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AscitesLayer, POOL_ORDER, SHELL_BACK_ORDER } from '../src/scene/disease/ascites.ts';
import { GUT_RENDER, ORGAN_ORDER } from '../src/scene/organs/layer.ts';
import { patchedShaders } from '../src/scene/organs/organ-art.ts';
import { INK_FS } from '../src/scene/materials/shaders.ts';
import { ORGAN_INK_VS } from '../src/scene/organs/organ-shader.ts';

test('the pool is drawn after every organ and its ink, ignoring depth', () => {
  // an organ's ink is drawn at 2 * its place + 1, but the gut (colon, bowel) is blended in its own order (GUT_RENDER): the last draw is the larger of the two
  const lastInk = Math.max(...ORGAN_ORDER.map((id, i) => GUT_RENDER[id]?.ink ?? 2 * i + 1));
  assert.ok(POOL_ORDER > lastInk, `the pool (${POOL_ORDER}) is drawn after the last organ ink (${lastInk})`);
  const [back, front] = new AscitesLayer().group.children as any[];
  assert.equal(front.renderOrder, POOL_ORDER);
  assert.equal(front.material.depthTest, false);
  assert.equal(back.renderOrder, SHELL_BACK_ORDER, 'the back sheet is drawn before the organs, so they sit in the water');
  assert.ok(back.material.side === 1 && front.material.side === 0, 'BackSide draws the back sheet, FrontSide the front sheet and the lid');
  assert.equal(back.geometry, front.geometry, 'one hull geometry, two materials');
});
test('the AO seat takes the end fade the outline takes', () => {
  const p = patchedShaders(ORGAN_INK_VS, INK_FS, ORGAN_INK_VS, INK_FS, { art: false, eso: null, fade: true });
  assert.match(p.inkFs, /gl_FragColor\.a \*= vEsoA/);
});
test('the water is a basin: the hull reaches the cavity floor, far below the 28-unit ramp', () => {
  const a = new AscitesLayer(); a.set(5000);
  const pos = (a.group.children[1] as any).geometry.getAttribute('position'), n = 20, mid = 48 * n;   // (NT rows per column)
  const top = pos.getY(mid), floor = pos.getY(mid + n - 1);
  assert.ok(top - floor > 100 / 300, `top ${top} floor ${floor}`);
});
