// THE flow head (blood/chevron-glsl.ts) is the Anatomy's own, word for word, and the Lobule's 3D vessels draw it, dark on the blood (Mohammad, 20 Nov 2026: "chevrons unified ... blood chevrons black").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CHEVRON_HEAD_GLSL } from '../src/scene/blood/chevron-glsl.ts';
import { MICRO_FS } from '../src/scene/micro3d/cel3d.ts';

const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
test('the shared head is the Anatomy\'s chevD and chevHead, word for word', () => {
  const src = norm(readFileSync('src/scene/vessels/shaders.ts', 'utf8'));
  for (const fn of ['float chevD(float u, float ay, float hw) {', 'vec2 chevHead(float u, float ay, float hw, float px, float rev) {']) assert.ok(src.includes(fn) || /CHEVRON_(HEAD_)?GLSL/.test(src), fn);
  const body = norm(CHEVRON_HEAD_GLSL);
  if (!/CHEVRON_(HEAD_)?GLSL/.test(src)) assert.ok(src.includes(body), 'the same text as vessels/shaders.ts');
});
test('the Lobule\'s 3D vessels draw THE head, the blood\'s near black', () => {
  assert.ok(MICRO_FS.includes('vec2 chevHead('), 'the toon carries the head');
  assert.match(MICRO_FS, /uFlowDark > 0\.5 \? inkH/);
  const lob = readFileSync('src/scene/micro3d/lobule3d.ts', 'utf8');
  for (const p of ['this.sin.an', 'this.inlets', 'this.twigs']) assert.match(lob, new RegExp(`${p.replace(/\./g, '\\.')}\\.setFlow\\([^\\n]*, true\\);`), p);
});
