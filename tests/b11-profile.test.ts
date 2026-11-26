import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { NODES } from '../src/engine/hales/portal/topology.js';
import { paletteOf } from '../src/ui/charts/palette.ts';
import { blend, compatible } from '../src/ui/charts/morph.ts';
import { profileFrame, formOf, newLock, itemsOf, smoothPoly, pressureColour, PATHS } from '../src/ui/tests/profile/model.ts';
import { readings } from '../src/ui/tests/profile/readings.ts';
import { hvpgSev } from '../src/engine/hales/portal/pressure-cuts.js';
import type { TextShape } from '../src/ui/charts/scene.ts';

const IDX = Object.fromEntries((NODES as { id: string }[]).map((n, i) => [n.id, i]));
const pressures = (over: Record<string, number> = {}) => {
  const P = new Float32Array(NODES.length);
  const base: Record<string, number> = { INT: 19, CONF: 18, RPV: 17.5, SIN_R: 15, CV_R: 8.5, RHV: 7, IVCS: 5, RA: 3, ...over };
  for (const [k, v] of Object.entries(base)) P[IDX[k]!] = v;
  return P;
};
const healthy = pressures({ INT: 8, CONF: 7, RPV: 6.5, SIN_R: 5, CV_R: 4, RHV: 3.5, IVCS: 3, RA: 2 });
const metrics = { whvp: 15, fhvp: 7, hvpg: 8, pv: 18, ivc: 5, ppg: 13 };
const pal = paletteOf('light');
const input = (over = {}) => ({ P: pressures(), metrics, healthy, ...over });
const words = (f: { shapes: readonly { k: string }[] }) => (f.shapes.filter((s) => s.k === 'text') as TextShape[]);

test('the path is the 2D app\'s: eight stations gut to heart, the liver span, the HVPG and PPG brackets', () => {
  const p = PATHS[0]!;
  assert.deepEqual(p.nodes, ['INT', 'CONF', 'RPV', 'SIN_R', 'CV_R', 'RHV', 'IVCS', 'RA']);
  assert.deepEqual(p.liver, ['RPV', 'CV_R']);
  assert.deepEqual(p.dims!.map((d) => [d.k, d.hi, d.lo]), [['HVPG', 'SIN_R', 'RHV'], ['PPG', 'CONF', 'IVCS']]);
  for (const n of p.nodes) assert.ok(IDX[n] != null, `${n} is a node`);
});

test('a roomy plot names the stations, writes each value, the LIVER band and both brackets with the tiles\' numbers', () => {
  const o = profileFrame(input(), { w: 700, h: 300, pal }, newLock());
  assert.equal(o.form, 'plot');
  const w = words(o.frame).map((t) => t.s);
  for (const n of ['Intestine', 'Portal vein', 'Portal venule', 'Sinusoid', 'Central vein', 'Hepatic vein', 'IVC', 'RA']) assert.ok(w.includes(n), `${n} named`);
  assert.ok(w.includes('LIVER'));
  assert.ok(w.includes('HVPG ') && w.includes('PPG '), 'the two bracket pills');
  assert.ok(w.includes('8.0') && w.includes('13.0'), `the HVPG (WHVP − FHVP = 8.0) and the PPG (18.0 − 5.0 = 13.0) read as the tiles read them: ${w.join('|')}`);
  assert.ok(w.includes('mmHg'));
  for (const v of ['19.0', '15.0', '3.0']) assert.ok(w.includes(v), `${v} printed`);
});

test('narrow names turn 30° and end under their points (2D stagger); the axis follows the highest of now, healthy and the compared moment', () => {
  const o = profileFrame(input(), { w: 460, h: 300, pal }, newLock());
  const turned = words(o.frame).filter((t) => t.rot === -30);
  assert.equal(turned.length, 8, 'every station name is turned');
  assert.ok(turned.every((t) => t.anchor === 'end' && t.baseline === 'middle'));
  assert.equal(o.maxP, 25, 'axisTop(19) = ceil(21 / 5) × 5');
  const hi = profileFrame(input({ snap: pressures({ CONF: 31 }) }), { w: 460, h: 300, pal }, newLock());
  assert.equal(hi.maxP, 35);
  assert.equal(hi.compared, true);
});

test('hiding the HVPG leaves its bracket and pill out; the PPG keeps its row', () => {
  const o = profileFrame(input({ hidden: new Set(['trueHVPG']) }), { w: 700, h: 300, pal }, newLock());
  const w = words(o.frame).map((t) => t.s);
  assert.ok(!w.includes('HVPG ') && w.includes('PPG '));
});

