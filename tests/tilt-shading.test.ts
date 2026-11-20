// Tilting or orbiting must never change an organ's or a cel object's shading (Mohammad, 20 Nov 2026: "when i tilt, the organs and everything loses shading or becomes darker").
// The organ's inner shade is measured against the figure's own facing axis and the world normal, not the eye; the generic cel material has no view-dependent rim or specular.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORGAN_FS } from '../src/scene/organs/organ-shader.ts';
import { readFileSync } from 'node:fs';

test('the organ shade never reads the eye: no vV in the fragment, the turn is the world normal against +z', () => {
  const fs = ORGAN_FS.replace(/\/\/[^\n]*/g, '');
  assert.ok((fs.match(/\bvV\b/g) ?? []).length <= 1, 'the eye vector is declared at most, never read, in the organ fragment');
  assert.match(fs, /float ndv = clamp\(nw\.z, 0\.0, 1\.0\);/);
  assert.match(fs, /vec2 side = length\(nw\.xy\) > 1e-4 \? normalize\(nw\.xy\) : vec2\(0\.0\);/);
});
test('the generic cel material has no view-dependent rim or specular (both are zero)', () => {
  const src = readFileSync('src/scene/materials/shaders.ts', 'utf8').replace(/\/\/[^\n]*/g, '');
  assert.match(src, /float rim = 0\.0, sp = 0\.0;/);
  assert.doesNotMatch(src, /reflect\(-l, n\), vV/);
  assert.doesNotMatch(src, /float ndv = max\(dot\(n, vV\)/);
});
