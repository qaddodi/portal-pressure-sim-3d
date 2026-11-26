// Capture 84496815, Ascites 13: "7.7 L removed, Albumin 46 to 62 g" under words that say the LVP drains the whole 5.9 L. The removed count was the most the belly held since the PANE mounted (kept from the slide before),
// not since the procedure began. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tapPeak, tapWords, tapCounter } from '../src/ui/tests/abdomen/model.ts';

test('the count starts when the procedure does: an earlier, higher reading is not litres taken off', () => {
  let peak = 0;
  for (const l of [3, 6, 7.7]) peak = tapPeak(peak, l, false);   // the slide before: the belly filling
  assert.equal(peak, 7.7);
  peak = tapPeak(peak, 5.9, true);                                  // the procedure begins at 5.9 L
  assert.equal(peak, 5.9);
  for (const l of [4.2, 2, 0]) peak = tapPeak(peak, l, false);
  assert.equal(peak, 5.9);
  assert.equal(tapWords(Math.max(0, peak - 0)).removed, '5.9 L removed');
  assert.equal(tapWords(5.9).dose, 'Albumin 35 to 47 g (6 to 8 g per liter)');
});
test('no reading leaves the peak as it was; a reading that rises while draining raises it', () => {
  assert.equal(tapPeak(5.9, NaN, false), 5.9);
  assert.equal(tapPeak(5.9, NaN, true), 5.9);
  assert.equal(tapPeak(5.9, 6.1, false), 6.1);
});
test('the counter sees every frame: the removed litres do not depend on which frames a render happened to show (capture 2274649a, Albumin 3: 0.4, 0.8 and nothing on three runs)', () => {
  // the engine's frames across the run: the belly refills to the state before the slide, then drains to the slide's own
  const frames = [0.8, 1.6, 3.2, 5.1, 5.9, 4.0, 2.2, 0.8];
  const c = tapCounter();
  c.begin(frames[0]!);
  for (const f of frames) c.see(f);
  // however sparse the renders were (every frame, a few, only the last), what they print is the counter's peak less the litres they read, and the last render reads 0.8
  assert.equal(Math.round(Math.max(0, c.peak - 0.8) * 10) / 10, 5.1);
  assert.equal(tapWords(Math.max(0, c.peak - 0.8)).removed, '5.1 L removed');
});
test('the count starts when the run does, not when the slide lands: the belly the slide landed on is still easing from the slide before', () => {
  const c = tapCounter();
  c.see(9);                      // (frames before the run: not counted)
  assert.equal(c.peak, 0);
  c.begin(0.7);                  // (the run's first Next: the belly as it stands then)
  for (const f of [0.65, 0.7, 0.79, 0.8]) c.see(f);
  assert.equal(c.peak, 0.8);
  assert.equal(Math.max(0, c.peak - 0.8), 0);   // (the same on every device: the landing's easing never enters)
});
test('what was counted survives the slide being left and Back landing on it; another slide starts from nothing', () => {
  const c = tapCounter();
  c.begin(5.9); c.see(2); c.see(0.8);
  assert.equal(c.peak, 5.9);     // (Next leaves the slide and Back returns: the finished slide still says its litres)
  c.reset();                     // (another slide's procedure comes in)
  assert.equal(c.live, false);
  c.see(20);
  assert.equal(c.peak, 0);
});
test('the pane reads the counter, and the counter is fed by every engine frame and the run\'s start', () => {
  const src = readFileSync(new URL('../src/ui/tests/abdomen/AbdomenPane.tsx', import.meta.url), 'utf8');
  assert.match(src, /tapCount\.peak - litres/);
  assert.doesNotMatch(src, /tapPeak\(/);
  const feed = readFileSync(new URL('../src/ui/tests/abdomen/tap-count.ts', import.meta.url), 'utf8');
  assert.match(feed, /onFrame\(/);
  assert.match(feed, /phase === 'play'/);
});