test('a plot too short for its pills becomes the band under the names, and a shorter one the strip of five stations (2D: never a label over the line)', () => {
  const lock = newLock();
  const band = profileFrame(input(), { w: 520, h: 190, pal }, lock);
  assert.ok(band.form === 'band' || band.form === 'strip', band.form);
  const strip = profileFrame(input(), { w: 360, h: 112, pal }, newLock());
  assert.equal(strip.form, 'strip');
  const w = words(strip.frame).map((t) => t.s);
  assert.deepEqual(w.slice(0, 5), ['Portal v.', 'Sinusoid', 'RHV', 'IVC', 'RA']);
  assert.ok(w.includes('mmHg') && w.includes('HVPG ') && w.includes('PPG '));
  const lock2 = newLock();
  profileFrame(input(), { w: 360, h: 112, pal }, lock2);
  assert.equal(profileFrame(input(), { w: 360, h: 112, pal }, lock2).form, 'strip', 'the strip stays while the size does');
});

test('the same inputs give the same frame; a small change keeps the frame\'s shape so the painter can glide it', () => {
  const a = profileFrame(input(), { w: 700, h: 300, pal }, newLock()).frame;
  const b = profileFrame(input(), { w: 700, h: 300, pal }, newLock()).frame;
  assert.deepEqual(a, b);
  const c = profileFrame(input({ P: pressures({ CONF: 18.4, SIN_R: 15.2 }) }), { w: 700, h: 300, pal }, newLock()).frame;
  assert.ok(compatible(a, c), 'one shape, so it blends');
  assert.equal(blend(a, c, 0.5).shapes.length, a.shapes.length);
});

test('the curve never dips where the points only rise (monotone), with the same count of samples whatever the numbers', () => {
  const pts = [[0, 10], [10, 12], [20, 40], [30, 41], [40, 80]];
  const poly = smoothPoly(pts, 12);
  assert.equal(poly.length, 4 * 12 + 1);
  for (let i = 1; i < poly.length; i++) assert.ok(poly[i]![1]! >= poly[i - 1]![1]! - 1e-9);
});

test('the pressure ramp is the look\'s own and clamps at 35; the stations read as the path names them', () => {
  assert.notDeepEqual(pressureColour(3, 'light'), pressureColour(30, 'light'));
  assert.deepEqual(pressureColour(40, 'light'), pressureColour(35, 'light'));
  assert.deepEqual(itemsOf({ P: pressures() }).map((i) => i.name), ['Intestine', 'Portal vein', 'Portal venule', 'Sinusoid', 'Central vein', 'Hepatic vein', 'IVC', 'RA']);
});

test('the three readings under the chart: a word only when the number is not normal', () => {
  const r = readings(metrics, null);
  assert.deepEqual(r.map((x) => x.name), ['HVPG', 'PPG', 'Portal vein']);
  assert.equal(r[0]!.text, '8.0');
  assert.equal(r[0]!.sev, hvpgSev(8));
  assert.ok(r[0]!.word, 'an HVPG of 8 is not normal and says so');
  assert.deepEqual(readings({ hvpg: 3, ppg: 4, pv: 8 }, null).map((x) => x.word), ['', '', ''], 'normal readings carry no word');
  assert.equal(readings(metrics, new Set(['trueHVPG']))[0]!.text, '—', 'an HVPG not measured is not shown');
});

test('a turned word glides its turn like its place (morph.ts blends rot)', () => {
  const f = (rot: number | undefined) => ({ w: 10, h: 10, label: '', shapes: [{ k: 'text' as const, x: 0, y: 0, s: 'a', size: 12, color: [0, 0, 0, 1] as const, rot }] });
  assert.equal((blend(f(0), f(-30), 0.5).shapes[0] as TextShape).rot, -15);
  assert.equal((blend(f(undefined), f(undefined), 0.5).shapes[0] as TextShape).rot, undefined);
});

// the copied files equal the 2D app's (needs a 2D checkout: PPS_2D_REPO)
test('the copied files are what the 2D app has', { skip: !process.env.PPS_2D_REPO || !existsSync(`${process.env.PPS_2D_REPO}/src/ui/charts.js`) }, () => {
  execFileSync('node', ['scripts/copy-b11-profile.mjs', '--from', process.env.PPS_2D_REPO!, '--check'], { stdio: 'pipe' });
});

// ── the readouts a case leaves unmeasured (2D store.js hiddenNow) ──
import { hiddenOf, SHOW_HVPG } from '../src/ui/tests/hidden.ts';
const clotted = { thrombus: { RHV_IVC: 0.9 } }, open = { thrombus: { RHV_IVC: 0 } };

