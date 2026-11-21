// The wedge's amber is ONE field: the junction skins carry it as the tubes do (root cause of the hard amber edge at the RHV/MHV join: the skins had no wedge tint at all, so they stayed blue between amber tubes), and
// a skin takes the distance of its arms' seams, so the one front runs through it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wedgeSeamD } from '../src/scene/vessels/skin/arm-twins.ts';
import { WEDGE_ABSENT, wedgeCover } from '../src/scene/vessels/wedge-glsl.ts';

const src = (p: string): string => readFileSync(new URL(`../src/scene/vessels/${p}`, import.meta.url), 'utf8');

test('an arm\'s seam value is its tube\'s own distance line; an arm with no wedge is absent', () => {
  assert.equal(wedgeSeamD({ x: 1 }, { x: 10, y: -4 }, 0.25), 9);
  assert.equal(wedgeSeamD({ x: 0 }, { x: 10, y: -4 }, 0.25), WEDGE_ABSENT);
});

test('the cover is whole from the balloon\'s edge to just behind the front, softly gone behind the edge and by the front', () => {
  assert.equal(wedgeCover(5, 2, 20, 4), 1);
  assert.equal(wedgeCover(-3, 2, 20, 4), 0);
  assert.equal(wedgeCover(21, 2, 20, 4), 0);
  const edge = wedgeCover(18, 2, 20, 4);
  assert.ok(edge > 0.05 && edge < 0.95, `a gradient at the front, ${edge}`);
  let prev = wedgeCover(0, 2, 20, 4), maxStep = 0;
  for (let d = 0.01; d <= 24; d += 0.01) { const c = wedgeCover(d, 2, 20, 4); maxStep = Math.max(maxStep, Math.abs(c - prev)); prev = c; }
  assert.ok(maxStep < 0.03, `step ${maxStep}`);
});

test('the skin blends its arms\' seam distances and tints with the tube\'s 0.78, in every skin and arm', () => {
  const sh = src('skin/shaders.ts'), obj = src('skin/skin-object.ts'), set = src('skin/skin-set.ts'), tube = src('shaders.ts');
  assert.match(sh, /uniform vec4 armWedge\[2\]/);
  assert.match(sh, /dwS \+= wi \* wdI/);
  assert.match(sh, /mix\(c, wedgeColS, 0\.78 \* waS\)/);
  assert.match(tube, /mix\(c, wedgeCol, 0\.78 \* wa\)/, 'the same 0.78 as the tube');
  assert.match(obj, /armWedge: \{ value/);
  assert.match(set, /wedgeSeamD\(/);
  assert.match(set, /setWedge\?\.\(k, wsd/);
});
