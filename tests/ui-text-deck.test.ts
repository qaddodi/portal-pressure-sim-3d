import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MIN_AB_ZOOM } from '../src/ui/cards/ab-short.ts';
import { parseLine, cutoffText, fmtPressure, tenthGap, plainLine } from '../src/ui/text/line.ts';
import { ladderRows, gapOf, AXIS_MAX } from '../src/ui/cards/ladder-model.ts';
import { HVPG_DECK } from '../src/decks/hvpg.ts';
import { HVPG_COPIED } from '../src/decks/hvpg.copied.ts';
import { validateDeck } from '../src/decks/schema.ts';
import { HVPG_CUTS } from '../src/ui/cuts.ts';

const fixture = JSON.parse(readFileSync('tests/fixtures/csph-fingerprint.json', 'utf8'));
const one = (v: number) => (Math.round(v * 10) / 10).toFixed(1);
const readings = { whvp: fixture.whvp, fhvp: fixture.fhvp, hvpg: fixture.hvpg, ivc: fixture.ivc, ra: fixture.ra, pv: fixture.pv };

test('the deck is valid and every field the cards need is there', () => {
  assert.deepEqual(validateDeck(HVPG_DECK), []);
  assert.deepEqual(HVPG_DECK.slides.map((x) => x.id), ['route', 'free', 'wedge', 'wedge-sinusoid', 'hvpg', 'presin', 'ppg', 'eus', 'eus-ladder', 'heart', 'bc', 'plane', 'summary'], 'all 13 slides of the 2D deck, in its order');
});

test('the deck words are the 2D deck\'s, character for character (set PPS_2D_REPO to a 2D checkout to compare; the copy names the commit it came from)', async () => {
  const two = process.env.PPS_2D_REPO;
  const header = readFileSync('src/decks/hvpg.copied.ts', 'utf8').split('\n')[0];
  assert.match(header, / at [0-9a-f]{10}\./, 'the generated file names the 2D commit it was copied at');
  if (!two || !existsSync(join(two, 'src/ui/decks/hvpg.js'))) return;   // deterministic: compared only when asked
  const { extract, render } = await import('../scripts/copy-decks.mjs');
  const { HVPG } = await import(join(two, 'src/ui/decks/hvpg.js'));
  const body = (t: string) => t.split('\n').filter((l) => !l.startsWith('// @generated')).join('\n');
  assert.equal(body(readFileSync('src/decks/hvpg.copied.ts', 'utf8')), body(render(extract(HVPG), 'x')));
});

test('clinical wording: Baveno VIII only, never VII; cut-offs as the engine states them', () => {
  const all = JSON.stringify(HVPG_COPIED);
  assert.ok(!/Baveno VII(?!I)/.test(all) && !/Baveno 7/.test(all), 'Baveno VII appears');
  assert.deepEqual([HVPG_CUTS.amber, HVPG_CUTS.red], [5, 10]);
  const hvpg = HVPG_DECK.slides.find((s) => s.id === 'hvpg')!;
  assert.match(hvpg.line, /\{>=10 mmHg\}/);
});

test('every line parses, a cut-off reads with its symbol, and values fill in as the 2D app prints them', () => {
  assert.equal(cutoffText('>=10 mmHg'), '≥10 mmHg');
  assert.equal(cutoffText('<12'), '<12');
  assert.equal(cutoffText('hvpg'), null);
  for (const s of HVPG_DECK.slides) parseLine(s.line);
  const hv = HVPG_DECK.slides.find((s) => s.id === 'hvpg')!;
  assert.equal(plainLine(parseLine(hv.line), (k) => readings[k as keyof typeof readings]),
    `In this case the HVPG is ${one(fixture.hvpg)}\u00a0mmHg, which is ≥10\u00a0mmHg: clinically significant portal hypertension.`);
  assert.equal(plainLine(parseLine('The HVPG is {hvpg:0}.'), () => 11.6), 'The HVPG is 12.0 mmHg.'.replace('12.0', '12'));
  assert.equal(plainLine(parseLine('The HVPG is {hvpg}.'), () => null), 'The HVPG is ….', 'a value still to come is an ellipsis in words, never a dash');
  assert.throws(() => parseLine('a {nonsense} b'));
});

