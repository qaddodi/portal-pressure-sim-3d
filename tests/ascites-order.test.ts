// The pool is painted over the organ plate and the vessels in 2D (veins-gl.js fluidAt), and the AO seat fades with the organ's line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AscitesLayer, POOL_ORDER, POOL_ROWS } from '../src/scene/disease/ascites.ts';
import { ORGAN_ORDER } from '../src/scene/organs/layer.ts';
import { patchedShaders } from '../src/scene/organs/organ-art.ts';
import { INK_FS } from '../src/scene/materials/shaders.ts';
import { ORGAN_INK_VS } from '../src/scene/organs/organ-shader.ts';

test('the pool is drawn after every organ and its ink, ignoring depth', () => {
  assert.ok(POOL_ORDER > 2 * (ORGAN_ORDER.length - 1) + 1);
  const m = new AscitesLayer().group.children[0] as any;
  assert.equal(m.renderOrder, POOL_ORDER);
  assert.equal(m.material.depthTest, false);
});
test('the AO seat takes the end fade the outline takes', () => {
  const p = patchedShaders(ORGAN_INK_VS, INK_FS, ORGAN_INK_VS, INK_FS, { art: false, eso: null, fade: true });
  assert.match(p.inkFs, /gl_FragColor\.a \*= vEsoA/);
});
test('the pool is a basin: its last row lies on the cavity floor, far below its 28-unit ramp', () => {
  const a = new AscitesLayer(); a.set(5000);
  const pos = (a.group.children[0] as any).geometry.getAttribute('position');
  const ROWS = POOL_ROWS, mid = 52 * ROWS;
  const top = pos.getY(mid), floor = pos.getY(mid + ROWS - 1);
  assert.ok(top - floor > 100 / 300, `top ${top} floor ${floor}`);
});
