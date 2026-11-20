// The vessel program compiled by the Khronos reference compiler (glslangValidator), with three's own prefix for a ShaderMaterial: a redeclaration, a type error or a missing declaration shows
// here, in node, and not as a layer of vessels that is simply not drawn on the owner's iPhone (7e3a295, 19 Nov 2026). Skipped where glslangValidator is not installed
// (apt-get install glslang-tools).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { VESSEL_FS, VESSEL_VS } from '../src/scene/vessels/shaders.ts';

const have = spawnSync('glslangValidator', ['--version']).status === 0;
const COMMON = ['#version 300 es', 'precision highp float;', 'precision highp int;', 'precision highp sampler2D;', 'uniform mat4 modelMatrix;', 'uniform mat4 modelViewMatrix;', 'uniform mat4 projectionMatrix;', 'uniform mat4 viewMatrix;', 'uniform mat3 normalMatrix;', 'uniform vec3 cameraPosition;', 'uniform bool isOrthographic;'];
const VS_PREFIX = [...COMMON, 'in vec3 position;', 'in vec3 normal;', 'in vec2 uv;', '#define attribute in', '#define varying out'].join('\n');
const FS_PREFIX = [...COMMON, 'layout(location = 0) out highp vec4 pc_fragColor;', '#define gl_FragColor pc_fragColor', '#define varying in', '#define texture2D texture'].join('\n');

function compile(stage: 'vert' | 'frag', source: string, defines: string[] = []): { ok: boolean; log: string } {
  const dir = mkdtempSync(join(tmpdir(), 'glsl-'));
  const file = join(dir, `s.${stage}`);
  const prefix = stage === 'vert' ? VS_PREFIX : FS_PREFIX;
  writeFileSync(file, `${prefix}\n${defines.map((d) => `#define ${d}`).join('\n')}\n${source}`);
  const r = spawnSync('glslangValidator', ['-S', stage, file], { encoding: 'utf8' });
  return { ok: r.status === 0, log: (r.stdout + r.stderr).replace(new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), stage) };
}

test('the vessel vertex shader compiles', { skip: !have }, () => { const r = compile('vert', VESSEL_VS); assert.ok(r.ok, r.log); });
test('the vessel fragment shader compiles, as the body and as the veil (VEIL defined)', { skip: !have }, () => {
  for (const d of [[], ['VEIL 1']]) { const r = compile('frag', VESSEL_FS, d); assert.ok(r.ok, `${d.join(',')}: ${r.log}`); }
});

import { INK_FS, INK_VS, TOON_FS, TOON_VS } from '../src/scene/materials/shaders.ts';
import { CEL_TUBE_GLSL } from '../src/scene/cel-glsl.ts';
import { CEL_STYLE } from '../src/scene/cel-style.ts';
test('the cel toon and ink programs compile in every variant a strand or a part uses (plain, vertex ink, the vessels\' tube tones)', { skip: !have }, () => {
  for (const d of [[], ['VERTEX_INK'], ['TUBE_TONES'], ['VERTEX_INK', 'TUBE_TONES']]) {
    const v = compile('vert', TOON_VS, d); assert.ok(v.ok, `toon vertex ${d}: ${v.log}`);
    const f = compile('frag', TOON_FS, d); assert.ok(f.ok, `toon fragment ${d}: ${f.log}`);
  }
  assert.ok(compile('vert', INK_VS).ok); assert.ok(compile('frag', INK_FS).ok);
});

test('a strand is drawn in the vessels\' tones: the tube-tones variant has the same numbers as the vessel shader and no rim lift', () => {
  assert.match(TOON_FS, /#ifdef TUBE_TONES/);
  // one shared GLSL, written from CEL_STYLE, in both programs: the same numbers by construction
  assert.ok(TOON_FS.includes(CEL_TUBE_GLSL) && VESSEL_FS.includes(CEL_TUBE_GLSL));
  for (const n of [`${CEL_STYLE.VESSEL_STEP_AT} - et`, `b * (1.0 - ${CEL_STYLE.SHADE})`, `${CEL_STYLE.DIR[0]}, ${CEL_STYLE.DIR[1]}`]) assert.ok(CEL_TUBE_GLSL.includes(n), n);
  assert.match(TOON_FS, /celTubeTone\(base, across0, celTubeK\(sideS\), rDev0\)/);
  assert.match(TOON_FS, /#ifndef TUBE_TONES\s+c \+= rim/);
});