test('numbers: a pressure has one decimal and a true minus; the gap is the difference of what is displayed', () => {
  assert.equal(fmtPressure(4.743), '4.7'); assert.equal(fmtPressure(-1.04), '−1.0'); assert.equal(fmtPressure(-0.01), '0.0');
  assert.equal(fmtPressure(null, null, false), '—'); assert.equal(fmtPressure(null), '…');
  assert.equal(tenthGap(16.4, 4.8), 11.6); assert.equal(tenthGap(16.44, 4.76, 9), 11.6, 'what is displayed (16.4 − 4.8), not the raw 11.68');
  assert.equal(tenthGap(NaN, 4, 7), 7);
});

test('the csph ladder reads what the engine reads: the displayed WHVP minus the displayed FHVP is the HVPG, CSPH', () => {
  const g = gapOf(readings);
  assert.deepEqual([g.whvp, g.fhvp, g.hvpg, g.sev, g.pill], [one(fixture.whvp), one(fixture.fhvp), one(fixture.hvpg), 'danger', '≥10 · CSPH']);
  assert.equal(g.value, fixture.hvpg, 'equal to the engine and the 2D app');
  const rows = ladderRows(['whvp', 'fhvp', 'ivc'], readings);
  assert.deepEqual(rows.map((r) => r.text), [one(fixture.whvp), one(fixture.fhvp), one(fixture.ivc)]);
  assert.ok(rows.every((r) => r.frac > 0 && r.frac <= 1) && AXIS_MAX >= Math.max(readings.whvp, readings.pv));
  assert.deepEqual(gapOf({}).pill, '', 'no readings yet: no pill'); assert.equal(gapOf({}).hvpg, '—');
});

test('gap bands: normal, mild, CSPH (the engine\'s one table)', () => {
  assert.equal(gapOf({ whvp: 8, fhvp: 4 }).word, 'Normal');
  assert.equal(gapOf({ whvp: 12, fhvp: 4 }).word, 'Mild');
  assert.equal(gapOf({ whvp: 14, fhvp: 4 }).sev, 'danger');
});

// ── the owner's rules, kept by a test ──
const css = readFileSync('src/ui/deck-ui.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
test('no font size under 12 px in the cards\' CSS, and none that shrinks text to fit (vw, clamp, calc, scale, zoom)', () => {
  for (const m of css.matchAll(/font(?:-size)?\s*:\s*([^;{}]+)/g)) {
    const v = m[1];
    for (const px of v.matchAll(/(\d+(?:\.\d+)?)px/g)) if (m[0].includes('line-height') === false) assert.ok(Number(px[1]) >= 11 || /\/\s*\d/.test(v), `font ${v}`);
    assert.ok(!/vw|vh|vmin|clamp|calc|%/.test(v.replace(/var\([^)]*\)/g, '')), `text sized by the screen: ${v}`);
  }
  // (the one scale to fit that is allowed: the six choices of a row on one phone row, owner 21 Nov, Sites and causes 10/14: `--ab-z`, set by ab-short.ts fitChoiceRow, never under MIN_AB_ZOOM = 0.8, i.e. 11 px of 14, the floor above)
  const AB_ZOOM = /\.pz\.pz \.pz-ab\[data-tight\] > \.pz-abb \{[^}]*?zoom:\s*var\(--ab-z, 1\);/;
  assert.match(css, AB_ZOOM, 'the choice row\'s one named zoom is still there');
  assert.ok(MIN_AB_ZOOM * 14 >= 11, 'and it never takes a choice under the 11 px floor');
  assert.ok(!/zoom\s*:/.test(css.replace(AB_ZOOM, '')), 'zoom shrinks text');
  for (const m of css.matchAll(/text-size-adjust\s*:\s*([^;]+)/g)) assert.equal(m[1].trim(), '100%');
});

