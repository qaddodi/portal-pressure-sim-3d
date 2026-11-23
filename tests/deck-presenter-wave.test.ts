// The summary table's Doppler column (2D col-wave.js): which slides carry it, how a row's trace is placed in its cell, and what the cell says in words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tableOf } from '../src/decks/hp/deck.ts';
import { DOPPLER } from '../src/decks/ag/doppler.copied.ts';
import { DECK as PREHEPATIC } from '../src/decks/hp/data/prehepatic.copied.ts';
import { TWO_INFLOWS } from '../src/decks/rw/copied/two-inflows.ts';
import { tableModel, type ResolvedRow } from '../src/ui/talk/table-model.ts';
import { AWAY, MID, H, WAVE_MAX, wavePoints, waveStats, waveVessel, waveWords, waveMax, waveScale, packTrace, WAVE_SECS, WAVE_MIN, HEADING } from '../src/ui/talk/table-wave.ts';
import { waveFrame } from '../src/ui/talk/table-wave-frame.ts';

const tableSlides = (d: { slides: readonly Record<string, unknown>[] }) => d.slides.filter((s) => s.visual === 'table' && Array.isArray((s as { cols?: string[] }).cols) && (s as { cols: string[] }).cols.includes('wave'));

test('the three decks whose summary has a Doppler column carry its vessel to the table card', () => {
  for (const [d, vessel] of [[DOPPLER, 'PV_TRUNK'], [PREHEPATIC, 'PV_TRUNK'], [TWO_INFLOWS, 'A_HEP']] as const) {
    const s = tableSlides(d as never);
    assert.equal(s.length, 1, `${d.id}: one summary with a wave column`);
    const t = tableOf(s[0] as never)!;
    assert.ok(t.cols!.includes('wave'));
    assert.equal(t.wave, vessel, d.id);
  }
});

test('a row\'s vessel is its own, else the slide\'s, else the main portal vein; the scale is the slide\'s else 50 cm/s', () => {
  assert.equal(waveVessel({ wave: 'RHV_IVC' }, { wave: 'PV_TRUNK' }), 'RHV_IVC');
  assert.equal(waveVessel({}, { wave: 'A_HEP' }), 'A_HEP');
  assert.equal(waveVessel(undefined, undefined), 'PV_TRUNK');
  assert.equal(waveMax({}), WAVE_MAX); assert.equal(waveMax({ waveMax: 80 }), 80); assert.equal(waveMax({ waveMax: 0 }), 50);
});

test('a trace is placed on one scale: toward the probe above the baseline, an away vessel below it, a jet held at the edge, no flow on the baseline', () => {
  const t = { t: [0, 1, 2], v: [0, 25, -25] };
  const up = wavePoints(t, 'PV_TRUNK', 50, 120, 36);
  assert.equal(up.length, 6); assert.equal(up[0], 0); assert.equal(up[4], 120, 'the last sample is the cell\'s right edge');
  assert.equal(up[1], MID, 'zero flow is the baseline');
  assert.ok(up[3]! < MID, 'toward the probe is above'); assert.ok(up[5]! > MID, 'away is below');
  assert.equal(wavePoints(t, 'RHV_IVC', 50, 120, 36)[3]! > MID, true, 'the hepatic vein drains away from the probe: its forward flow is below');
  for (const v of AWAY) assert.ok(wavePoints({ t: [0, 1], v: [0, 20] }, v, 50, 120, 36)[3]! > MID, v);
  const jet = wavePoints({ t: [0, 1], v: [0, 400] }, 'PV_TRUNK', 50, 120, 36);
  assert.equal(jet[3], 1, 'held at the edge, 1 px in');
  const scaled = wavePoints({ t: [0, 1], v: [0, 25] }, 'PV_TRUNK', 100, 120, 36);
  assert.ok(scaled[3]! > up[3]!, 'a larger scale draws the same velocity lower');
  const tall = wavePoints(t, 'PV_TRUNK', 50, 120, 72);
  assert.equal(tall[1], (MID / H) * 72, 'a taller cell keeps the baseline in the middle');
});

