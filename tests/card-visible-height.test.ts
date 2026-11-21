// card-size-snap judged the layout box, but a growing or shrinking card is revealed or clipped by a clip-path glide (CardFrame reveal/sink): the box jumps, what is drawn eases. The recorder now reads
// the drawn height (layout less the clip's insets), so a glide reads as a glide and a real snap still reads as one. (Audit v2 B2, B3, B6: 158 to 732, 573 to 401, 328 to 304 px in one frame.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { clipInset, visibleSpan } from '../src/ui/debug/watch/visible.ts';
import { cardSizeSnap } from '../src/ui/debug/watch/motion-rules.ts';

test('clip-path insets: the CSS shorthand, round ignored, anything else is none', () => {
  assert.deepEqual(clipInset('inset(0px 0px 574px round 14px)'), [0, 0, 574, 0].map((n, i) => (i === 1 ? 0 : n)).map((n, i) => (i === 3 ? 0 : n)));
  assert.deepEqual(clipInset('inset(10px 20px 30px 40px)'), [10, 20, 30, 40]);
  assert.deepEqual(clipInset('inset(5px)'), [5, 5, 5, 5]);
  assert.deepEqual(clipInset('inset(5px 7px)'), [5, 7, 5, 7]);
  assert.deepEqual(clipInset('none'), [0, 0, 0, 0]);
  assert.deepEqual(clipInset(undefined), [0, 0, 0, 0]);
});

test('a growing card (layout 732 at once, clipped from the foot) is drawn 158 px tall at first and eases to 732', () => {
  const heights: number[] = [];
  for (let i = 0; i <= 12; i++) { const eased = 158 + (732 - 158) * (1 - (1 - i / 12) ** 3); heights.push(visibleSpan(100, 732, `inset(0px 0px ${732 - eased}px 0px round 14px)`)[1]); }
  assert.ok(Math.abs(heights[0]! - 158) < 1e-9 && Math.abs(heights[12]! - 732) < 1e-9);
  for (let i = 1; i < heights.length; i++) assert.ok(heights[i]! >= heights[i - 1]!, 'monotonic');
  // a clip from the top (a card on the foot) moves the drawn top as well
  const [top, h] = visibleSpan(100, 400, 'inset(120px 0px 0px 0px)');
  assert.deepEqual([top, h], [220, 280]);
});

const sample = (t: number, h: number) => ({ t, K: [['teach', 10, 20, 300, h, 1]] });
test('the judge: a glide of the drawn height is no snap, the layout box jumping once still is one', () => {
  const eased = Array.from({ length: 12 }, (_, i) => 158 + (732 - 158) * (1 - (1 - i / 11) ** 3));
  const glide = cardSizeSnap({ samples: eased.map((h, i) => sample(i * 33, h)) } as never);
  assert.equal(glide.length, 0, 'drawn height eases: nothing to report');
  const snap = cardSizeSnap({ samples: [...Array(6).fill(158), ...Array(6).fill(732)].map((h, i) => sample(i * 33, h)) } as never);
  assert.equal(snap.length, 1, 'a real one-frame jump is still found');
});

test('the recorder reads the drawn height, not the layout box', () => {
  const src = readFileSync('src/ui/debug/watch/sources.ts', 'utf8');
  assert.match(src, /visibleSpan\(b\.top, b\.height, win\.getComputedStyle\(el\)\.clipPath\)/);
});
