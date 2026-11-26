// External review 3531bdfa, gaps in sentences (A-D16 06.3, C-D15, D-D8, F-D16): "7.1 L      and" (Pregnancy 3), "8.3 mmHg,      under" (31.10), "lowers the PPG from 16.7 mmHg." with no "to" (32.10). Node only.
// Root cause of the gap: a reading's box holds the widest value its slide's controls can bring (Plan 45), and for a what-if slider that was a padded guess (a second digit, a minus slot: roll-reserve.ts reserveOf)
// on every reading of the line, even one the slider cannot move, and on a slider that sets an instrument's option and moves no reading at all. A slider's stops are now worked out ahead like a compare button's
// (controls-run.ts warmControls), so a reading holds the widest it really takes and no more. The padded guess stays for a reading whose stops are not yet in.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { allCopiedDecks, nodeEngine } from '../src/ui/charts/baked/make.ts';
import { chainOf } from '../src/decks/hp/numbers.ts';
import { controlsOf, movesReadings, sliderStops, type WhatIf } from '../src/decks/controls.ts';
import { variantStateOf, sliderOpt, type Seq } from '../src/ui/talk/variant-state.ts';
import { reserveOf, altsOf, seenAcross } from '../src/ui/cards/roll-reserve.ts';
import { valueText } from '../src/ui/text/tokens.ts';
import type { CopiedSlide } from '../src/decks/hp/types.ts';

const read = (f: string) => readFileSync(new URL(f, import.meta.url), 'utf8');
const decks = await allCopiedDecks();

test('a slider\'s stops: both ends and the points between, on its step, inside its range, none twice', () => {
  const w = (min: number, max: number, step: number) => ({ min, max, step });
  assert.deepEqual(sliderStops(w(0, 40, 1)), [0, 10, 20, 30, 40]);
  assert.deepEqual(sliderStops(w(0, 1, 0.05)), [0, 0.25, 0.5, 0.75, 1]);
  assert.deepEqual(sliderStops(w(0, 3, 1)), [0, 1, 2, 3], 'a short range has fewer stops, never a repeat');
  assert.deepEqual(sliderStops(w(0.1, 0.9, 0.1)), [0.1, 0.3, 0.5, 0.7, 0.9]);
  for (const { id, slides } of decks) for (const s of slides as CopiedSlide[]) {
    const c = controlsOf(s)?.whatIf;
    if (!c || !movesReadings(c)) continue;
    const stops = sliderStops(c);
    assert.ok(stops.length >= 2 && stops[0] === c.min && stops.at(-1) === c.max, `${id}/${s.id}: both ends are stops`);
    assert.equal(new Set(stops).size, stops.length, `${id}/${s.id}`);
    assert.ok(stops.every((x) => x >= c.min && x <= c.max), `${id}/${s.id}: inside the range`);
  }
});

