// Capture 36b7deac: the same cause printed different numbers on different slides of Sites and causes (schistosomiasis' intra-sinusoidal point 9 on the chart and 8 on the six-case
// table, sinusoidal obstruction's PPG 12.4 and 13). The root: three copies of the 2D profile code, each with its own rounding, and a strip that nudged a reading to close a sum.
// The rule pinned here, for every cause of the deck and every surface that prints it: a station is its engine reading rounded to the whole mmHg, a gradient is its engine reading to a
// tenth, and the chart, the phone strip, the pills, the plane, the table and what a screen reader hears all print the same text for the same site.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chainOf } from '../src/decks/hp/numbers.ts';
import { runStepsNode } from '../src/decks/rw/numbers-node.ts';
import { SITES } from '../src/decks/rw/copied/sites.ts';
import { SPANS, STATIONS, SPOKEN, spansFor, goalOf, planProfile, profileOf, profileWords, pillReadings, type Fp } from '../src/ui/charts/profile/model.ts';
import { profileFrameAtRest } from '../src/ui/charts/profile/frame.ts';
import { stripFrame } from '../src/ui/charts/ladder/frame.ts';
import { stripLabel, rowsOf } from '../src/ui/charts/ladder/model.ts';
import { valOf } from '../src/ui/charts/plane/model.ts';
import { valueText } from '../src/ui/talk/table-model.ts';
import { NOT_MEASURABLE, hvpgNotMeasurable } from '../src/ui/cuts.ts';
import { gapText, stationText } from '../src/ui/charts/readings.ts';
import type { TextShape } from '../src/ui/charts/scene.ts';
import { ctxOf } from './charts-helpers.ts';

// The engine's key for each station's reading (the tile that prints it); the portal venule has none of its own.
const KEY: Record<string, string | null> = { INT: 'int', CONF: 'pv', RPV: null, SIN_R: 'whvp', CV_R: 'cv', RHV: 'fhvp', IVCS: 'ivc', RA: 'ra' };
// The table's column key for each (pressures it prints).
const TABLE_KEYS = ['pv', 'whvp', 'fhvp', 'ivc', 'ra'];

type Row = { id: string; fp: Fp };
async function causes(): Promise<{ rows: Row[]; healthy: Fp; all: Fp[] }> {
  const fps = (await runStepsNode(chainOf(SITES.slides as never) as never)) as unknown as Fp[];
  const rows = SITES.slides.map((s, i) => ({ id: s.id as string, fp: fps[i + 1]! })).filter((r) => r.fp && Number.isFinite(r.fp.hvpg as number));
  return { rows, healthy: rows.find((r) => r.id === 'healthy')!.fp, all: fps };
}

/** What every surface must print for a site: the stations whole, the gradients to a tenth, straight from the engine's own numbers. */
function expected(fp: Fp) {
  const stations = STATIONS.map((s, i) => { const k = KEY[s]; return k ? Math.round(fp[k] as number) : Math.round(profileOf(fp)!.v[i]!); }).map((r) => (r < 0 ? `−${-r}` : String(r)));
  return { stations, hvpg: (Math.round((fp.hvpg as number) * 10) / 10).toFixed(1), ppg: (Math.round((fp.ppg as number) * 10) / 10).toFixed(1) };
}
const words = (f: { shapes: readonly { k: string }[] }) => (f.shapes.filter((s): s is TextShape => s.k === 'text') as TextShape[]).map((s) => s.s);

test('the deck has a cause at each of its six levels, and its states are the engine\'s', async () => {
  const { rows } = await causes();
  for (const id of ['healthy', 'pvt', 'presin', 'sin', 'postsin', 'post', 'cardiac']) assert.ok(rows.some((r) => r.id === id), id);
});

