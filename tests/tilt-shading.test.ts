// Tilting or orbiting must never change an organ's or a cel object's shading (Mohammad, 20 Nov 2026: "when i tilt, the organs and everything loses shading or becomes darker").
// The organ's bands are cut from n.L of the world normal against the world light, not the eye; the generic cel material has no view-dependent rim or specular.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORGAN_FS } from '../src/scene/organs/organ-shader.ts';
import { readFileSync } from 'node:fs';

test('the organ shade never reads the eye: no vV or view-space normal in the fragment, the one signal is the world normal against the world light', () => {
  const fs = ORGAN_FS.replace(/\/\/[^\n]*/g, '');
  assert.ok((fs.match(/\bvV\b/g) ?? []).length <= 1, 'the eye vector is declared at most, never read, in the organ fragment');
  assert.doesNotMatch(fs, /normalize\(vN\)/, 'no view-space normal is lit');
  assert.match(fs, /float s = dot\(normalize\(vNw\), LIGHT\)/);
});
test('the generic cel material has no view-dependent rim or specular (both are zero)', () => {
  const src = readFileSync('src/scene/materials/shaders.ts', 'utf8').replace(/\/\/[^\n]*/g, '');
  assert.match(src, /float rim = 0\.0, sp = 0\.0;/);
  assert.doesNotMatch(src, /reflect\(-l, n\), vV/);
  assert.doesNotMatch(src, /float ndv = max\(dot\(n, vV\)/);
});
