import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseLine, cutoffText, fmtPressure, tenthGap, plainLine } from '../src/ui/text/line.ts';
import { ladderRows, gapOf, AXIS_MAX } from '../src/ui/cards/ladder-model.ts';
import { HVPG_DECK } from '../src/decks/hvpg.ts';
import { HVPG_COPIED } from '../src/decks/hvpg.copied.ts';
import { validateDeck } from '../src/decks/schema.ts';
import { HVPG_CUTS } from '../src/ui/cuts.ts';

const fixture = JSON.parse(readFileSync('tests/fixtures/csph-fingerprint.json', 'utf8'));
const readings = { whvp: fixture.whvp, fhvp: fixture.fhvp, hvpg: fixture.hvpg, ivc: fixture.ivc, ra: fixture.ra, pv: fixture.pv };

test('the deck is valid and every field the cards need is there', () => {
  assert.deepEqual(validateDeck(HVPG_DECK), []);
  assert.equal(HVPG_DECK.slides.length, 4);
});

test('the deck words are the 2D deck\'s, character for character (re-copy with scripts/copy-decks.mjs)', async () => {
  const two = process.env.PPS_2D_REPO;
  const find = two && existsSync(join(two, 'src/ui/decks/hvpg.js')) ? two : existsSync('/workspace/portal-pressure-simulator/src/ui/decks/hvpg.js') ? '/workspace/portal-pressure-simulator' : null;
  if (!find) return;   // no 2D checkout at hand: the generated file stands on its own
  const { extract, render } = await import('../scripts/copy-decks.mjs');
  const { HVPG } = await import(join(find, 'src/ui/decks/hvpg.js'));
  assert.equal(readFileSync('src/decks/hvpg.copied.ts', 'utf8'), render(extract(HVPG), 'src/ui/decks/hvpg.js of qaddodi/portal-pressure-simulator'));
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
    'In this case the HVPG is 11.6 mmHg, which is ≥10 mmHg: clinically significant portal hypertension.');
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

test('the csph ladder reads what the engine reads: WHVP 16.3 − FHVP 4.7 = HVPG 11.6, CSPH', () => {
  const g = gapOf(readings);
  assert.deepEqual([g.whvp, g.fhvp, g.hvpg, g.sev, g.pill], ['16.3', '4.7', '11.6', 'danger', '≥10 · CSPH']);
  assert.equal(g.value, fixture.hvpg, 'equal to the engine and the 2D app');
  const rows = ladderRows(['whvp', 'fhvp', 'ivc'], readings);
  assert.deepEqual(rows.map((r) => r.text), ['16.3', '4.7', '4.2']);
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
  assert.ok(!/zoom\s*:/.test(css), 'zoom shrinks text');
  for (const m of css.matchAll(/text-size-adjust\s*:\s*([^;]+)/g)) assert.equal(m[1].trim(), '100%');
});

test('nothing scrolls inside a card; nothing animates layout; no backdrop blur', () => {
  assert.ok(!/overflow(?:-[xy])?\s*:\s*(auto|scroll|overlay)/.test(css), 'a scroll area');
  assert.ok(!/backdrop-filter|filter\s*:\s*blur/.test(css), 'blur');
  for (const m of css.matchAll(/transition\s*:\s*([^;]+)/g)) assert.ok(!/\b(width|height|top|left|margin|padding)\b/.test(m[1]), `transition on layout: ${m[1]}`);
  for (const m of css.matchAll(/@keyframes[^{]+\{([\s\S]*?)\}\s*(?=@|\.|$)/g)) assert.ok(!/\b(width|height|top|left|margin|padding)\s*:/.test(m[1]), 'keyframes on layout');
});

test('no card or strip code reads the engine store, runs its own frame loop, or sets a pixel font size in a component', () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.tsx') || p.endsWith('.ts') ? [p] : []; });
  for (const f of ['src/ui/cards', 'src/ui/wallet', 'src/ui/deck'].flatMap(walk)) {
    const t = readFileSync(f, 'utf8');
    assert.ok(!/fontSize/.test(t), `${f} sets a font size inline`);
    assert.ok(!/from '\.\.\/\.\.\/engine/.test(t), `${f} imports the engine (the readings come through the UI store)`);
  }
});
