import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CAUSE_TREATED } from '../src/decks/ag/cause-treated.copied.ts';
import { hvpgRate, ppgRate } from '../src/engine/hales/portal/pressure-cuts.js';
import { STATIONS, profileOf, blocksOf, blockSpan, nameFit, zoneSpans, pillReadings, stripLayout, namesLayout, braceD, braceLine, rowsOf, extraStep, causeFit, whole, BLOCK_FALL, type Fp } from '../src/ui/charts/ladder/model.ts';
import { stripFrame, namesFrame, ladderColumnFrame } from '../src/ui/charts/ladder/frame.ts';
import { ladderData, extraSteps } from '../src/ui/charts/ladder/data.ts';
import { ladderEntry, caseFp } from '../src/ui/charts/ladder/entry.ts';
import { measure } from '../src/ui/charts/measure.ts';
import { ctxOf, eachLook, judge } from './charts-helpers.ts';

const fp = caseFp;
const HEALTHY = fp(11, 8, 7, 6, 4, 3.5, 3.4, 2);
const SIN = fp(24, 22, 21, 15, 5, 4, 3.5, 2), PRE = fp(26, 24, 8, 6, 4, 3.5, 3.4, 2), HEART = fp(21, 19, 18, 17, 16, 15, 15, 14);
const tw = (t: string, w = 600) => measure(t, 13, w);

test('the profile is the eight stations in order, from the fingerprint keys the tiles read; without them there is none', () => {
  assert.deepEqual(STATIONS, ['INT', 'CONF', 'RPV', 'SIN_R', 'CV_R', 'RHV', 'IVCS', 'RA']);
  const p = profileOf(SIN)!;
  // station order: gut, portal vein, then the three liver stations (the portal venule has no tile of its own: the model's node), the wedged, central, free hepatic, IVC, RA
  assert.equal(p.v[0], 24); assert.equal(p.v[1], 22); assert.equal(p.v[2], 21); assert.equal(p.v[3], 15); assert.equal(p.v[4], 5); assert.equal(p.v[5], 4); assert.equal(p.v[6], 3.5); assert.equal(p.v[7], 2);
  assert.equal(p.hvpg, 11);
  assert.equal(profileOf(null), null);
  assert.equal(profileOf({ pv: 3 }), null);
});

test('the red blocks stand where the pressure falls by more than 4 mmHg from the portal vein on, and the heart holds up the end when the RA is over the healthy one', () => {
  assert.equal(BLOCK_FALL, 4);
  const hl = profileOf(HEALTHY)!;
  const fall = (f: Fp) => blocksOf(profileOf(f), hl).map((i) => STATIONS[i]);
  assert.deepEqual(fall(HEALTHY), []);
  assert.ok(fall(SIN).includes('SIN_R') || fall(SIN).includes('CV_R'), `${fall(SIN)}`);
  assert.deepEqual(fall(HEART), ['RA'], 'no fall anywhere, the pressure held up past the heart');
  // each block is as wide as the widest reading, never past its column
  const [x0, x1] = blockSpan(100, 40, tw);
  assert.ok(x1 - x0 <= 40 - 6 + 1e-9 && Math.abs((x0 + x1) / 2 - 100) < 1e-9);
});

test('the pills read the HVPG and the PPG on the guideline cut-offs, and a stent takes the HVPG away', () => {
  const pl = pillReadings(SIN);
  assert.deepEqual(pl.map((q) => [q.k, q.name, q.v, q.rate]), [['hvpg', 'HVPG', '11', hvpgRate(11)], ['ppg', 'PPG', '19', ppgRate(18.5)]]);
  assert.deepEqual(pillReadings({ ...SIN, tipsFlow: 1 }).map((q) => q.k), ['ppg']);
  assert.deepEqual(pillReadings({}), []);
  assert.equal(whole(2.5), '3');
});

test('the names fit at every width the strip is drawn in: in order, on one row where they can, and the liver\'s three are named Pre-, Intra-, Post-', () => {
  for (const slot of [24, 30, 36, 44, 60, 90]) {
    const f = nameFit(slot, (t) => tw(t, 500));
    assert.equal(f.names.length, 8);
    assert.deepEqual([f.names[2], f.names[3], f.names[4]], ['Pre-', 'Intra-', 'Post-']);
    assert.ok(f.rows === 1 || f.rows === 2);
  }
  assert.equal(nameFit(90, (t) => tw(t, 500)).rows, 1);
  assert.deepEqual(zoneSpans(), [[0, 1], [2, 4], [5, 7]]);
});

