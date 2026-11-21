import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scoresOf, CP_ZONES } from '../src/ui/charts/scores/model.ts';
import { SCORES_ON } from '../src/ui/charts/scores/slides.ts';
import { defaultParams, PRESETS } from '../src/engine/hales/portal/scenario.js';
import { ctxOf, judge } from './charts-helpers.ts';
import { scoresFrame } from '../src/ui/charts/scores/frame.ts';
import { CHART_TOOLS } from '../src/decks/charts.ts';

// The liver-function card (Child–Pugh, MELD, MELD-Na): the maths is hales-engine's (its own test holds the textbook cases); here the card, and every slide that shows it.
const FILE: Record<string, string> = {
  'tips-candidacy': 'src/decks/rw/copied/tips-candidacy.ts', 'tips-complete': 'src/decks/rw/copied/tips-complete.ts', 'recompensation': 'src/decks/rw/copied/recompensation.ts',
  'choose-treatment': 'src/decks/ag/choose-treatment.copied.ts',
};
interface Slide { id: string; preset?: string; params?: Record<string, unknown>; vignette?: string; line?: string; tool?: { rows?: { text?: string; note?: string }[] } }
const deckOf = (id: string): { slides: Slide[] } => { const t = readFileSync(FILE[id]!, 'utf8'); return JSON.parse(t.slice(t.indexOf('= {') + 2, t.lastIndexOf('}') + 1)); };

/** The albumin the model holds on a slide: the last preset (or albumin parameter) the deck set up to it. */
function albuminAt(deck: { slides: Slide[] }, i: number): number {
  let p = defaultParams() as { albumin: number };
  for (const s of deck.slides.slice(0, i + 1)) {
    if (s.preset) p = (PRESETS as { id: string; apply(p: unknown): { albumin: number } }[]).find((x) => x.id === s.preset)!.apply(defaultParams()) as { albumin: number };
    if (typeof s.params?.albumin === 'number') p = { ...p, albumin: s.params.albumin };
  }
  return p.albumin;
}

test('every slide that shows the card gets the total, class and MELD its own words give', () => {
  for (const [key, facts] of Object.entries(SCORES_ON)) {
    const [d, id] = key.split('/') as [string, string];
    const deck = deckOf(d), i = deck.slides.findIndex((s) => s.id === id);
    assert.ok(i >= 0, `${key} is a slide`);
    const s = deck.slides[i]!, sc = scoresOf(facts, albuminAt(deck, i));
    assert.equal(sc.missing.length, 0, `${key}: every component is given (${sc.missing})`);
    const words = [s.vignette, s.line, ...(s.tool?.rows ?? []).flatMap((r) => [r.text, r.note])].filter(Boolean).join(' | ');
    for (const m of words.matchAll(/Child–Pugh ([ABC])\s?(\d+)(?! or)/g)) assert.deepEqual([sc.cls, sc.total], [m[1], Number(m[2])], `${key}: says Child–Pugh ${m[1]} ${m[2]}, card gives ${sc.cls} ${sc.total}`);
    for (const m of words.matchAll(/MELD (\d+)/g)) assert.equal(sc.meld, Number(m[1]), `${key}: says MELD ${m[1]}, card gives ${sc.meld}`);
    if (/Child–Pugh A5 or A6/.test(words)) assert.ok(sc.total! >= 5 && sc.total! <= 6, `${key}: the card must give A5 or A6, gives ${sc.cls}${sc.total}`);
  }
});

test('the preemptive verdict on a slide agrees with what the slide says', () => {
  assert.match(scoresOf(SCORES_ON['tips-candidacy/pre']!, 2.8).verdict!.text, /^Meets/);
  assert.match(scoresOf(SCORES_ON['choose-treatment/a1']!, 2.8).verdict!.text, /^Does not meet/);
  assert.match(scoresOf(SCORES_ON['recompensation/recomp']!, 4).verdict!.text, /consistent with Child–Pugh A5 or A6/);
  assert.equal(scoresOf(SCORES_ON['tips-candidacy/meld']!, 2.5).verdict, null);
});

test('a missing component is named and no total or class is guessed; the model supplies the albumin, a slide fact overrides it', () => {
  const none = scoresOf({ bili: 1, inr: 1.2, creatinine: 1 }, 3.9);
  assert.equal(none.total, null); assert.equal(none.cls, null);
  assert.deepEqual(none.missing, ['ascites', 'he']);
  assert.equal(none.meld, 6 + 0 + Math.round((0.378 * 0 + 1.12 * Math.log(1.2)) * 10));
  assert.equal(scoresOf({ bili: 1, inr: 1.1, creatinine: 1, ascites: 'none', he: 'none' }, null).total, null, 'no albumin: no total');
  assert.equal(scoresOf({ bili: 1, inr: 1.1, creatinine: 1, ascites: 'none', he: 'none' }, 4).total, 5);
  assert.equal(scoresOf({ bili: 1, inr: 1.1, creatinine: 1, ascites: 'none', he: 'none', albumin: 2.5 }, 4).total, 7);
  assert.equal(scoresOf({ bili: 3, inr: 1.5, creatinine: 2, na: 130, ascites: 'none', he: 'none' }, 4).meldNa, 26);
});

test('the bar has one cell for each total, 5 to 15, in the three classes', () => {
  assert.deepEqual(CP_ZONES.map((z) => z.to - z.from + 1), [2, 3, 6]);
});

test('the card is a chart tool and its frames are sound in every look and width', () => {
  assert.ok((CHART_TOOLS as readonly string[]).includes('scores'));
  for (const [key, facts] of Object.entries(SCORES_ON)) {
    for (const note of [true, false]) for (const [w, d] of [[300, 'phone-portrait'], [330, 'desktop'], [430, 'tablet-portrait']] as const) {
      judge(scoresFrame(scoresOf(facts, 2.8), ctxOf('light', w, d), { note }), 'light', { onCard: false });
      void key;
    }
  }
});
