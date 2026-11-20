// The blood's streaks (Mohammad, 20 Nov: "wtf are those bubbles... make them streaks with laminar flow and turbulence"): fine lines along the flow, not discs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CELLS_FS, CELLS_VS } from '../src/scene/blood/cells/shader.ts';
import { STREAK, laneSpeed, lanesFor, layoutCells } from '../src/scene/blood/cells/core.ts';
import { STREAK_COMET_GLSL, STREAK_FIELD_GLSL, STREAK_LANE_GLSL } from '../src/scene/blood/streak-glsl.ts';
import { MICRO_FS, MICRO_VS } from '../src/scene/micro3d/cel3d.ts';

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

test('a streak is a comet along the flow, not a disc nor a dash: a blunt round head, a tail tapering to a point, no ink ring, no particle size', () => {
  assert.match(CELLS_FS, /vec2 p = vec2\(dot\(q, vDir\)/, 'drawn in its own axes');
  assert.match(CELLS_FS, /float a = streakComet\(p\.x \/ max\(vLen, 1e-3\) \+ 0\.5, p\.y, 0\.5 \* vThick, 0\.6\);/, '0 at the tail, 1 at the head (the way it runs), from the shared chunk');
  assert.match(STREAK_COMET_GLSL, /t < 1\.0 - hd \? pow\(max\(t, 0\.0\) \/ \(1\.0 - hd\), 1\.3\) : sqrt\(max\(1\.0 - /, 'a tail tapering to a point, a round head');
  assert.match(STREAK_COMET_GLSL, /float hd = 0\.22;/);
  assert.doesNotMatch(CELLS_FS, /inkCol|inkA|\bring\b|smoothstep\(0\.84/, 'no outlined disc, no soft tips');
  assert.match(CELLS_VS, /vDir = dir;/);
  assert.match(CELLS_VS, /\* sgn;/, 'a reversed flow flips the comet');
  assert.doesNotMatch(CELLS_VS, /MAX_CSS|diaCss/);
});

test('lanes: 3, 5 or 7 across the tube by its radius; the speed is parabolic over them, the outer lane at 0.15 of the middle one\'s, the mean over the lanes the stream\'s own', () => {
  assert.equal(STREAK.LANES, 7);
  assert.deepEqual([1, 3, 5, 12].map(lanesFor), [3, 5, 7, 7]);
  assert.match(CELLS_VS, /float lane = clamp\(floor\(aB\.y \* 3\.0 \+ 0\.5\), -hL, hL\) \/ hL;/);
  assert.match(CELLS_VS, /float prof = streakLaneSpeed\(lane, hL\);/, 'the shared lane profile');
  assert.match(CELLS_VS, /float u = fract\(position\.y \+ stm\.x \/ Lw \* prof\);/, 'the stream\'s own distance carries it: faster flow runs quicker, reversed runs back, none stands');
  for (const h of [1, 2, 3]) {
    let m = 0; for (let k = -h; k <= h; k++) m += laneSpeed(k, h) / (2 * h + 1);
    assert.ok(Math.abs(m - 1) < 1e-9, `h ${h}: the mean is 1`);
    assert.ok(Math.abs(laneSpeed(h, h) / laneSpeed(0, h) - STREAK.WALL_SPEED) < 1e-9, `h ${h}: the outer lane runs at the floor`);
    for (let k = 0; k < h; k++) assert.ok(laneSpeed(k, h) > laneSpeed(k + 1, h), 'faster toward the middle');
  }
  // the layout puts streaks in exactly the lanes
  const l = layoutCells([200]);
  const seen = new Set<number>(); for (let i = 0; i < l.count; i++) seen.add(Math.round(l.extra[i * 4 + 1]! * 3));
  assert.deepEqual([...seen].sort((a, b) => a - b), [-3, -2, -1, 0, 1, 2, 3]);
});

test('the comet is a few radii long and a share of the radius thick, with a seeded jitter; it fades out within 1.5 radii of a junction or an end', () => {
  assert.ok(STREAK.LEN_OF_R >= 2 && STREAK.LEN_FLOOR >= 6, 'never a speck');
  assert.match(CELLS_VS, /clamp\(2\.6 \* Rcss \* \(1\.0 \+ 0\.30 \* \(aB\.z - 0\.5\)\) \* mix\(0\.80, 1\.25, share\) \* \(1\.0 - 0\.3 \* T\), 6\.0, 30\.0\)/, 'longer with the flow');
  assert.match(CELLS_VS, /float thickCss = clamp\(0\.16 \* Rcss \* \(1\.0 \+ 0\.30 \* \(aB\.w - 0\.5\)\), 1\.3, 3\.0\);/);
  assert.match(CELLS_VS, /ee = max\(1\.5 \* r2d, 4\.0\)/, 'fades out over 1.5 radii at each end');
  assert.ok(STREAK.THICK_OF_R * 1.15 / 2 + STREAK.SPAN <= 1, 'the comet stays inside the tube');
  // a lane is wider than a comet: neighbouring lanes do not touch (the pitch of 7 lanes across 0.78 of the radius is 0.26 R)
  assert.ok(STREAK.THICK_OF_R * 1.15 < (2 * STREAK.SPAN) / (STREAK.LANES - 1));
});

test('tone: the vessel\'s lit tone one shade lighter, flat, never white, whole inside the lumen band', () => {
  assert.match(CELLS_VS, /vFill = mix\(celTubeBase\(base\), vec3\(1\.0\), 0\.28\);/);
  assert.ok(STREAK.LIFT > 0 && STREAK.LIFT <= 0.35, 'lighter, never white');
  assert.equal(STREAK.ALPHA, 1);
  assert.doesNotMatch(CELLS_FS, /spec|gloss|highlight/i);
});

test('turbulence: by the vessel\'s ends, its flow and its narrowing; a fixed field (no clock), tilting and wandering the streaks; none in a quiet straight vein', () => {
  for (const n of ['smooth01(min(s, Lw - s)', 'smoothstep(0.5, 0.85, nar)', 'smoothstep(0.8, 1.0, share)', 'T * 0.30 * wob', 'T * 0.45 * tilt']) assert.ok(CELLS_VS.includes(n), n);
  assert.doesNotMatch(CELLS_VS + CELLS_FS, /uniform float time/);
  assert.ok(STREAK.T_END + STREAK.T_STENOSIS + STREAK.T_FLOW >= 1, 'a stenosis in a forking high flow reaches full turbulence');
  assert.ok(STREAK.T_END < 0.5, 'a fork alone is a breath, not a storm');
});

test('subtle: fine and under the chevrons (the owner count of 1500 to 3000 stands)', () => {
  assert.ok(STREAK.THICK_MAX <= 4 && STREAK.LEN_MAX <= 30);
  const l = layoutCells([20, 20]);
  for (let i = 0; i < l.count; i++) assert.ok(l.extra[i * 4 + 3]! >= 0 && l.extra[i * 4 + 3]! < 1, 'a second hash for the turbulence phase');
  const cells = readFileSync(new URL('../src/scene/blood/cells/cells.ts', import.meta.url), 'utf8');
  assert.match(cells, /renderOrder = 10/);
  assert.match(readFileSync(new URL('../src/ui/settings/depth-rows.ts', import.meta.url), 'utf8'), /label: 'Blood streaks'/);
});

test('ONE streak: the Anatomy\'s vessels, the 3D lobule and the 3D sinusoid all draw it from the shared chunk (blood/streak-glsl.ts), and the JS table and the GLSL say the same numbers', () => {
  assert.ok(CELLS_VS.includes(STREAK_LANE_GLSL), 'the vessels\' streaks: the lane profile');
  assert.ok(CELLS_FS.includes(STREAK_COMET_GLSL), 'the vessels\' streaks: the comet');
  assert.ok(MICRO_FS.includes(STREAK_FIELD_GLSL), 'the 3D lobule and sinusoid (micro3d/cel3d.ts): the whole field, the same lanes and comets');
  assert.match(MICRO_FS, /float streaks\(\) \{ return streakField\(vAux, vP\.x, uFlow, uHalf, uProfile, uStreakDir\); \}/);
  assert.doesNotMatch(MICRO_FS, /\bh11\b|float streaks\(\) \{\n/, 'no second streak of its own');
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
  assert.match(read('../src/scene/blood/cells/shader.ts'), /from '\.\.\/streak-glsl\.ts'/);
  assert.match(read('../src/scene/micro3d/cel3d.ts'), /from '\.\.\/blood\/streak-glsl\.ts'/);
  assert.match(read('../src/scene/blood/cells/core.ts'), /from '\.\.\/streak-glsl\.ts'/, 'the table is the one');
  assert.match(STREAK_LANE_GLSL, new RegExp(`${STREAK.WALL_SPEED.toFixed(2)}`));
  assert.match(STREAK_COMET_GLSL, new RegExp(`float hd = ${STREAK.HEAD.toFixed(2)};`));
  assert.match(STREAK_FIELD_GLSL, new RegExp(`clamp\\(2\\.0 \\* floor\\(floor\\(halfWidth \\* 2\\.0 / ${STREAK.FIELD_PITCH}\\) \\* 0\\.5\\) \\+ 1\\.0, 3\\.0, ${STREAK.LANES.toFixed(1)}\\)`), '3 to 7 lanes');
});

test('the 3D lobule\'s and sinusoid\'s program, with the streaks, compiles (glslangValidator)', { skip: !have }, () => {
  const f = compile('frag', `#define STREAKS\n${MICRO_FS.replace(/^\n/, '')}`.replace('#define STREAKS\n', '#define STREAKS 1\n'));
  assert.ok(f.ok, f.log);
  const v = compile('vert', `#define STREAKS 1\n${MICRO_VS.replace(/^\n/, '')}`);
  assert.ok(v.ok, v.log);
});
