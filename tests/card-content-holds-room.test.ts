// Mohammad, 24 Nov: a teaching or instrument card comes in at its final size and never changes size after landing. Two causes found at the root, pinned here (node only);
// the in-app audit's `card-grew-live` finding (box-lock.ts) watches every slide for any other, and tests/card-box-sequences.test.ts drives the lock itself.
//   1. The Ascites 13 lines (litres removed, albumin dose) were mounted with the first litre, so the instrument card grew by their height. They stand from the slide's first frame and hold the room of the longest words.
//   2. The procedure row (ProcRow) stood only once procs-link wrote its slide into the store, which can be after the card was measured and let in; it now stands from the slide's own plan.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { tapWords, TAP_RESERVE } from '../src/ui/tests/abdomen/model.ts';

const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('the paracentesis lines are in the figure before any litre goes, and hold the longest words they can take', () => {
  const pane = read('src/ui/tests/abdomen/AbdomenPane.tsx');
  assert.doesNotMatch(pane, /tapping && peak\.current > 0/, 'the lines wait for the first litre: the card grows when they come');
  assert.match(pane, /const tap = host\.slide && tapping \? tapWords\(removed\) : null/);
  assert.match(pane, /TAP_RESERVE\.map/);
  // every reading the lines can show is no longer than the reserved ones
  const widest = (k: 'removed' | 'dose') => Math.max(...TAP_RESERVE.map((r) => r[k].length));
  for (let L = 0; L <= 20; L += 0.1) { const w = tapWords(L); assert.ok(w.removed.length <= widest('removed') && w.dose.length <= widest('dose'), `${L} L`); }
  const css = read('src/ui/css3d-over-2d.css');
  assert.match(css, /\.ab-tap > \* \{ grid-area: 1 \/ 1;/);
  assert.match(css, /\.ab-tap-hold \{ visibility: hidden;/);
});

test('the procedure row stands from the slide\'s own plan, never only from the store procs-link writes after the card is in', () => {
  const row = read('src/ui/cards/ProcRow.tsx');
  assert.doesNotMatch(row, /!procPlanOf\(cs\) \|\| !mine\) return null/);
  assert.match(row, /if \(!cs \|\| !plan\) return null/);
  assert.match(row, /stepsOfPlan\(plan\)/);
});

test('a card is let in only on a height measured with the fonts in, and the fonts arriving re-measure it (a fallback-font measure grew the card after it landed)', () => {
  const layer = read('src/ui/cards/CardLayer.tsx'), frame = read('src/ui/cards/CardFrame.tsx');
  assert.match(layer, /const sig = sigRef\.current, f = fontsLoaded\(\)/);
  assert.match(layer, /\?\.f !== false\)/, 'the gate (`measured`) must require a measure taken with the fonts in');
  assert.match(frame, /document\.fonts\.ready\.then\(\(\) => \{ if \(alive\) report\(!now\.current\.live\)/);
});

test('a kept data card keeps the box it landed with when only the slide beside it changes (no clip glide across slides)', async () => {
  const { boxOf, BOX_START } = await import('../src/ui/cards/box-lock.ts');
  const frame = read('src/ui/cards/CardFrame.tsx');
  // the lock's key is the card's own step, not the signature that starts with the words' key
  assert.match(frame, /const stepKey = data \? \(remeasure \?\? ''\)\.slice\(\(remeasure \?\? ''\)\.indexOf\('\|'\) \+ 1\)/);
  assert.match(frame, /const lockKey = `\$\{entry\.key\}\|\$\{Math\.round\(rect\.w\)\}\|\$\{stepKey\}`/);
  assert.match(frame, /report\(true, !sameStep\)/);
  // the same step, a new slide: the measure is an observer's, so a shorter one stands on the landed box and nothing is reported (no glide)
  const K = 'ladder|390|1|0||';
  let s = boxOf(BOX_START, { t: 'measure', key: K, h: 320, fresh: true, shown: false }).state;
  s = boxOf(s, { t: 'show', key: K }).state;
  for (const h of [280, 300, 320]) { const o = boxOf(s, { t: 'measure', key: K, h, fresh: false, shown: true }); assert.equal(o.report, false, `${h}`); assert.equal(o.state.h, 320); }
  // a step of its own (a new key) is judged afresh
  assert.equal(boxOf(s, { t: 'measure', key: 'ladder|390|2|1||', h: 240, fresh: true, shown: true }).report, true);
});
