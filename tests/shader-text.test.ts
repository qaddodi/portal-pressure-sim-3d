// tests/shader-text.ts: the helper the shader-text tests read through (Plan 42). It has a passing and a failing case of its own, so a change to it that makes a grep match the wrong text is caught here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { block, driverText, shaderText, withoutSwitch } from './shader-text.ts';
import { VESSEL_FS, VESSEL_VS } from '../src/scene/vessels/shaders.ts';

const SRC = `#ifdef VDBG
#define DROP(n) { if (dbgWhy > 0.5) { return; } discard; }
vec3 dbgOnly() { return vec3(1.0); }
#else
#define DROP(n) discard;
#endif
#ifdef OTHER
float other = 1.0;
#else
float other = 2.0;
#endif
void main() {
  if (a < 0.5) DROP(3);
  if (!gl_FrontFacing) DROP(8);
}`;

test('the inspector\'s branch is left out and DROP(n) is the discard it is, while another switch\'s lines stay as written', () => {
  const t = shaderText(SRC);
  assert.doesNotMatch(t, /dbgOnly|dbgWhy/, 'the VDBG branch is gone');
  assert.match(t, /if \(a < 0\.5\) discard;/);
  assert.match(t, /if \(!gl_FrontFacing\) discard;/);
  assert.match(t, /#ifdef OTHER[\s\S]*#else[\s\S]*float other = 2\.0;[\s\S]*#endif/, 'a switch that is not VDBG is untouched');
  assert.equal(withoutSwitch('#ifndef VDBG\nA\n#else\nB\n#endif', 'VDBG'), 'A', 'an ifndef keeps its first branch with the switch off');
});

test('the vessel fragment shader reads as the driver draws it: every discard of a tube is a plain discard, and no inspector text is in it', () => {
  const t = shaderText(VESSEL_FS);
  assert.doesNotMatch(t, /DROP\(|dbgWhy|dbgWhyCol/);
  assert.match(t, /if \(!gl_FrontFacing\) discard;/);
  assert.ok((t.match(/\bdiscard;/g) ?? []).length >= 12, 'the twelve numbered drops are discards');
  assert.ok(shaderText(VESSEL_VS).length > 1000);
  assert.ok(driverText(VESSEL_FS).includes('discard'), 'the driver text has them too');
});

test('block cuts one braced block by its first words, to the matching brace, and says nothing when the marker is absent', () => {
  const t = 'a { b } if (x > 1) { y(); if (z) { w(); } } tail { }';
  assert.equal(block(t, 'if (x > 1)'), 'if (x > 1) { y(); if (z) { w(); } }');
  assert.equal(block(t, 'nothing'), '');
  assert.equal(block('if (open) { never closes', 'if (open)'), '');
});
