// The data card's tiles are the 2D app's. tests/fixtures/tiles-2d.json (scripts/gen-tiles-2d.mjs --from <2D checkout>) holds what the 2D app's own tile modules (table-marks.js, card-tiles.js,
// num.js, vital-read.js) give for every slide of the decks H to P that has tiles or an instrument with readings in its header, on the 2D engine's state of that slide: which tiles, and per tile its
// name, number, unit, rating class and word, scale bar and "from" line. The 3D tiles (src/ui/cards/tiles-2d.ts, which TilesCard draws) must equal it, on the 2D engine's numbers and, for
// the HVPG talk, on the numbers of this app's own engine replaying the talk. No browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createCore } from '../src/engine/hales/host/worker-core.js';
import { HP_IDS, loadHpDeck } from '../src/decks/hp/index.ts';
import { chainOf, sequencer, changes, type Fp } from '../src/decks/hp/numbers.ts';
import { tilesAt, tileView, tileVal, ratedShown } from '../src/ui/cards/tiles-2d.ts';
import type { CopiedDeck } from '../src/decks/hp/types.ts';
import { hpNumbers, inPlayDecks } from './engine-departures.ts';
import { HP_LOADERS } from '../src/decks/hp/raw.ts';
import { showsLadder } from '../src/decks/overlay/ladder.ts';
import { INSTRUMENT_CARDS } from '../src/decks/overlay/instruments.ts';

interface Row { id: string; phone: boolean; tips: boolean; toolOnly: boolean; keys: string[]; head: string[]; tiles: Record<string, unknown>[] }
const tiles2d = JSON.parse(readFileSync(new URL('./fixtures/tiles-2d.json', import.meta.url), 'utf8')) as { decks: Record<string, Row[]> };
// (the 2D numbers are in the 2D slide order; a talk a review moved a slide of is joined to them by slide id, scripts/play-order.mjs)
const nums = JSON.parse(readFileSync(new URL('./fixtures/decks-hp-numbers.json', import.meta.url), 'utf8')) as { decks: Record<string, { id: string; fp: Fp }[]> };
nums.decks = inPlayDecks(nums.decks as never) as never;

/** The tiles whose rating is not the 2D table's (src/ui/cards/ratings.ts). */
/** Tiles the owner asked for beyond the 2D slide's (W14, 27 Nov 2026): deck/slide -> tile keys. */
const ADDED_TILES: Record<string, string[]> = { 'outflow/web': ['ivc'] };
const OWN_RATING: ReadonlySet<string> = new Set(['pv', 'whvp', 'sin', 'plt', 'pvFlow', 'fhvp', 'ra', 'ivc', 'hvpgFall', 'hvpg', 'eus']);

