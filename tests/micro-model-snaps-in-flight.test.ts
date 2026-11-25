// HVPG talk, slide 6 to 7 (Mohammad, 21 Nov, iPhone): "significant lag while it is loading the new patient and zooming into the lobule". Root cause: the new patient's frame reached the lobule as an
// EASE (setModel) while the camera was still flying in, and every 1/32 step of congestion, septa or fibrosis rebuilt the hepatocytes and repainted the 2048 px marks plate on the main thread,
// a stall per step inside the zoom. While the camera flies the model is laid at once (snap); it eases only once landed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sceneSource } from './helpers/scene-source.ts';

test('a frame that arrives while the camera flies is laid at once in the micro views', () => {
  const src = sceneSource();
  assert.match(src, /if \(this\.figureView !== 'body'\) this\.feedViews\(this\.rig\.isMoving\);/);
  assert.doesNotMatch(src, /this\.feedViews\(false\)/);
});