test('a slider that sets an instrument\'s option moves no reading: it leaves the slide\'s readings still; one on the model does not', () => {
  assert.equal(movesReadings(undefined), false);
  assert.equal(movesReadings({ label: 'Gain', paths: [], min: 0, max: 1, step: 0.1, tool: 'gain' } as WhatIf), false);
  assert.equal(movesReadings({ label: 'Weeks', paths: ['gestation'], min: 0, max: 40, step: 1 }), true);
  const card = read('../src/ui/cards/TeachingCard.tsx'), run = read('../src/ui/talk/controls-run.ts');
  assert.match(card, /slides = movesReadings\(ctl\?\.whatIf\)/);
  assert.match(card, /const live = slides \|\| !!ctl\?\.strain/, 'only a slider on the model holds a minus slot');
  assert.match(card, /if \(deck && \(moves \|\| slides\) && !slide\.lapse && !ctl\?\.strain && idx >= 0\)/, 'a slider\'s stops are read like a compare row\'s');
  assert.match(run, /movesReadings\(w\) \? sliderStops\(w!\) : \[\]/);
  assert.match(run, /variantStateOf\(secondSeq, picked, \{ slideKey: key \}, sliderOpt\(w!\.paths, x\)/, 'the stop is the state a drag settles at (dragWhatIf asks the same way)');
});

test('what a reading takes across states: one text when none moves it (its own width), the widest when some do', () => {
  const fp = (bv: number, co: number) => ({ bv, co });
  assert.deepEqual(seenAcross('bv', [fp(7100, 8.3), fp(7100, 9.0)]), ['7.1 L']);
  assert.deepEqual(seenAcross('bv', [fp(7100, 8.3), fp(9400, 9.0)]), ['7.1 L', '9.4 L']);
  assert.equal(seenAcross('bv', []), undefined);
  // (and the box is that width: no second digit, no minus slot, so nothing stands after "7.1 L")
  const own = '7.1 L', seen = seenAcross('bv', [fp(7100, 8.3), fp(9400, 9.0)]);
  assert.equal(reserveOf(own, 'bv', false, false, { seen, minus: true }), '0.0 L');
  assert.equal(reserveOf(own, 'bv', false, false, { minus: true }), '00.0 L', 'the guess, while the stops are not in');
  assert.deepEqual(altsOf(own, false, { seen }), ['7.1 L', '9.4 L']);
});

// Pregnancy 3 "Weeks of gestation" (the review's worst instance: ~45 px after "7.1 L"): worked on the engine in node, as the app works the stops ahead of a drag.
test('Pregnancy 3: the line\'s readings hold the widest the slider really gives, not a padded guess (engine in node)', async () => {
  const deck = decks.find((d) => d.id === 'pregnancy')!, slides = deck.slides as CopiedSlide[], i = slides.findIndex((s) => s.id === 'weeks');
  const w = controlsOf(slides[i]!)!.whatIf!;
  const eng = nodeEngine();
  try {
    const own = (await eng.sequence(chainOf(slides.slice(0, i + 1))))[i + 1];
    const seq: Seq = (steps, base) => eng.sequence(steps, base);
    const fps = [own.fp];
    for (const x of sliderStops(w)) fps.push((await variantStateOf(seq, new Map(), { slideKey: 'pregnancy/weeks' }, sliderOpt(w.paths, x), own, undefined))?.state?.fp as never);
    assert.ok(fps.every(Boolean), 'every stop came back');
    for (const key of ['bv', 'co']) {
      const text = valueText(key, own.fp as never), seen = seenAcross(key, fps as never)!;
      const guess = reserveOf(text, key, false, false, { minus: true }), held = reserveOf(text, key, false, false, { seen, minus: true });
      assert.ok(held.length <= guess.length, `${key}: no wider than the guess`);
      // the reading the slider takes widest is the box: the shown one stands in it with no spare digit after it unless the slider really brings one
      const widest = Math.max(...seen.map((t) => t.replace(/\d/g, '0').length));
      assert.equal(held.length, widest, `${key}: ${text} in a box of ${held}, the stops being ${seen.join(', ')}`);
    }
    assert.ok(fps.length >= 3, 'the stops include states other than the slide\'s own');
  } finally { eng.dispose(); }
});

// D-D8 32.10: "lowers the PPG from 16.7 mmHg." said where it comes from and not where it goes.
test('every "from {reading}" in a slide\'s words has its other end in the same sentence: a "to", or the reading it is now (every deck)', () => {
  const fields: [string, string][] = [];
  const walk = (o: unknown, path: string): void => {
    if (typeof o === 'string') { if (!/(^|\.)(notes|ask)(\.|$)/.test(path) && !/\.(vignette|credit)$/.test(path)) fields.push([path, o]); }
    else if (Array.isArray(o)) o.forEach((x, k) => walk(x, `${path}.${k}`));
    else if (o && typeof o === 'object') for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`);
  };
  for (const d of decks) walk(d.slides, d.id);
  const bad: string[] = [];
  let seen = 0;
  for (const [path, text] of fields) {
    for (const sentence of text.split(/(?<=[.!?])\s+(?=[A-Z{])/)) {
      if (!/\bfrom\s+\{[^}]+\}/.test(sentence)) continue;
      seen++;
      // (both ends: a "to", or the reading it is now, as "it is {hvpg}, from {hvpg@predesci}")
      const readings = sentence.match(/\{[a-z][^}]*\}/g) ?? [];
      if (!/\bto\b/.test(sentence) && readings.length < 2) bad.push(`${path}: ${sentence}`);
    }
  }
  assert.ok(seen >= 5, `${seen} sentences with a "from {reading}"`);
  assert.deepEqual(bad, []);
});