test('the cell in words: the range as the scanner shows it, no flow named, a run past the scale said, a missing trace is not drawn', () => {
  const stats = waveStats({ t: [0, 1, 2], v: [10, 30, 20] }, 'PV_TRUNK')!;
  assert.deepEqual([stats.min, stats.max, stats.peak, stats.over, stats.none], [10, 30, 30, false, false]);
  assert.equal(waveWords({ t: [0, 1], v: [10, 30] }, 'PV_TRUNK').sr, 'Doppler of the main portal vein: 10 to 30 cm/s, toward the probe positive');
  assert.equal(waveWords({ t: [0, 1], v: [-10, -30] }, 'RHV_IVC').title, '10 to 30 cm/s', 'an away vessel is read as the scanner shows it');
  assert.equal(waveWords({ t: [0, 1], v: [0, 0.2] }, 'PV_TRUNK').sr, 'No flow in the main portal vein');
  assert.match(waveWords({ t: [0, 1], v: [0, 400] }, 'PV_TRUNK', 50).title, /past the 50 cm\/s scale/);
  assert.equal(waveStats(null, 'PV_TRUNK'), null); assert.equal(waveStats({ t: [0], v: [] }, 'PV_TRUNK'), null);
});

test('the table model gives the wave column its heading, a pending cell until the row is worked out, and the trace once it is in', () => {
  const spec = { cols: ['pvFlow', 'wave'], of: ['a', 'b'], wave: 'PV_TRUNK', asc: false };
  const f = { pvFlow: 1 };
  const trace = { t: [0, 1], v: [5, 25] };
  const rows: ResolvedRow[] = [
    { spec: { id: 'a' }, i: 1, f: null, title: 'a', kicker: '' },
    { spec: { id: 'b' }, i: 2, f, title: 'b', kicker: '', trace },
    { spec: { id: 'c', wave: 'RHV_IVC' }, i: 3, f, title: 'c', kicker: '' },
    { spec: { id: 'd' }, i: 4, f, title: 'd', kicker: '', trace: null },
  ];
  const m = tableModel(spec, rows);
  assert.equal(m.cols[1]!.label, HEADING); assert.ok(m.cols[1]!.cut.length > 40, 'a tap on the heading says how to read it');
  const cell = (r: number) => m.rows[r]!.cells[1]!;
  assert.equal(cell(0).kind, 'pend');
  assert.equal(cell(1).kind, 'wave'); assert.equal(cell(1).wave!.trace, trace); assert.equal(cell(1).wave!.pending, false); assert.equal(cell(1).wave!.max, 30, 'the row\'s own scale: its peak and a tenth, in 5s');
  assert.equal(cell(2).wave!.vessel, 'RHV_IVC'); assert.equal(cell(2).wave!.pending, true, 'not asked for yet');
  assert.equal(cell(3).wave!.pending, false); assert.equal(cell(3).wave!.trace, null, 'the model gave none');
  assert.match(cell(1).sr, /^Doppler of the main portal vein/);
});

test('the trace is drawn as two clipped halves of one path over a baseline, on the charts\' frame (no canvas of its own)', () => {
  const p = [0, 0, 0, 1] as const;
  const fr = waveFrame({ t: [0, 1], v: [0, 20] }, 'PV_TRUNK', 50, 120, 40, p, p, 'words');
  assert.equal(fr.w, 120); assert.equal(fr.h, 40); assert.equal(fr.label, 'words');
  assert.deepEqual(fr.shapes.map((s) => s.k), ['line', 'clip', 'path', 'unclip', 'clip', 'path', 'unclip']);
});

test('each row is drawn on its own scale: a still vein stays a line, a small pulse fills its half, a slide\'s waveMax is every row\'s scale', () => {
  assert.equal(waveScale({ t: [0, 1], v: [0, 0] }), WAVE_MIN, 'no flow is flat on the smallest scale');
  assert.equal(waveScale({ t: [0, 1], v: [-7, -13] }), WAVE_MIN, 'a slow reversed flow under the floor');
  assert.equal(waveScale({ t: [0, 1], v: [-12, 33] }), 40, 'the peak and a tenth, up to the next 5');
  assert.equal(waveScale({ t: [0, 1], v: [0, 33] }, { waveMax: 80 }), 80, 'the slide sets one scale');
  assert.equal(waveScale(null), 50); assert.equal(waveScale({ t: [], v: [] }), 50);
  const peak = Math.max(...[-12, 33].map(Math.abs));
  assert.ok(peak < waveScale({ t: [0, 1], v: [-12, 33] }), 'nothing runs to the edge');
});

test('a held trace is every second sample to 0.1 cm/s, and eight seconds of beats and breaths', () => {
  assert.equal(WAVE_SECS, 8);
  const w = { t: [0, 0.02, 0.04, 0.06, 0.08], v: [10.04, 11.26, 12.5, 13.74, 15.0] };
  assert.deepEqual(packTrace(w), { t: [0, 0.04, 0.08], v: [10, 12.5, 15] });
});
