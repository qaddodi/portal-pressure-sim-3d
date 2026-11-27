// THE SKIN'S WALL RULE FOR THE FLOW HEADS (skin/head-wall.ts). A head stops short of the ink: whole to 0.90 of the way to the wall, gone by 0.96. On a TUBE the way to the wall is the pixel's ACROSS (the mesh normal's component on the
// screen's sideways axis): the lateral position over the half width, ink included. On a SKIN the same number is only true inside an arm's own cylinder, so the skin asks the pixel's own distance to the outline (skin/head-wall.ts), which is
// the tube's across on a cylinder and 1 at the line's outer edge wherever the outline runs.
// Run: node --test tests/skin-head-wall.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKIN_FS, SKIN_VS } from '../src/scene/vessels/skin/shaders.ts';
import { HEAD_WALL_FROM, HEAD_WALL_GLSL, HEAD_WALL_TO, SKIN_WALL_GLSL, headWall, skinWallJs } from '../src/scene/vessels/skin/head-wall.ts';
import { CEL_STYLE } from '../src/scene/cel-style.ts';

test('the wall rule is written once and the skin applies it to its heads by the pixel\'s own distance to the outline', () => {
  assert.equal(HEAD_WALL_FROM, 0.9); assert.equal(HEAD_WALL_TO, 0.96);
  assert.equal(HEAD_WALL_GLSL, 'float headWall(float e) { return 1.0 - smoothstep(0.90, 0.96, abs(e)); }');
  assert.equal((SKIN_FS.match(/smoothstep\(0\.90, 0\.96/g) ?? []).length, 1, 'the 0.90 to 0.96 ramp stands in headWall only');
  assert.ok(SKIN_FS.includes(HEAD_WALL_GLSL), 'the skin carries the rule');
  assert.ok(SKIN_FS.includes(SKIN_WALL_GLSL), 'the skin carries the wall coordinate\'s GLSL');
  const fs = SKIN_FS.slice(SKIN_FS.indexOf('void main()'));
  const wall = fs.indexOf('headAcc *= headWall(skinWall(rCssAx * dpr, sdPx, inkDev));');
  assert.ok(wall > 0, 'the skin\'s heads are gated by the wall coordinate (the lumen\'s radius, the outline\'s distance and the line, device px)');
  assert.ok(wall < fs.indexOf('c = c * (1.0 - headAcc.a) + headAcc.rgb;'), 'and that is before the heads are laid on the body');
  assert.equal(headWall(0), 1); assert.equal(headWall(HEAD_WALL_TO), 0); assert.equal(headWall(-1), 0);
});

test('on a cylinder the skin\'s wall coordinate IS the tube\'s across: lateral position over the half width, ink included (so a seam ring gates a head as the tube past it does)', () => {
  for (const R of [8, 20, 60, 140]) {
    const ink = Math.min(CEL_STYLE.LINE_MAX, Math.max(CEL_STYLE.LINE_MIN, CEL_STYLE.LINE_R * R));
    for (const x of [0, 0.3 * R, 0.8 * R, 0.9 * R, R, R + ink]) {
      const sd = x - R;   // the outline's signed distance from a lateral position x of a cylinder of radius R
      assert.ok(Math.abs(skinWallJs(R, sd, ink) - x / (R + ink)) < 1e-12, `R ${R} x ${x}`);
    }
    assert.ok(Math.abs(skinWallJs(R, 0, ink) - R / (R + ink)) < 1e-12, 'on the outline it is R over R + ink: the tube\'s own');
    assert.equal(skinWallJs(R, R + ink, ink), 1, 'the line\'s outer edge');
    assert.equal(skinWallJs(R, -3 * R, ink), 0, 'deep in a crotch, nowhere near any wall');
  }
});

test('the position the fragment stage reads is the position the vertex is drawn at (vPos is the morphed rest position)', () => {
  assert.match(SKIN_VS, /vPos = pos;/, 'vPos is the morphed rest position');
  assert.doesNotMatch(SKIN_VS, /vPos = position;/);
});
