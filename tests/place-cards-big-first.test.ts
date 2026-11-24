import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeCards } from '../src/scene/labels/figure-cards.ts';

// Encephalopathy 10 on an iPhone (capture 2c00c0ce): "94% bypasses the liver" stood over "Covered stent". The view between the two cards is 440 x 138; the split is 204 x 73 and the mark 93 x 19.
// A small mark placed first in the middle left two bands too thin for the split, which then took the least-bad place on the mark. The biggest card is placed first now.
const view = { x0: 0, y0: 232, x1: 440, y1: 370 };
test('the portal blood split and a mark both find a clear place in a 138 px view, whatever their points and order', () => {
  let n = 0;
  for (let my = 245; my <= 360; my += 15) for (let mx = 100; mx <= 400; mx += 50) for (let sy = 245; sy <= 360; sy += 15) for (let sx = 100; sx <= 340; sx += 60) {
    for (const flip of [false, true]) {
      const a = { id: 'mark', x: mx, y: my, w: 92.79, h: 18.76 }, b = { id: 'split', x: sx, y: sy, w: 204.41, h: 73.2 };
      const o = placeCards(flip ? [b, a] : [a, b], view, []);
      n++;
      assert.deepEqual(o.map((x) => x.id), flip ? ['split', 'mark'] : ['mark', 'split'], 'results come back in the slide\'s order');
      assert.ok(o.every((x) => x.ok), `no clear place: mark (${mx},${my}) split (${sx},${sy})`);
      // (the words' own boxes: `box` also holds the run of the leader to the point)
      const [p, q] = o.map((x) => ({ x0: x.x0, y0: x.y0, x1: x.x0 + (x.id === 'mark' ? 92.79 : 204.41), y1: x.y0 + (x.id === 'mark' ? 18.76 : 73.2) }));
      assert.ok(p!.x1 <= q!.x0 || q!.x1 <= p!.x0 || p!.y1 <= q!.y0 || q!.y1 <= p!.y0, `the words overlap: mark (${mx},${my}) split (${sx},${sy})`);
    }
  }
  assert.ok(n > 1000);
});
