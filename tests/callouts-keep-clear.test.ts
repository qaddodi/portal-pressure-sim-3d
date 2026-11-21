import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { placeCards, type CardIn } from '../src/scene/labels/figure-cards.ts';
import { calloutClaims } from '../src/scene/labels/callout-claims.ts';
import { hits, type Box } from '../src/scene/labels/geometry.ts';

// iPhone audit, 21 Nov: a callout stood under the teach card (Sites stop 8, Gradients stop 11) and over the Circuit's names (Portal vein, Left hepatic vein, L kidney).
// Root causes: (1) the sweep of places stopped a card-width or two from its point, then took "the one that covers least", under a card; (2) the Circuit's captions never read the callouts' room.
const VIEW: Box = { x0: 0, y0: 60, x1: 390, y1: 800 };
const card = (over: Partial<CardIn> = {}): CardIn => ({ id: 'c', x: 195, y: 300, w: 150, h: 30, ...over });

test('a callout whose near places are all under cards stands in the nearest clear place, never under a card', () => {
  // a teach card across the whole band the sweep tries (above and below the point, a card width either side)
  const blockers: Box[] = [{ x0: 0, y0: 150, x1: 390, y1: 480 }];
  const [o] = placeCards([card()], VIEW, blockers);
  assert.ok(o!.ok);
  for (const b of blockers) assert.ok(!hits({ x0: o!.x0, y0: o!.y0, x1: o!.x0 + 150, y1: o!.y0 + 30 }, b), 'clear of the card');
  assert.ok(o!.x0 >= VIEW.x0 && o!.x0 + 150 <= VIEW.x1 && o!.y0 >= VIEW.y0 && o!.y0 + 30 <= VIEW.y1, 'inside the view');
});

test('the clear place is the nearest to the point, and the ones placed before it are kept clear too', () => {
  const blockers: Box[] = [{ x0: 0, y0: 150, x1: 390, y1: 480 }];
  const [a, b] = placeCards([card({ id: 'a' }), card({ id: 'b' })], VIEW, blockers);
  const ba: Box = { x0: a!.x0, y0: a!.y0, x1: a!.x0 + 150, y1: a!.y0 + 30 }, bb: Box = { x0: b!.x0, y0: b!.y0, x1: b!.x0 + 150, y1: b!.y0 + 30 };
  assert.ok(!hits(ba, bb), 'two callouts never overlap');
  assert.ok(ba.y1 <= 150 || ba.y0 >= 480);
});

test('a callout with a clear place beside its point keeps it (the sweep is unchanged)', () => {
  const [o] = placeCards([card()], VIEW, []);
  assert.equal(o!.dir, 'bottom');
  assert.ok(Math.abs(o!.y0 - (300 - 30 - 8)) < 20);
});

test('the callouts\' room is shared: a change tells the listeners once, the same boxes tell nobody', () => {
  let n = 0;
  const off = calloutClaims.subscribe(() => { n++; });
  const b: Box[] = [{ x0: 1, y0: 2, x1: 30, y1: 40 }];
  calloutClaims.set(b); calloutClaims.set(b.map((x) => ({ ...x })));
  assert.equal(n, 1);
  assert.deepEqual(calloutClaims.boxes, b);
  calloutClaims.set([]);
  assert.equal(n, 2);
  off();
});

test('the Circuit\'s captions keep off the callouts as they keep off cards and bars, and place again when the callouts move', () => {
  const src = readFileSync(new URL('../src/scene/circuit/CircuitCaptions.tsx', import.meta.url), 'utf8');
  assert.match(src, /const blockers = \(\): Box\[\] => \{ return \[[^\]]*calloutClaims\.boxes/);
  assert.match(src, /calloutClaims\.subscribe\(\(\) => \{ clock\.invalidate\('circuit-captions'\)/);
  const fc = readFileSync(new URL('../src/scene/labels/figure-cards.ts', import.meta.url), 'utf8');
  assert.match(fc, /calloutClaims\.set\(this\.boxes\)/);
});

test('a pressure\'s name on the scope card wraps inside its column rather than lying over its neighbour (nowrap in three equal columns did)', () => {
  const css = readFileSync(new URL('../src/ui/deck-ui.css', import.meta.url), 'utf8');
  assert.match(css, /\.endo-read > \.endo-pr > dt \{ white-space: normal; overflow-wrap: anywhere;/);
});