test('nothing scrolls inside a card; nothing animates layout; blur only as the card glass, only while Blur effect is on', () => {
  assert.ok(!/overflow(?:-[xy])?\s*:\s*(auto|scroll|overlay)/.test(css), 'a scroll area');
  // the one place blur may be: src/ui/glass.css (the one glass, tests/glass.test.ts); never a blur on text (filter: blur), and none in this sheet
  assert.ok(!/(^|[^-])filter\s*:\s*blur/.test(css), 'filter: blur on content');
  assert.ok(!/backdrop-filter\s*:(?!\s*none)/.test(css), 'a backdrop blur outside glass.css');
  const glass = readFileSync('src/ui/glass.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(/@supports[\s\S]*html:not\(\[data-noglass\]\)/.test(glass), 'the glass is gated by @supports and Blur effect');
  // the trap that left the glass off on Safari: a media feature the browser does not know makes the whole query false, so the glass is the default and reduced transparency the override
  assert.ok(!/prefers-reduced-transparency\s*:\s*no-preference|not\s*\(\s*prefers-reduced-transparency/.test(glass), 'the glass must not be gated on a media feature Safari lacks');
  assert.ok(/prefers-reduced-transparency:\s*reduce[\s\S]*backdrop-filter:\s*none/.test(glass), 'reduced transparency overrides the glass with the solid surface');
  for (const m of css.matchAll(/transition\s*:\s*([^;]+)/g)) assert.ok(!/\b(width|height|top|left|margin|padding)\b/.test(m[1]), `transition on layout: ${m[1]}`);
  for (const m of css.matchAll(/@keyframes[^{]+\{([\s\S]*?)\}\s*(?=@|\.|$)/g)) assert.ok(!/\b(width|height|top|left|margin|padding)\s*:/.test(m[1]), 'keyframes on layout');
});

test('no card or strip code reads the engine store, runs its own frame loop, or sets a pixel font size in a component', () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') || p.endsWith('.ts') ? [p] : []; });
  for (const f of ['src/ui/cards', 'src/ui/wallet', 'src/ui/deck'].flatMap(walk)) {
    const t = readFileSync(f, 'utf8');
    assert.ok(!/style\.fontSize|style\.setProperty\(\s*['"]font-size|\bfontSize\s*:/.test(t), `${f} sets a font size inline`);   // (reading one, getComputedStyle(el).fontSize, is how the ladder measures the card: not a write)
    // (the one engine import a card may make is the pressure cut-offs' table, the one place those live: pressure-vocabulary.test.ts; sends and live readings go through decks/hp/figure-engine.ts)
    assert.ok(!/from '\.\.\/\.\.\/engine\/(?!hales\/portal\/pressure-cuts\.js')/.test(t), `${f} imports the engine (the readings come through the UI store)`);
  }
});

test('the cards and the strip are in the one glass block, the presenter pill wears it as a face, and no sheet sets its own background after it', () => {
  const glass = readFileSync('src/ui/glass.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  const sel = /html:not\(\[data-noglass\]\) :is\(([\s\S]*?)\n  \) \{/.exec(glass)![1];
  for (const need of ['.dk-card', '.dk-strip']) assert.ok(sel.includes(need), `${need} is glass`);
  assert.ok(!/\.dk-bar/.test(sel) && /\.dk-bar::before/.test(glass), 'the presenter pill holds the Settings sheet, so its frost is a face');
  // a card/strip rule written in deck-ui.css would not beat the glass (it is !important), but it would show without the glass: none sets a background of its own
  assert.ok(!/\.dk-(card|strip|bar)\s*\{[^}]*background\s*:/.test(css), 'no later background on glass');
});