test('hiddenNow: the HVPG shows (2D showHvpg, 11 Nov 2026) except where the hepatic vein takes no catheter; a slide shows the figures as they are', () => {
  assert.equal(SHOW_HVPG, true);
  assert.equal(hiddenOf({ params: open }), null);
  assert.ok(hiddenOf({ params: clotted })!.has('trueHVPG'), 'a clotted right hepatic vein: the HVPG stays unmeasured');
  assert.equal(hiddenOf({ params: clotted, presenting: true }), null, 'a Presenter slide shows it as it is');
  assert.equal(hiddenOf({ params: clotted, measured: true })!.has('trueHVPG'), true, 'measured or not, a blocked vein has no HVPG');
  const base = new Set(['pv']);
  const both = hiddenOf({ params: clotted, base })!;
  assert.ok(both.has('pv') && both.has('trueHVPG'), 'a view\'s own hidden set is kept');
  assert.equal(hiddenOf({ params: clotted, base }), both, 'one set per change of view (never a new one per frame)');
});

test('the Pressure chart leaves the HVPG bracket out and its figure reads "—" while the HVPG is unmeasured; PPG and the portal vein stay', () => {
  const hidden = hiddenOf({ params: clotted });
  const rows = readings(metrics, hidden);
  const hv = rows.find((r) => r.id === 'hvpg')!, ppg = rows.find((r) => r.id === 'ppg')!;
  assert.equal(hv.word, ''); assert.equal(hv.sev, ''); assert.notEqual(hv.text, '8.0');
  assert.equal(ppg.text, '13.0');
  const shown = words(profileFrame(input(), { w: 700, h: 300, pal }, newLock()).frame).map((t) => t.s);
  const cut = words(profileFrame(input({ hidden }), { w: 700, h: 300, pal }, newLock()).frame).map((t) => t.s);
  assert.ok(shown.includes('HVPG ') && shown.includes('8.0'));
  assert.ok(!cut.includes('HVPG ') && !cut.includes('8.0'), `the HVPG bracket and pill are gone: ${cut.join('|')}`);
  assert.ok(cut.includes('PPG ') && cut.includes('13.0'));
});

import { useMeasured, hvpgNote } from '../src/ui/tests/hidden.ts';
import { heroOf } from '../src/ui/tests/trace/live.ts';
import { readoutValue } from '../src/ui/tests/readouts-model.ts';
import { TILES } from '../src/ui/tests/copied/dock-tiles.copied.js';

test('the measured flag (2D lastHVPG, hvpgMeasured): the IR measurement sets it, a new patient clears it; the Readouts tile, the Over time header and the IR note read it', () => {
  const hv = (TILES as Array<{ id: string }>).find((t) => t.id === 'hvpg') as never;
  const hid = new Set(['trueHVPG']);
  useMeasured.getState().clear();
  assert.equal(readoutValue(hv, { hvpg: 9 }, open, hid), null, 'hidden and not measured: no number');
  assert.equal(heroOf(9, 'beats', hid, null).word, 'Not measured');
  assert.equal(heroOf(9, 'beats', hid, null).num, '—');
  useMeasured.getState().mark({ fhvp: 5, whvp: 14.2, hvpg: 9.2 });
  assert.equal(useMeasured.getState().hvpgMeasured, true);
  assert.equal(readoutValue(hv, { hvpg: 9 }, open, hid), 9.2, 'hidden, measured: the measured number');
  assert.deepEqual([heroOf(9, 'beats', hid, 9.2).num, heroOf(9, 'beats', hid, 9.2).word], ['9.2', 'Measured']);
  assert.equal(heroOf(9, 'beats', null, null).num, '9.0', 'not hidden: the live number as before');
  useMeasured.getState().clear();
  assert.equal(useMeasured.getState().lastHVPG, null);
  assert.equal(hvpgNote(true, false), 'The same numbers as the HVPG tile.');
  assert.equal(hvpgNote(false, false), 'The HVPG readouts are always shown.', '(2D showHvpg is on)');
});

test('the HVPG bracket runs from a labelled WHVP marker at the measured value to the FHVP; the sinusoid keeps its dot and value (Mohammad, 21 Nov 2026)', () => {
  const m = { ...metrics, whvp: 6.9, fhvp: 4.6, hvpg: 2.3 };
  const P = pressures({ SIN_R: 7.3, RHV: 4.6 });
  const o = profileFrame(input({ P, metrics: m }), { w: 700, h: 300, pal }, newLock());
  assert.equal(o.form, 'plot');
  const w = words(o.frame).map((t) => t.s);
  assert.ok(w.includes('WHVP 6.9'), `the marker is named: ${w.join('|')}`);
  assert.ok(w.includes('7.3'), 'the sinusoid keeps its own value label');
  assert.ok(w.includes('2.3'), 'the bracket reads WHVP − FHVP');
  assert.ok(o.frame.shapes.some((s) => s.k === 'rect' && (s as { w: number }).w === 9), 'a square marker, not a station dot');
});

