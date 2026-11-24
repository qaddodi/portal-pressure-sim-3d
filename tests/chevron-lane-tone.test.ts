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

// Mohammad, 24 Nov: chevrons flicker through joins. Root cause: the tube faded its heads over 2 to 3.6 radii before a seam where a skin takes over (markK's bury), while the skin drew the head whole from the seam on: a head dimmed then came back.
// The dust already left a skinned end out of that fade; the heads did not.
test('the tube\'s heads are not faded toward an end a skin takes over (as the dust is not), and the skin\'s tube side holds until the tube\'s tail is gone', async () => {
  const { VESSEL_FS } = await import('../src/scene/vessels/shaders.ts');
  const { SKIN_FS, SKIN_HEAD_TUBE_SIDE } = await import('../src/scene/vessels/skin/shaders.ts');
  assert.ok(VESSEL_FS.includes('markK(skinCut.x >= 0.0 ? 1e6 : vUv.x * len * vU, skinCut.y <= 1.0 ? 1e6 : (1.0 - vUv.x) * len * vU) * stumpMk, lensHead('));
  assert.ok(SKIN_FS.includes('smoothstep(' + SKIN_HEAD_TUBE_SIDE.toFixed(1) + ', ' + (SKIN_HEAD_TUBE_SIDE + 0.3).toFixed(1) + ', aIn)'), 'the tube side stays whole until the tail stops reaching the tube');
});
