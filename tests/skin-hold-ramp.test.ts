// Plan 16C (Mohammad, 22 Nov: the two ink lines that run on from the esophageal varix into the azygos). ROOT CAUSE: the outline's depth hold-out (skin/shaders.ts skinArmHeld) took an arm out of the union from a quarter of the blend width k of 3D gap, but the
// fillet (skinSmin over k) spans the whole of k: a pixel 0.25k to k from the azygos already lies in the smooth union of the MESH and was held out of the OUTLINE's, so the stem's own edge was inked inside the fillet and ran on into the azygos. The ramp now starts
// where the fillet ends (1k) and is whole from 2k. The seam rings stand 1.1k to 4.2k from the other arms (rule 4.4.1: at least k), so a wall skin's arm is still held out where it leaves its host (S_PC on the cava: 1.96k). Numbers: tests/skin-parts.test.ts' twin, G8.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKIN_FS, SKIN_VS, SKIN_HOLD_FROM_K, SKIN_HOLD_TO_K } from '../src/scene/vessels/skin/shaders.ts';

test('the hold-out ramp is two named constants, 1 k to 2 k, and the fragment stage reads them (one place)', () => {
  assert.equal(SKIN_HOLD_FROM_K, 1);
  assert.equal(SKIN_HOLD_TO_K, 2);
  assert.match(SKIN_FS, /return smoothstep\(1\.0 \* kPx, 2\.0 \* kPx, gap\);/);
  assert.doesNotMatch(SKIN_FS, /smoothstep\(0\.25 \* kPx/, 'the old ramp is gone');
  assert.ok(SKIN_HOLD_FROM_K >= 1, 'the hold-out must start where the fillet (k wide) ends');
});

test('both stages of the skin parse as GLSL (pure JS parser, no browser)', async () => {
  const { parser } = await import('@shaderfrog/glsl-parser');
  for (const [name, src] of [['fragment', SKIN_FS], ['vertex', SKIN_VS]] as const) assert.doesNotThrow(() => parser.parse(src), `${name} parses`);
});
