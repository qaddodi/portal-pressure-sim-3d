// The blood's streaks (Mohammad, 20 Nov: "wtf are those bubbles... make them streaks with laminar flow and turbulence"): fine lines along the flow, not discs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CELLS_FS, CELLS_VS } from '../src/scene/blood/cells/shader.ts';
import { STREAK, layoutCells } from '../src/scene/blood/cells/core.ts';

const have = spawnSync('glslangValidator', ['--version']).status === 0;
const COMMON = ['#version 300 es', 'precision highp float;', 'precision highp int;', 'precision highp sampler2D;', 'uniform mat4 modelMatrix;', 'uniform mat4 modelViewMatrix;', 'uniform mat4 projectionMatrix;', 'uniform mat4 viewMatrix;', 'uniform mat3 normalMatrix;', 'uniform vec3 cameraPosition;'];
const VS_PREFIX = [...COMMON, 'in vec3 position;', 'in vec3 normal;', 'in vec2 uv;', '#define attribute in', '#define varying out'].join('\n');
const FS_PREFIX = [...COMMON, 'layout(location = 0) out highp vec4 pc_fragColor;', '#define gl_FragColor pc_fragColor', '#define varying in', '#define texture2D texture'].join('\n');
function compile(stage: 'vert' | 'frag', source: string): { ok: boolean; log: string } {
  const file = join(mkdtempSync(join(tmpdir(), 'glsl-')), `s.${stage}`);
  writeFileSync(file, `${stage === 'vert' ? VS_PREFIX : FS_PREFIX}\n${source}`);
  const r = spawnSync('glslangValidator', ['-S', stage, file], { encoding: 'utf8' });
  return { ok: r.status === 0, log: r.stdout + r.stderr };
}

test('the streak programs compile (glslangValidator)', { skip: !have }, () => {
  const v = compile('vert', CELLS_VS); assert.ok(v.ok, v.log);
  const f = compile('frag', CELLS_FS); assert.ok(f.ok, f.log);
});

test('a streak is a long soft-ended lozenge along the flow, not a disc nor a dash: widest in the middle, a point at both ends, the same both ways, no ink ring, no particle size', () => {
  assert.match(CELLS_FS, /vec2 p = vec2\(dot\(q, vDir\)/, 'drawn in its own axes');
  assert.match(CELLS_FS, /float w = 0\.5 \* vThick \* pow\(max\(1\.0 - x \* x, 0\.0\), 0\.75\);/, 'a lozenge: the width tapers to nothing at both ends');
  assert.match(CELLS_FS, /\(1\.0 - smoothstep\(0\.84, 1\.0, x\)\)/, 'the tips fade out');
  assert.doesNotMatch(CELLS_FS, /float head|\bhl\b|length\(vec2\(max|TAIL/, 'no head, no tail, no capsule end');
  assert.doesNotMatch(CELLS_FS, /inkCol|inkA|\bring\b/, 'no outlined disc');
  assert.match(CELLS_VS, /vDir = dir;/);
  assert.doesNotMatch(CELLS_VS, /MAX_CSS|diaCss/);
});

test('laminar: the speed share across the tube is parabolic, fastest in the middle, slowest at the wall, with the mean the stream\'s own', () => {
  assert.match(CELLS_VS, /float prof = 1\.5 \* \(1\.0 - aB\.y \* aB\.y\);/);
  assert.match(CELLS_VS, /stm\.x \/ Lw \* \(/);
  // the advance factor WALL + (1 - WALL) * prof: mean over the section is 1 (the mean of prof over a section is 1)
  const adv = (lat: number) => STREAK.WALL_SPEED + (1 - STREAK.WALL_SPEED) * 1.5 * (1 - lat * lat);
  assert.ok(adv(0) > adv(0.5) && adv(0.5) > adv(0.95), 'centre faster than the wall');
  assert.ok(Math.abs(adv(1) - STREAK.WALL_SPEED) < 1e-9, 'the wall runs at the floor');
  let m = 0; const n = 4000; for (let i = 0; i < n; i++) m += adv(-1 + (2 * (i + 0.5)) / n) / n;
  assert.ok(Math.abs(m - 1) < 0.01 || Math.abs(m - (STREAK.WALL_SPEED + (1 - STREAK.WALL_SPEED) * 1)) < 0.01, `mean advance ${m}`);
  // a slow, near-even drift: the wall runs at most a third under the middle
  assert.ok(adv(1) / adv(0) > 0.6, 'near-constant drift');
});

test('the lozenge is several radii long, of the tube\'s radius, and tapers: long streaks in a wide vein, short in a thin one, never a dash', () => {
  assert.ok(STREAK.LEN_OF_R >= 4 && STREAK.LEN_FLOOR >= 8, 'several radii, never a short dash');
  assert.match(CELLS_VS, /clamp\(4\.5 \* Rcss \* \(0\.85 \+ 0\.3 \* aB\.z\) \* \(1\.0 - 0\.3 \* T\), 8\.0, 48\.0\)/);
  assert.match(CELLS_VS, /float thickCss = clamp\(0\.30 \* Rcss, 1\.6, 4\.0\);/);
  assert.doesNotMatch(CELLS_VS, /float speed = /, 'the length is the tube\'s, not the speed\'s');
  assert.ok(STREAK.THICK_OF_R / 2 + STREAK.SPAN <= 1, 'the lozenge stays inside the tube');
});

test('turbulence: by the vessel\'s ends, its flow and its narrowing; a fixed field (no clock), tilting and wandering the streaks; none in a quiet straight vein', () => {
  for (const n of ['smooth01(min(s, Lw - s)', 'smoothstep(0.5, 0.85, nar)', 'smoothstep(0.8, 1.0, share)', 'T * 0.45 * wob', 'T * 0.60 * tilt']) assert.ok(CELLS_VS.includes(n), n);
  assert.doesNotMatch(CELLS_VS + CELLS_FS, /uniform float time/);
  assert.ok(STREAK.T_END + STREAK.T_STENOSIS + STREAK.T_FLOW >= 1, 'a stenosis in a forking high flow reaches full turbulence');
  assert.ok(STREAK.T_END < 0.5, 'a fork alone is a breath, not a storm');
});

test('subtle: faint, fine and under the chevrons (the owner count of 1500 to 3000 stands)', () => {
  assert.ok(STREAK.ALPHA <= 0.6 && STREAK.THICK_MAX <= 4);
  const l = layoutCells([20, 20]);
  for (let i = 0; i < l.count; i++) assert.ok(l.extra[i * 4 + 3]! >= 0 && l.extra[i * 4 + 3]! < 1, 'a second hash for the turbulence phase');
  const cells = readFileSync(new URL('../src/scene/blood/cells/cells.ts', import.meta.url), 'utf8');
  assert.match(cells, /renderOrder = 10/);
  assert.match(readFileSync(new URL('../src/ui/settings/depth-rows.ts', import.meta.url), 'utf8'), /label: 'Blood streaks'/);
});
