// The baked organs' digest (scripts/organs-digest.mjs) and the bake's skip signature (scripts/bake-sig.mjs) are one walk of one import graph, so the bake can never skip while the page's digest has moved
// (the 25 Nov preview: a hand list named anatomy/source.ts, the camera fit's file; an edit there moved the digest, the signature said "unchanged", and every start threw the baked organs away and made them live).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ORGAN_DATA, ORGAN_ENTRIES, organInputs } from '../scripts/organs-digest.mjs';
import { graph } from '../scripts/bake-sig.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const BAKE = fileURLToPath(new URL('../scripts/bake-organs.mjs', import.meta.url));

test('the digest walks exactly the modules the bake runs', () => {
  const imported = [...readFileSync(BAKE, 'utf8').matchAll(/import\(\s*'\.\.\/(src\/[^']+)'\s*\)/g)].map((m) => m[1]!);
  assert.deepEqual([...new Set(imported)].sort(), [...ORGAN_ENTRIES].sort());
});

test('every input of the digest is in the bake\'s skip signature: a skipped bake always has the page\'s digest', () => {
  const sig = new Set([...graph(BAKE).map((f) => f.slice(root.length)), ...ORGAN_DATA]);
  const outside = organInputs().filter((f) => !sig.has(f));
  assert.deepEqual(outside, []);
});

test('the digest reads only what the organs are made from (no file the bake never imports)', () => {
  const inputs = organInputs();
  assert.ok(inputs.includes('src/scene/organs/prepare.ts') && inputs.includes('public/anatomy/organs.bin'));
  assert.ok(!inputs.includes('src/scene/anatomy/source.ts'), 'the camera fit is not an input of the organs');
});
