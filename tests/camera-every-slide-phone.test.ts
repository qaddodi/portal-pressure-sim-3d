// Every slide change in every deck is one camera move straight to its landing, no detour, no snap: on an iPhone (the walk and its checks: tests/camera-every-slide-helpers.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEVICES, everyMove } from './camera-every-slide-helpers.ts';

test(`${DEVICES[1].name}: every slide to slide move in every deck goes straight to its landing, with no detour and no snap, cards settling in flight or not`, () => {
  assert.deepEqual(everyMove(DEVICES[1]), []);
});