test('every surface prints a site as every other does: chart, phone strip, pills, plane, table and the spoken words', async () => {
  const { rows, healthy } = await causes();
  const c = ctxOf('light', 390, 'phone-portrait');
  for (const { id, fp } of rows) {
    const want = expected(fp), p = profileOf(fp)!;
    // the profile chart at rest: the eight readings on their dots, both gradients in their brackets, and the words a screen reader hears
    // (a site whose hepatic vein is blocked has no HVPG to draw or print: its spans, its pill and its table cell say so; ui/cuts.ts)
    const nm = hvpgNotMeasurable(fp), spans = spansFor(['hvpg', 'eus', 'ppg'], fp);
    const plan = planProfile(c.w, 0, Math.max(12, c.type.sm), goalOf(p, profileOf(healthy), null), profileOf(healthy), null, spans);
    const chart = profileFrameAtRest(plan, c), cw = words(chart);
    for (const [i, t] of want.stations.entries()) assert.ok(cw.includes(t), `${id}: chart prints station ${STATIONS[i]} as ${t}, it prints ${cw.join(' ')}`);
    if (nm) assert.ok(cw.includes(want.ppg) && !cw.includes(want.hvpg), `${id}: chart prints no HVPG, ${cw.join(' ')}`);
    else assert.ok(cw.includes(want.hvpg) && cw.includes(want.ppg), `${id}: chart's gradients ${want.hvpg} and ${want.ppg} in ${cw.join(' ')}`);
    assert.equal(chart.label, profileWords(plan.goal, spans));
    // the phone strip: the same eight readings, in station order
    const strip = stripFrame(fp, healthy, c)!, sw = words(strip);
    assert.deepEqual(sw, want.stations, `${id}: the strip prints the chart's readings`);
    // the pills of the strip's cell: the gradients, to a tenth
    assert.deepEqual(pillReadings(fp).map((q) => [q.k, q.v]), [['hvpg', nm ? NOT_MEASURABLE : want.hvpg], ['ppg', want.ppg]], `${id}: pills`);
    // the plane's dot readout and the table's columns
    assert.equal(valOf('hvpg', fp.hvpg as number), want.hvpg, `${id}: plane HVPG`);
    assert.equal(valOf('ppg', fp.ppg as number), want.ppg, `${id}: plane PPG`);
    assert.equal(valueText('hvpg', fp as never), want.hvpg, `${id}: table HVPG`);
    assert.equal(valueText('ppg', fp as never), want.ppg, `${id}: table PPG`);
    for (const k of TABLE_KEYS) {
      const st = STATIONS.find((s) => KEY[s] === k)!;
      assert.equal(valueText(k, fp as never), want.stations[STATIONS.indexOf(st)], `${id}: table ${k}`);
    }
    // what a screen reader hears, chart and strip
    for (const label of [chart.label, strip.label, stripLabel(fp)]) for (const [i, s] of STATIONS.entries()) assert.ok(label.includes(`${SPOKEN[s]} ${want.stations[i]}`), `${id}: "${label}" says ${SPOKEN[s]} ${want.stations[i]}`);
  }
});

test('the six-case table reads each cause from the same state as its own slide', async () => {
  const { rows, all } = await causes();
  const ladder = SITES.slides.find((s) => s.id === 'ladders')!;
  const made = rowsOf(ladder.of as never, SITES.slides as never, all as never, []);
  assert.equal(made.length, 6);
  for (const r of made) {
    const own = rows.find((x) => x.id === r.id)!;
    assert.deepEqual(expected(r.f), expected(own.fp), `${r.id}: the table row and the slide print the same`);
  }
});

test('no reading is nudged to close a sum: schistosomiasis\' wedge is its own 8.79 on every surface, and a gradient is its own number', async () => {
  const { rows, healthy } = await causes();
  const s = rows.find((r) => r.id === 'presin')!.fp;
  assert.equal(stationText(s.whvp as number), '9');
  const strip = words(stripFrame(s, healthy, ctxOf('light', 390, 'phone-portrait'))!);
  assert.equal(strip[STATIONS.indexOf('SIN_R')], '9');
  const sos = rows.find((r) => r.id === 'postsin')!.fp;
  assert.equal(gapText(sos.ppg as number), pillReadings(sos).find((q) => q.k === 'ppg')!.v);
});

test('one formatter: a station is whole mmHg, a gradient one decimal, a true minus, never "−0"', () => {
  assert.equal(stationText(8.79), '9'); assert.equal(stationText(2.5), '3'); assert.equal(stationText(-0.2), '0'); assert.equal(stationText(-3.2), '−3');
  assert.equal(gapText(0.5), '0.5'); assert.equal(gapText(13), '13.0'); assert.equal(gapText(-0.04), '0.0');
});
