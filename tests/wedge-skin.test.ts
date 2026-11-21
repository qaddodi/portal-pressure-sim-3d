// The wedge's amber is ONE field: the junction skins carry it as the tubes do (root cause of the hard amber edge at the RHV/MHV join:
// the skins had no wedge tint at all, so they stayed blue between amber tubes).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wedgeShareAt } from '../src/scene/vessels/skin/arm-twins.ts';

const src = (p: string): string => readFileSync(new URL(`../src/scene/vessels/${p}`, import.meta.url), 'utf8');

test('the seam share is the tube formula: whole up to the cut, a gradient past it, nothing beyond', () => {
  const w = [1, 0.6, 0.3, 0] as const, b = [0.1, -1, 0.02] as const;
  assert.equal(wedgeShareAt(w, b, 0.2), 1);
  const mid = wedgeShareAt(w, b, 0.65);
  assert.ok(mid > 0.05 && mid < 0.95, `a gradient across the cut, got ${mid}`);
  assert.equal(wedgeShareAt(w, b, 0.9), 0);
  assert.equal(wedgeShareAt([0, 0.6, 0, 0], b, 0.2), 0);
});

test('the tint rises smoothly (no step) across the cut', () => {
  const w = [1, 0.5, 0, 0] as const, b = [0.12, -1, 0.02] as const;
  let prev = wedgeShareAt(w, b, 0.4), maxStep = 0;
  for (let u = 0.401; u <= 0.7; u += 0.001) { const s = wedgeShareAt(w, b, u); maxStep = Math.max(maxStep, Math.abs(s - prev)); prev = s; }
  assert.ok(maxStep < 0.03, `step ${maxStep}`);
});

test('the filling front and the branch fade follow the tube', () => {
  const b = [0.1, 0.4, 0.05] as const;
  assert.equal(wedgeShareAt([1, 2, 0, 0], b, 0.6), 1);   // the column has come this far
  assert.equal(wedgeShareAt([1, 2, 0, 0], b, 0.1), 0);   // the front has not reached the outer end yet
  assert.ok(wedgeShareAt([1, 2, 0.5, 1], [0.1, -1, 0.02], 0.1) < 0.6, 'a branch tint thins toward its tip');
});

test('the skin shader, object and set carry the tint (every skin, every arm)', () => {
  const sh = src('skin/shaders.ts'), obj = src('skin/skin-object.ts'), set = src('skin/skin-set.ts'), tube = src('shaders.ts');
  assert.match(sh, /uniform float armWedge\[/);
  assert.match(sh, /BLEND\('armWedge'\)/);
  assert.match(sh, /mix\(c, wedgeColS, 0\.78 \* waS\)/);
  assert.match(tube, /mix\(c, wedgeCol, 0\.78 \* wa\)/, 'the same 0.78 as the tube');
  assert.match(obj, /armWedge: \{ value/);
  assert.match(set, /wedgeShareAt\(/);
  assert.match(set, /setWedge\?\.\(i, ws/);
});
