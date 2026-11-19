import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INK_FS, INK_VS, TOON_FS, TOON_VS, VESSEL_TEXEL } from '../src/scene/materials/shaders.ts';

// No browser, no GPU: the shaders must parse as GLSL, and the texel layout the engine writes must be the one they read.
// The glsl-parser package is optional (syntax only); the driver's own compile is checked on the device.
let parse: ((s: string) => unknown) | null = null;
const parserName = '@shaderfrog/glsl-parser';
try { const m = await import(parserName); parse = (s) => m.parser.parse(s.replace(/^#include.*$/gm, ''), { quiet: true }); } catch { /* not installed */ }

for (const [name, src] of Object.entries({ TOON_VS, TOON_FS, INK_VS, INK_FS })) {
  test(`${name} parses as GLSL`, { skip: !parse }, () => { parse!(src.replace(/^\n/, '')); });
}

test('texel layout is documented and the shaders read the same channels', () => {
  assert.deepEqual(Object.values(VESSEL_TEXEL), ['upstreamPressure', 'flow', 'diameter', 'downstreamPressure']);
  assert.match(TOON_FS, /markSpeed\(texelFetch\(vdata, tc, 0\)\.g\)/);
  assert.match(TOON_VS, /texelFetch\(vdata, tc, 0\)\.b/);
});

test('the band edge is anti-aliased by fwidth, never blurred', () => assert.match(TOON_FS, /fwidth\(q\)/));

test('the ink is pushed out in screen pixels and fades by distance along the flow', () => {
  assert.match(INK_VS, /\* 2\.0 \/ res \* c\.w/);
  assert.match(INK_VS, /smoothstep\(0\.0, max\(limit/);
});
