// Circulation 4 to 5 (Mohammad, 25 Nov) and every slide change in every deck on a Mac: one camera move straight to its landing, no detour, no snap. Root cause and the checks:
// tests/camera-every-slide-helpers.ts. The iPhone's walk: tests/camera-every-slide-phone.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICES, busy, decks, everyMove, eye, fly, frame, s, sceneApi, show, walk } from './camera-every-slide-helpers.ts';

test('Circulation 4 to 5 with the lobule still building: the camera stands still while the cards settle, then dives one way, with no snap', async () => {
  const deck = decks.find(([id]) => id === 'circulation')![1], seq = walk(deck);
  const v4 = seq.find((x) => x.v.slide?.id === 'ladder')!.v, v5 = seq.find((x) => x.v.slide?.id === 'lobule')!.v;
  const D = DEVICES[0];
  s.resize(D.w, D.h);
  s.buildMicroIdle = () => {};   // (the parts are built by hand below, as the idle slot would)
  show(v4, D.rooms[1]); for (let k = 0; k < 200 && (busy() || k < 4); k++) frame();
  const still = eye();
  show(v5, D.rooms[0]);
  assert.equal(s.diveHeld, true, 'the dive waits for the lobule\'s parts');
  for (const r of [D.rooms[0], { ...D.rooms[0], h: D.rooms[0].h - D.late }]) {
    sceneApi.setRoom(r, undefined, false, true);
    for (let k = 0; k < 10; k++) { frame(); assert.ok(eye().distanceTo(still) === 0, 'the body stands as slide 4 left it'); }
  }
  while (!s.microStep()) { /* the micro views' steps */ }
  delete (s as unknown as Record<string, unknown>).buildMicroIdle;
  assert.equal(s.diveHeld, false);
  assert.deepEqual(fly(), []);
});

test(`${DEVICES[0].name}: every slide to slide move in every deck goes straight to its landing, with no detour and no snap, cards settling in flight or not`, () => {
  assert.deepEqual(everyMove(DEVICES[0]), []);
});