test('with no WHVP measured the HVPG bracket and its marker are left out in every form; PPG stays', () => {
  const m = { ...metrics, whvp: undefined } as unknown as Record<string, number | undefined>;
  for (const [w, h] of [[700, 300], [700, 120], [300, 112]] as const) {
    const o = profileFrame(input({ metrics: m }), { w, h, pal }, newLock());
    const t = words(o.frame).map((x) => x.s);
    assert.ok(!t.includes('HVPG ') && !t.some((s) => s.startsWith('WHVP')), `${w}x${h} (${o.form}): ${t.join('|')}`);
    assert.ok(t.includes('PPG '));
  }
});

test('the screen reader hears where the HVPG comes from, and nothing when the bracket is not drawn', async () => {
  const { bracketSummary } = await import('../src/ui/tests/profile/model.ts');
  const s = bracketSummary({ metrics: { whvp: 6.9, fhvp: 4.6 } });
  assert.match(s, /wedged hepatic venous pressure 6\.9 minus free hepatic venous pressure 4\.6/);
  assert.equal(bracketSummary({ metrics: { fhvp: 4.6 } }), '');
  assert.equal(bracketSummary({ metrics: { whvp: 6.9, fhvp: 4.6 }, hidden: new Set(['trueHVPG']) }), '');
});

test('the layout is decided by the room alone: the same box gives the same form for every pressure, compare, hidden readout and history (B7, iPhone Along the circuit)', () => {
  const cases = [
    input(),
    input({ P: pressures({ INT: 31, CONF: 30, RPV: 29, SIN_R: 26, CV_R: 12 }), snap: pressures() }),
    input({ P: healthy, metrics: { whvp: 5, fhvp: 3.5, hvpg: 1.5, pv: 7, ivc: 3, ppg: 4 } }),
    input({ P: pressures({ CONF: 9, RPV: 9, SIN_R: 9, CV_R: 9, RHV: 9 }) }),
    input({ metrics: { ...metrics, whvp: undefined } as unknown as Record<string, number | undefined> }),
    input({ hidden: new Set(['trueHVPG']) }),
  ];
  const sizes: [number, number][] = [];
  for (const w of [300, 358, 390, 520, 700]) for (let h = 90; h <= 330; h += 8) sizes.push([w, h]);
  const seen = new Set<string>();
  for (const [w, h] of sizes) {
    // one chart kept across every case in turn (its history), and a fresh one for each case: all give one form
    const kept = newLock();
    for (const c of cases) {
      const hid = (c as { hidden?: Set<string> }).hidden ?? null;
      const want = formOf(PATHS[0]!, w, h, hid, pal);
      assert.equal(profileFrame(c, { w, h, pal }, kept).form, want, `${w}x${h} kept`);
      assert.equal(profileFrame(c, { w, h, pal }, newLock()).form, want, `${w}x${h} fresh`);
      seen.add(want);
    }
  }
  assert.deepEqual([...seen].sort(), ['band', 'plot', 'strip'], 'the sweep crosses all three forms');
  // a chart that was drawn too short and then given its room is the form of that room, and back again
  const lock = newLock();
  const order = [[390, 112], [390, 300], [390, 112], [390, 300]] as const;
  const forms = order.map(([w, h]) => profileFrame(input(), { w, h, pal }, lock).form);
  assert.deepEqual(forms, [formOf(PATHS[0]!, 390, 112, null, pal), formOf(PATHS[0]!, 390, 300, null, pal), formOf(PATHS[0]!, 390, 112, null, pal), formOf(PATHS[0]!, 390, 300, null, pal)]);
});

test('a value label with no clear spot never changes the layout: the chart stays in its room\'s form and keeps both brackets', () => {
  const crowded = input({ P: pressures({ CONF: 9, RPV: 9, SIN_R: 9, CV_R: 9, RHV: 9 }) });
  const o = profileFrame(crowded, { w: 358, h: 250, pal }, newLock());
  assert.equal(o.form, formOf(PATHS[0]!, 358, 250, null, pal));
  if (o.form !== 'strip') assert.ok(words(o.frame).some((t) => t.s === 'PPG '), 'the PPG pill is drawn');
});
