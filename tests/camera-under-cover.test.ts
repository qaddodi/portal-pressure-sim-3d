// Behind the loading cover nobody sees a glide: a camera move asked for there lands at once. The start's own moves (the Shell's first view and its rooms) flew for 950 ms behind the cover, the body
// counted as leaving a view the whole time, and every label waited for the landing: 750 ms between the first draw and the lift on Mac Safari (26 Nov), and longer on a slow phone, whose capped
// frame steps stretch the move.
import assert from 'node:assert/strict';
import { test } from 'node:test';

(globalThis as { document?: unknown }).document = { documentElement: { dataset: {} as Record<string, string> } };
const { holdSplash, release } = await import('../src/boot/ready.ts');
const { CameraRig } = await import('../src/scene/camera/rig.ts');
const room = { x: 0, y: 0, w: 1200, h: 800 };

const flight = (): { first: boolean; frames: number } => {
  const rig = new CameraRig('play', room); rig.resize(1200, 800);
  rig.goTo('play', room, 0, 0); rig.update(0);
  rig.goTo('route', { x: 300, y: 0, w: 900, h: 800 }, 16, 950);
  let frames = 0, t = 16;
  const first = rig.update(t += 16);
  while (rig.update(t += 16) && frames < 500) frames++;
  return { first, frames: frames + (first ? 1 : 0) };
};

test('under the cover a move lands on its first frame', () => {
  holdSplash(() => undefined);
  try { assert.equal(flight().frames, 0, 'still moving after its first frame under the cover'); } finally { release(); }
});

test('once the cover is gone the same move glides as before', () => {
  assert.ok(flight().frames > 20, 'the glide was cut short after the lift');
});