/** Equal, but for the positions on a bar (percent of its width): the fixture keeps the 2D numbers to six digits, so a position may differ in the fourth decimal. */
function same(a: unknown, b: unknown, at: string): void {
  if (typeof a === 'number' && typeof b === 'number') { assert.ok(Math.abs(a - b) < 0.01, `${at}: ${a} is not ${b}`); return; }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    assert.deepEqual(Object.keys(a), Object.keys(b), `${at}: fields`);
    for (const k of Object.keys(a)) same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${at}.${k}`);
    return;
  }
  // (the one departure from 2D: the post-TIPS PPG word is "Below 12 mmHg", not "… reference", so it stays on one row of a narrow tile)
  // (and the reviewer's, 24 Nov 2026: the stiffness tile says what it measures, a stiffness of 15 to 25 kPa reads "Likely cACLD" (Baveno VIII 1.3), and the ascites tile says the size of the volume, never a clinical grade)
  const SAY: Record<string, string> = { Stiffness: 'Liver stiffness', Borderline: 'Likely cACLD', 'HE risk index': 'Model HE index', 'Encephalopathy risk': 'Model HE index', 'Grade 1': 'Small', 'Grade 2': 'Moderate', 'Grade 3': 'Large' };
  assert.deepEqual(a, typeof b === 'string' ? (SAY[b] ?? b.replace(/( 12 mmHg) reference$/, '$1')) : b, at);
}

// A slide whose numbers this app's engine has moved on from the 2D app's (tests/engine-departures.ts: the recorded departures, npm run gen:departures) keeps the 2D tiles' shape (which tiles, which readings
// in the header, instrument card or not, each tile's name and unit), and its values are the tile code's own on the recorded numbers of that slide. Every other slide is the 2D tile to the digit.
const departed = (id: string, i: number): Record<string, number> | null => {
  const rec = hpNumbers()[id]?.[i]?.fp, two = nums.decks[id]?.[i]?.fp;
  return rec && two && Object.entries(two).some(([k, v]) => Math.abs((rec[k] ?? NaN) - (v as number)) > 1e-9 + 2e-5 * Math.abs(v as number)) ? rec : null;
};

async function check(d: CopiedDeck, results: { fp: Fp }[], where: string, live = false) {
  // (a slide whose tiles the pressure ladder or a reused instrument took over, decks/overlay/ladder.ts and instruments.ts, is no longer the 2D tile card:
  // tests/ladder-for-tiles.test.ts and tests/instrument-cards.test.ts pin what it is now)
  const raw = ((await HP_LOADERS[d.id]?.()) as CopiedDeck | undefined)?.slides ?? [];
  for (const row of tiles2d.decks[d.id] ?? []) {
    const i = d.slides.findIndex((s) => s.id === row.id);
    assert.ok(i >= 0, `${where}/${row.id}: not a slide of the copied deck`);
    if (raw.some((s) => s.id === row.id && showsLadder(s)) || INSTRUMENT_CARDS[`${d.id}/${row.id}`]) continue;
    const got0 = tilesAt(d.slides, results as never, i, row.phone)!;
    // (a tile the owner added on a slide, 27 Nov 2026 ruling W14, stands beside the 2D tiles; tests/numbers-shown.test.ts pins that the number a slide's words cite is shown)
    const added = ADDED_TILES[`${d.id}/${row.id}`] ?? [];
    for (const k of added) assert.ok(got0.keys.includes(k), `${where}/${row.id}: the added tile ${k} is on the slide`);
    const got = added.length ? { ...got0, keys: got0.keys.filter((k: string) => !added.includes(k)), head: got0.head.filter((k: string) => !added.includes(k)), tiles: got0.tiles.filter((t: { k: string }) => !added.includes(t.k)) } : got0;
    const at = `${where}/${row.id}${row.phone ? ' (phone)' : ''}`;
    assert.deepEqual(got.keys, row.keys, `${at}: which tiles`);
    assert.deepEqual(got.head, row.head, `${at}: which readings stand in the header`);
    assert.equal(got.toolOnly, row.toolOnly, `${at}: instrument card`);
    assert.equal(got.tiles.length, row.tiles.length, `${at}: tiles`);
    // (only the engine's own replay can differ from 2D: the 2D-numbers run above feeds the tile code the 2D numbers themselves)
    const rec = live ? departed(d.id, i) : null;
    const want = rec ? tilesAt(d.slides, [...results.slice(0, i), { fp: rec, params: (results[i] as { params?: unknown }).params }] as never, i, row.phone)! : null;
    if (want) assert.deepEqual(got.tiles.map((t) => [t.k, t.name, t.unit]), row.tiles.map((t) => [t.k, t.name, t.unit]), `${at}: which tiles, named as in 2D`);
    got.tiles.forEach((t, n) => {
      const ref = want ? want.tiles[n]! : row.tiles[n]!;
      const label = want ? `${at}: tile ${t.k} (engine departure)` : `${at}: tile ${t.k}`;
      // (the ratings the owner took off or changed, 27 Nov 2026 rulings C1 and C2, are not the 2D table's: tests/tile-ratings.test.ts pins what those tiles say; every other field is still the 2D tile's)
      if (!OWN_RATING.has(t.k)) return same(t, ref, label);
      const { rate: _r, word: _w, bar: _b, ...rest } = t as unknown as Record<string, unknown>;
      const { rate: _r2, word: _w2, bar: _b2, ...rest2 } = ref as unknown as Record<string, unknown>;
      same(rest, rest2, `${label} (its rating aside)`);
    });
  }
}

for (const id of HP_IDS) {
  test(`${id}: every tile of every slide is the 2D app's (name, number, unit, rating word and colour, scale bar, "from" line), on the 2D engine's numbers`, async () => {
    const d = await loadHpDeck(id);
    const g = nums.decks[id]!;
    assert.equal(g.length, d.slides.length);
    // (the 2D engine's parameters are not in the numbers fixture: a slide on a TIPS reads its PPG against the 12 mmHg line, which the fixture rows say)
    let last = 0;
    const stateOf = d.slides.map((s, j) => (j === 0 || changes(s) ? (last = j) : last));
    const results = g.map((x) => ({ fp: x.fp, params: undefined as unknown }));
    for (const r of tiles2d.decks[id] ?? []) if (r.tips) results[stateOf[d.slides.findIndex((s) => s.id === r.id)]!]!.params = { tips: { on: true } };
    await check(d, results, id);
  });
}

// The HVPG talk end to end: this app's engine replays its slides (the same 'sequence' the presenter runs) and the tiles come out as 2D's.
test('hvpg: the tiles on the numbers of this app\'s own engine replaying the talk equal the 2D app\'s', async () => {
  const d = await loadHpDeck('hvpg');
  const seq = sequencer(1);
  const core = createCore((m: never) => seq.message(m));
  core.handle({ type: 'run', running: false });
  await core.handle({ type: 'sequence', steps: chainOf(d.slides), reqId: 1 });
  core.dispose();
  const results = d.slides.map((_, i) => ({ fp: seq.results[i + 1]!.fp, params: seq.results[i + 1]!.params }));
  await check(d, results, 'hvpg (engine)', true);
});

test('the HVPG slides: the 2D tiles by name (HVPG slides 4, 9 and 11), so a change to the model or a tile table shows here by slide', async () => {
  const d = await loadHpDeck('hvpg');
  const g = nums.decks.hvpg!.map((x) => ({ fp: x.fp }));
  const slide = (id: string) => tilesAt(d.slides, g as never, d.slides.findIndex((s) => s.id === id), false)!;
  const sinus = slide('wedge-sinusoid');
  assert.deepEqual(sinus.tiles.map((t) => [t.name, t.text, t.unit, t.rate, t.word, t.key]), [['WHVP', '16.3', 'mmHg', 'hi', 'Very high', true], ['Sinusoidal pressure', '16.7', 'mmHg', 'hi', 'Very high', false]]);
  const eus = slide('eus');
  assert.equal(eus.toolOnly, true, 'the EUS slide is an instrument card: its readings are its header\'s');
  assert.deepEqual(eus.tiles.map((t) => [t.head.name, t.head.text, t.head.unit, t.rate]), [['HVPG', '3.4', 'mmHg', 'ok'], ['EUS-PPG', '14.9', 'mmHg', 'plain']]);
  const heart = slide('heart');
  assert.deepEqual(heart.tiles.map((t) => [t.k, t.text, t.rate, t.key]), [['whvp', '20.9', 'hi', false], ['fhvp', '20.4', 'hi', true], ['ra', '19.9', 'hi', true]]);
  for (const id of ['route', 'free', 'wedge', 'hvpg', 'presin', 'ppg', 'eus-ladder', 'bc', 'plane', 'summary']) assert.equal(slide(id).tiles.length, 0, `${id} has no tiles in 2D`);
});

test('a tile prints, rates and sits on its bar as the 2D tile does', () => {
  const f = { hvpg: 11.1, ppg: 13.1, whvp: 16.3465, plt: 90.1, asc: 4980 };
  assert.equal(tileVal('hvpg', 11.1), '11.1');
  assert.equal(tileVal('plt', 90.1), '90.1'.replace('.1', ''), 'platelets print whole');
  assert.equal(tileVal('hvpg', null), '—');
  assert.deepEqual(ratedShown('hvpg', f), ['hi', 'CSPH']);
  assert.equal(tileView('hvpg', f).bar!.zones.map((z) => z.rate).join(), 'ok,mid,hi', 'the bands follow the cut-offs 5 and 10');
  assert.equal(tileView('ppg', f).bar!.zones.map((z) => z.rate).join(), 'ok,mid,hi', 'PPG: 6 and 12');
  assert.deepEqual(tileView('ppg', f).bar!.labels.map((l) => l.text), ['6', '12']);
  assert.deepEqual(tileView('hvpg', f).bar!.labels.map((l) => l.text), ['5', '10']);
  assert.equal(ratedShown('ppg', f, true)[1], 'Above 12 mmHg', 'after TIPS the PPG is read against the 12 line, in words short enough for one row of a narrow tile');
  const moved = tileView('hvpg', f, { ref: { hvpg: 7.4 } });
  assert.equal(moved.delta, 'from 7.4');
  assert.equal(tileView('hvpg', f, { ref: { hvpg: 11.12 } }).delta, 'No change');
  assert.equal(tileView('hvpg', f).delta, '', 'a tile with no start says nothing, and keeps its line');
});

test('the tiles card is drawn on the 2D markup, and its data card wears the 2D card\'s state classes', () => {
  const card = readFileSync(new URL('../src/ui/cards/TilesCard.tsx', import.meta.url), 'utf8');
  for (const c of ['pz-tiles', 'pz-tile', 'pzt-k', 'pzt-vu', 'pzt-v', 'pzt-r', 'pzt-d', 'pzt-bar', 'pzb-track', 'pzb-zs', 'pzb-z', 'pzb-t', 'pzb-l', 'pzb-now', 'pzb-was', 'pzb-link', 'pz-dh', 'pz-hr', 'pz-hi', 'pz-hk']) assert.ok(card.includes(`"${c}`) || card.includes(`'${c}`) || card.includes(`${c}\``) || card.includes(`${c}$`) || card.includes(`${c} `), `TilesCard draws .${c}`);
  const layer = readFileSync(new URL('../src/ui/cards/CardLayer.tsx', import.meta.url), 'utf8');
  assert.match(layer, /'tiles-only'.*'col'.*'has-tool tool-only'/s);
});

test('the 2D HVPG quick check has four questions and pages by whole questions, evenly, on a screen too short for them (never a smaller type)', async () => {
  const { maxPages, pageOf } = await import('../src/ui/cards/pages.ts');
  const d = await loadHpDeck('hvpg');
  assert.equal(d.checks.length, 4);
  assert.equal(maxPages('check', undefined, d.checks.length), 4);
  const q = d.checks.map((_, i) => String(i));
  assert.deepEqual([0, 1].map((p) => pageOf(q, 2, p)), [['0', '1'], ['2', '3']], 'two pages of two');
  assert.deepEqual([0, 1, 2].map((p) => pageOf(q, 3, p)), [['0', '1'], ['2'], ['3']]);
  assert.deepEqual(pageOf(q, 1, 0), q, 'one page when the card fits');
});