test('the strip: a reading on every station, a line between them that stops short of each, the blocks on their columns', () => {
  const L = stripLayout(330, 13, SIN, HEALTHY, tw)!;
  assert.equal(L.labels.length, 8);
  assert.equal(L.segs.length, 7);
  L.segs.forEach(([a, b], i) => assert.ok(a > L.x(i) && b < L.x(i + 1) && b > a));
  assert.equal(L.h, Math.ceil(1.9 * 13));
  assert.equal(L.zones.length, 3);
  assert.equal(stripLayout(330, 13, {}, HEALTHY, tw), null);
  assert.match(L.label, /^Pressure from gut to heart: Intestine 24, Portal vein 22, .*Sinusoid \(WHVP\) 15/);
  const N = namesLayout(330, 13, tw);
  assert.ok(N.h > 0 && N.brace && N.brace.xa < N.brace.xb);
});

test('the brace is the 2D path, flattened', () => {
  const d = braceD(10, 110, 0, 8);
  assert.match(d, /^M10\.0 0\.0Q10\.0 4\.0 /);
  const pts = braceLine(d, 20);
  assert.deepEqual(pts.slice(0, 2), [10, 20]);
  assert.ok(Math.abs(pts.at(-2)! - 110) < 1e-9 && Math.abs(pts.at(-1)! - 20) < 1e-9);
  assert.ok(pts.length > 20);
});

test('a cause steps down beside its site and goes under it only when 12 px does not fit (the 2D cause-fit)', () => {
  assert.deepEqual(causeFit(14, 100, 120, 12), { size: 14, under: false });
  assert.deepEqual(causeFit(14, 100, 90, 12), { size: 12.6, under: false });
  assert.equal(causeFit(14, 100, 60, 12).under, true);
});

test('the rows: a slide by id with its own state, a patient of its own after the healthy one, a row without numbers left out', () => {
  const slides = [{ id: 'a', kicker: 'K1', title: 'Title one', site: 'sin' }, { id: 'b', kicker: 'K2', title: 'Title two' }];
  const fps = [{}, SIN, PRE];
  const rows = rowsOf(['a', { id: 'b', name: 'Short' }, { preset: 'x', name: 'Own', kicker: 'Z' }, 'nope'], slides, fps, [HEART]);
  assert.deepEqual(rows.map((r) => [r.id, r.name, r.kicker, r.site]), [['a', 'Title one', 'K1', 'sin'], ['b', 'Short', 'K2', null], [null, 'Own', 'Z', null]]);
  assert.equal(rows[0]!.f, SIN); assert.equal(rows[2]!.f, HEART);
  assert.equal(extraStep('a'), null);
  assert.deepEqual(extraStep({ preset: 'x', relax: 5 }), { preset: 'x', relax: 5 });
  assert.deepEqual(extraSteps(['a', { preset: 'x' }]).map((s) => s.preset), ['healthy', 'x']);
});

test('the data: one run for the deck\'s states, one for the healthy and the rows of their own, and the rows come back in the slide\'s order', async () => {
  const deck = JSON.parse(JSON.stringify(CAUSE_TREATED));
  const asks: number[] = [];
  const run = async (steps: unknown[]) => { asks.push(steps.length); return steps.map((_, i) => ({ ...SIN, hvpg: i })); };
  const slide = { id: 'l', of: [deck.slides[0].id, { id: deck.slides[1].id, name: 'Second' }] };
  const d = await ladderData(slide, deck, run as never);
  assert.equal(d.rows.length, 2);
  assert.equal(d.rows[1]!.name, 'Second');
  assert.ok(d.healthy);
  assert.equal(asks.length, 2);
  await ladderData(slide, deck, run as never);
  assert.equal(asks.length, 3, 'the deck\'s states are kept');
});

test('every look and width: the strip, the names and the column are sound, words never under 12 px', () => {
  eachLook((look) => {
    for (const [w, d] of [[300, 'phone-portrait'], [330, 'desktop'], [430, 'tablet-portrait'], [700, 'desktop']] as const) {
      const c = ctxOf(look, w, d);
      for (const f of [SIN, PRE, HEART, HEALTHY]) { const s = stripFrame(f, HEALTHY, c)!; judge(s, look, { onCard: false }); assert.equal(s.w, w); }
      judge(namesFrame(c), look, { onCard: false });
      judge(ladderColumnFrame([{ fp: SIN, healthy: HEALTHY }, { fp: HEART, healthy: HEALTHY }], c), look, { onCard: false });
    }
  });
  assert.equal(stripFrame(null, HEALTHY, ctxOf('light', 300)), null);
});

test('the copied files are what the 2D app gives (the script says so), and the registry marks the chart done', () => {
  const src = readFileSync(new URL('../src/ui/charts/ladder/profile-pure.generated.js', import.meta.url), 'utf8');
  assert.match(src, /^\/\/ @generated by scripts\/copy-chart-small\.mjs from the 2D app's src\/ui\/tool-profile\.js/);
  assert.equal(ladderEntry.status, 'done');
  assert.ok(ladderEntry.specimens.length >= 3);
});
