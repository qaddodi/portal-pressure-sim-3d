// Review 21 Nov #11 and #12: the 3D lobule and sinusoid are built lazily (idle slot, or the first dive), their programs compiled off the frame once they exist; the red cell is a 16-segment lathe.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { unitRbc } from '../src/scene/micro3d/cel3d.ts';
import { RBC_SEG } from '../src/scene/micro3d/sinusoid3d.ts';

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const scene = strip(readFileSync('src/scene/scene.ts', 'utf8'));
const stage = readFileSync('src/scene/Stage.tsx', 'utf8');

test('the scene does not construct the 3D parts in its constructor', () => {
  assert.equal((scene.match(/new Sinusoid3D\(/g) ?? []).length, 1);
  assert.equal((scene.match(/new Lobule3D\(/g) ?? []).length, 1);
  const build = scene.slice(scene.indexOf('private buildMicro()'), scene.indexOf('buildMicroIdle()'));
  assert.match(build, /new Sinusoid3D\(/); assert.match(build, /new Lobule3D\(/);
});

test('a view change to the lobule or sinusoid builds them before anything draws', () => {
  assert.match(scene, /if \(v === 'lobule' \|\| v === 'sinusoid'\) this\.buildMicro\(\);/);
  assert.match(scene, /get sinus3d\(\): Sinusoid3D \{ return this\.buildMicro\(\)\.sinus; \}/);
  assert.match(scene, /get lobule3d\(\): Lobule3D \{ return this\.buildMicro\(\)\.lobule; \}/);
});

test('the per-frame paths never force the build', () => {
  assert.match(scene, /this\.micro !== null && this\.lobule3d\.update\(/);
  assert.match(scene, /this\.micro !== null && this\.sinus3d\.update\(/);
  assert.match(scene, /this\.micro\?\.lobule\.setDpr\(dpr\)/);
  assert.doesNotMatch(scene.replace(/get (sinus|lobule)3d\(\)[^\n]*/g, ''), /this\.(sinus3d|lobule3d)\.(dispose|setDpr|focusBand|focusOpen|pinTraffic|holdScale)/);
});

test('the dpr seen before the build is applied when it happens', () => {
  assert.match(scene, /if \(this\.microDpr\) lobule\.setDpr\(this\.microDpr\)/);
});

test('Stage compiles the programs when they appear, and asks for the idle build after the first warm', () => {
  assert.match(stage, /cel\.onMicroBuilt = warm/);
  assert.match(stage, /warm\(\); cel\.buildMicroIdle\(\)/);
});

test('the red cell has 16 segments and well under half its old triangles', () => {
  assert.equal(RBC_SEG, 16);
  const tris = (seg: number) => unitRbc(seg).getIndex()!.count / 3;
  assert.ok(tris(RBC_SEG) <= tris(40) * 0.41, `${tris(RBC_SEG)} vs ${tris(40)}`);
  const g = unitRbc(RBC_SEG), p = g.getAttribute('position');
  let maxR = 0, minR = 9; for (let i = 0; i < p.count; i++) { const r = Math.hypot(p.getX(i), p.getY(i)); maxR = Math.max(maxR, r); if (r > 0.99) minR = Math.min(minR, r); }
  assert.ok(Math.abs(maxR - 1) < 1e-6, 'unit radius kept');
});
