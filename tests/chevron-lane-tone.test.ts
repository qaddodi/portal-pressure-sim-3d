// Mohammad, 24 Nov: "why are the chevrons hiding behind the joints?" (Origin lens: orange, teal and purple lanes side by side across the portal vein; a head whose tip crossed into the teal lane was dark there and cream
// elsewhere, so its tip was a black sliver and the head looked cut by the lane). Root cause: flowHeads judged the head's tone (chevCreamOf) with the PIXEL's lane colour, so one head had several tones. Fix: one tone per head,
// from the lane at the vessel's middle (lensHeadAt), in the tube and in every arm of a skin; a ramp lens (no lanes) is unchanged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { SKIN_FS } from '../src/scene/vessels/skin/shaders.ts';
import { LENS_OF_AT_GLSL } from '../src/scene/vessels/glsl-shared.ts';

test('the head tone is read at the middle lane, never at the pixel\'s lane, in the tube and in the skin', () => {
  assert.match(LENS_OF_AT_GLSL, /vec4 lensHeadAt\([^)]*vec4 pixelLens\)/);
  assert.match(LENS_OF_AT_GLSL, /if \(mode < 1\.5\) return pixelLens;/, 'a ramp lens keeps the pixel\'s colour');
  assert.match(LENS_OF_AT_GLSL, /float middle = 0\.0;[^\n]*\n\s*vec4 c = lensOfAt\(lensIx, u, grad, lanes, mode, pal, middle\)/);
  const tube = VESSEL_FS.slice(VESSEL_FS.indexOf('vec4 hd = flowHeads('));
  assert.match(tube.slice(0, 600), /lensHead\(lensGradA, lensLaneA, lensModeA, laneColA, la\), lensHead\(lensGradB, lensLaneB, lensModeB, laneColB, lb\)/);
  assert.match(SKIN_FS, /laArm\[i\] = lensHeadAt\(/);
  assert.match(SKIN_FS, /lbArm\[i\] = lensHeadAt\(/);
});
