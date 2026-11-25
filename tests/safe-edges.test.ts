// ?safe= (debug/safe-edges.ts): a frame that stands for a phone or a tablet gives the app the device's safe edges, read the way CSS reads a four-side list; and the promotion frames' edges
// cover what the outline draws over the screen (the iPhone's camera pill and home bar), so no card or pill the app keeps inside them can stand under either.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSafe, safeText } from '../src/ui/debug/safe-edges.ts';
import { FRAME_SAFE, FRAME_KIND, layoutFor } from '../src/ui/debug/promo/frames.ts';
import { PROMO_SIZES, PROMO_RATIO } from '../src/ui/debug/promo/slides.ts';

test('the edges are read as CSS reads top, right, bottom, left', () => {
  assert.deepEqual(parseSafe('47,0,34,0'), [47, 0, 34, 0]);
  assert.deepEqual(parseSafe('20'), [20, 20, 20, 20]);
  assert.deepEqual(parseSafe('24, 0'), [24, 0, 24, 0]);
  assert.deepEqual(parseSafe('10,2,30'), [10, 2, 30, 2]);
  for (const bad of [null, '', 'x', '1,2,3,4,5', '-4', '999']) assert.equal(parseSafe(bad), null, String(bad));
  assert.equal(safeText([47, 0, 34, 0]), '47,0,34,0');
});

test('every promotion size has edges, and the camera pill and home bar lie inside them', () => {
  const shot: Record<string, [number, number]> = { mac: [1440, 900], iphone: [390, 844], 'ipad-portrait': [820, 1180] };
  for (const id of PROMO_SIZES) {
    const e = FRAME_SAFE[id], k = PROMO_RATIO[id]!, [w, h] = shot[id]!;
    assert.ok(e, id);
    const L = layoutFor(FRAME_KIND[id]!, w * k, h * k);
    if (L.camera && FRAME_KIND[id] !== 'mac') {
      const camBottom = (L.camera.y + L.camera.h - L.screen.y) / k;
      if (camBottom > 0) assert.ok(camBottom <= e[0], `${id}: the camera ends ${camBottom.toFixed(1)} px down, the top edge is ${e[0]}`);
    }
    if (L.bar) assert.ok((L.screen.y + L.screen.h - L.bar.y) / k <= e[2], `${id}: the home bar stands inside the bottom edge`);
  }
  assert.deepEqual([...FRAME_SAFE.mac!], [0, 0, 0, 0]);
});
