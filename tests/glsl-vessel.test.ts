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
