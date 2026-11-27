// Owner's ruling L13 (27 Nov 2026, review 3531bdfa F-D6): a number has ONE colour, its series colour, wherever it is printed or drawn: in the slide's words, on the data card's tile and header, in the chart and on the figure's label.
// The series colours are the charts' own table (READING_COLOUR). Pinned over every deck's lines, tiles and figure plans, and over the one place each surface asks (series-tone.ts), so no surface can colour a number by its rating again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UI } from '../src/ui/strings.generated.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { parseLine } from '../src/ui/text/line.ts';
import { pillTone } from '../src/ui/text/pill-tone.ts';
import { seriesToken, seriesInk, seriesAttrs, labelTone, STATION_READING } from '../src/ui/text/series-tone.ts';
import { READING_COLOUR } from '../src/ui/charts/plot/reading-colours.generated.js';
import { LINE } from '../src/ui/charts/flowtime/model.ts';
import { figurePlan } from '../src/ui/deck/figure-plan.ts';
import { copiedOf } from '../src/decks/hp/deck.ts';
import type { Slide } from '../src/decks/schema.ts';

const RC = READING_COLOUR as Record<string, string>;
/** A tone as the figure writes it ('hv') or as the table does ('--tr-hv'): one token. */
const norm = (t: string): string => (t.startsWith('--') ? t : `--tr-${t}`);
const decks = await Promise.all(UI.decks.map(async ({ id }) => (await loadBuiltin(id))!));
const slides = decks.flatMap((d) => d.slides.map((s: Slide) => ({ d, s, at: `${d.id}/${s.id}` })));

test('the series colour of every reading is the charts\' one table, and its text ink is the theme\'s own mix of it', () => {
  for (const [k, token] of Object.entries(RC)) {
    assert.equal(seriesToken(k), token);
    assert.equal(seriesInk(k), `var(${token}-ink)`);
    assert.deepEqual(seriesAttrs(k), { 'data-series': '', style: { '--vc': `var(${token}-ink)` } });
  }
  assert.equal(seriesToken('saag'), null, 'a reading no chart colours has none');
  assert.deepEqual(seriesAttrs('saag'), {}, 'and its tile keeps its rating ink');
  const css = readFileSync('src/ui/styles/tokens.css', 'utf8');
  for (const token of new Set(Object.values(RC))) assert.match(css, new RegExp(`${token}-ink:`), `${token} has a text ink in the theme`);
});

test('the words: every value of every slide\'s line takes its series colour whatever its rating, and no rating attribute can recolour it', () => {
  const keys = new Map<string, number>();
  for (const { s } of slides) for (const p of parseLine(s.line ?? '')) if (p.t === 'value') keys.set(p.key, (keys.get(p.key) ?? 0) + 1);
  assert.ok(keys.size > 15 && [...keys.values()].reduce((a, b) => a + b) > 400, `${keys.size} readings in the words`);
  const plain: string[] = [];
  for (const k of keys.keys()) {
    for (const v of [0.5, 5, 14, 22, 60, 130]) {
      const r = pillTone(k, { [k]: v, asc: 2000, sbp: 120, dbp: 70, map: 85 });
      if (RC[k]) { assert.equal(r.tone, RC[k], `{${k}} at ${v}`); assert.equal(r.rate, null, `{${k}}: no rating colours it`); }
    }
    if (!RC[k]) plain.push(k);
  }
  // (the readings with no series colour keep 2D's rating or station colour; the list may only shrink)
  assert.deepEqual(plain.sort(), plain.sort().filter((k) => !RC[k]));
  assert.ok(['hvpg', 'ppg', 'pv', 'whvp', 'fhvp', 'ivc', 'ra', 'asc'].every((k) => keys.has(k) && RC[k]), 'the pressures and the ascites are in it');
});

test('the chart: the flow-time lines wear the same series colour as the words and the tiles', () => {
  const lines = LINE as Record<string, { tok?: string; col?: string; color?: string }>;
  let n = 0;
  for (const [k, def] of Object.entries(lines)) {
    const got = JSON.stringify(def);
    if (!RC[k]) continue;
    assert.ok(got.includes(RC[k]!.replace(/^--/, '')), `${k}: its chart line is ${RC[k]} (${got.slice(0, 80)})`);
    n++;
  }
  assert.ok(n >= 4, `${n} flow-time lines checked`);
});

/** The stations that print a reading, and the readings that can light them (the wedged station is the sinusoids': a WHVP term lights it in the WHVP's colour, a sinusoidal one in the sinusoidal pressure's). */
const NODE_READINGS: Record<string, string[]> = { CONF: ['pv'], SIN_R: ['sin', 'whvp'], RHV: ['fhvp'], IVCS: ['ivc'], RA: ['ra'] };
test('the figure: every station label the slides light that prints a reading wears that reading\'s series colour, and so does the word that points at it', () => {
  let checked = 0;
  for (const { d, s, at } of slides) {
    const cs = copiedOf(d.id)?.slides.find((x) => x.id === s.id);
    if (!cs) continue;
    const plan = figurePlan(cs as never);
    for (const [node, tone] of Object.entries(plan.tones)) {
      const readings = NODE_READINGS[node];
      if (!readings) continue;
      assert.ok(readings.some((r) => norm(tone) === RC[r]), `${at}: ${node} (${readings.join(' or ')}) is lit in ${tone}`);
      checked++;
    }
  }
  assert.ok(checked > 30, `${checked} lit station labels checked`);
  for (const [t, r] of Object.entries(STATION_READING)) assert.equal(labelTone(t, 'anything'), RC[r], `${t}`);
  assert.equal(labelTone('liver', 'wedge'), 'wedge', 'an organ keeps its own tone: it is a place, not a number');
  assert.equal(labelTone('RA', '--tour-sys'), '--tr-ra', 'the right atrium: grey on the chart, grey on the figure (it was the tour blue)');
});

test('the tile and its header: the number takes --vc from the series, the rating ink is dropped from the number and kept on the rating word', () => {
  const card = readFileSync('src/ui/cards/TilesCard.tsx', 'utf8');
  assert.match(card, /<span className="pzt-v" \{\.\.\.seriesAttrs\(t\.k\)\}>/);
  assert.match(card, /<b \{\.\.\.seriesAttrs\(x\.k\)\}>/);
  const css = readFileSync('src/ui/humanized.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /\.pz-tile \.pzt-v\[data-series\] \{ color: var\(--vc\); \}/);
  assert.match(css, /\.pz-hi > b\[data-series\] \{ color: var\(--vc\); \}/);
  // (the rating word keeps its ink: nothing here touches .pzt-r)
  assert.doesNotMatch(css.slice(css.indexOf('.pzt-v[data-series]')), /\.pzt-r \{[^}]*--vc/);
});
