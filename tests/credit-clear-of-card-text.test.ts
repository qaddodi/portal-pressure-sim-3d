// Mohammad, 20 Nov: the credit may sit over a card (its bare glass) but not on top of the card's text; on the HVPG slides it printed over the words.
// Root cause: the credit's obstacles were the bars only (.vdock, .nb-views, .zoom-pill, the floating chips), never what a deck's cards hold. Now each line of a card's words and each chart, tile or
// picture is an obstacle (lines, not the whole card), so the corner is used where it is bare and rises above the words where it is not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { freeSpots as spots } from '../src/ui/shell/credit-spots.copied.js';

const freeSpots = spots as unknown as (fig: unknown, obs: unknown[], w: number, h: number, o: unknown) => Record<string, { x: number; y: number }>;

test('the credit looks at the words and art of the cards, and again when the slide changes', () => {
  const src = readFileSync('src/ui/shell/Credit.tsx', 'utf8');
  assert.match(src, /out\.push\(\.\.\.cardContent\(vw, vh\), \.\.\.figureLabels\(\)\)/);
  assert.match(src, /const CARDS = '\.pz-shade, \.pz-data, \.pz-case, \.pz-panel'/);
  assert.match(src, /createTreeWalker\(card, NodeFilter\.SHOW_TEXT\)/);
  assert.match(src, /\[view,[^\]]*\bslideKey,/, 'a slide change places it again');
  // eb39090 (phone): the credit sat over the card's tab (CARDIAC, an aria-hidden word) and under the slide pill, and was placed before the cards had come in
  assert.ok(!/closest\('button, \[aria-hidden/.test(src), 'aria-hidden words are drawn words: the card tab is one');
  assert.match(src, /OBSTACLES = '[^']*\.dk-bar/, 'the talk\'s slide pill is an obstacle');
  assert.match(src, /\.pz-sitetab/, 'the card tab is art');
  assert.match(src, /new MutationObserver\(changed\)/, 'it looks again whenever the talk\'s cards change, not on a timer');
  assert.match(src, /querySelector\('\.deck-ui'\)/);
  // eyes on e74e946: "SMV 23.8" printed over the credit (gastric varices 7), and its glyphs touched the card's top border (HVPG 3 and 4)
  assert.match(src, /\.lb-layer:not\(\.lb-key-layer\) \.lb/, 'the figure\'s name labels are obstacles');
  assert.match(src, /new DOMRect\(c\.left, c\.top, c\.width, 2\)/, 'the card\'s own edge is a line');
  assert.match(src, /cel\.rig\.isMoving\) \{ el\.classList\.add\('moving'\)/, 'it waits for the camera to land');
});
test('with the last line of a card at the foot the bottom-left corner rises above it; with room under the words it stays', () => {
  const fig = { l: 0, t: 0, r: 390, b: 844 };
  const words = (bottom: number) => [{ l: 24, t: bottom - 120, r: 360, b: bottom }];
  const crowded = freeSpots(fig, words(830), 220, 17, { gap: 10, inset: 12, avoid: null }).bl!;
  assert.ok(crowded.y + 17 <= 830 - 120 - 10 + 0.5 || crowded.y > 830, 'not on the words');
  const roomy = freeSpots(fig, words(700), 220, 17, { gap: 10, inset: 12, avoid: null }).bl!;
  assert.equal(roomy.y, 844 - 12 - 17, 'the foot is bare: it stays in the corner');
});
