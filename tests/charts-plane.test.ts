import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planeOf, fitPlane, zoneOf, shownReading, planeLayout, planeReading, plotHeightOf, stepWalk, toolPlane, planeTitle, PLANES, type PlanePoint } from '../src/ui/charts/plane/model.ts';
import { planeFrame } from '../src/ui/charts/plane/frame.ts';
import { planeRows, fillRows, pointsOfRows, trailStops, patientKey, patientFp, forgetPatients, loadPoints } from '../src/ui/charts/plane/data.ts';
import { planeEntry } from '../src/ui/charts/plane/entry.ts';
import { ctxOf, eachLook, judge } from './charts-helpers.ts';

const r1 = (v: number) => Math.round(v * 10) / 10;
const rd = (o: unknown) => JSON.parse(JSON.stringify(o, (_k, v) => (typeof v === 'number' ? r1(v) : v)));

// The expected numbers were computed once by running the 2D app's own visual-plane.js (its pure functions, in the order its draw() asks for them) in node.
const { ref: REF, misc: MISC } = JSON.parse(readFileSync(new URL('./fixtures/plane-2d-reference.json', import.meta.url), 'utf8'));
// (the cut-off lines of the reference are before the plot's edge takes them on: the test reads them from the layout's own list below)
const CUTS: Record<string, unknown> = {};
for (const k of ['hp', 'flow', 'csph']) { CUTS[k] = REF[k].cuts; delete REF[k].cuts; }

const summaryOf = (name: string, points: PlanePoint[], W: number, H: number, fs: number) => {
  const L = planeLayout({ plane: planeOf(name)!, W, H, fs, points });
  return rd({ max: [L.pl.x.max, L.pl.y.max], names: L.names.map((n) => n && [n.lines.join('/'), n.x, n.y, n.anchor, !!n.lead]), words: L.words.map((w) => [w.z.t, w.x, w.y, w.anchor]), lines: L.lines.map((l) => [l.text, l.x, l.y]), nums: L.nums.map((n) => [n.text, n.x, n.y, n.anchor]) });
};
const cardOf = (name: string, ring: Record<string, number>, W: number, H: number, fs: number) => {
  const L = planeLayout({ plane: planeOf(name)!, W, H, fs, card: true, ring });
  return rd({ dot: [L.dot!.x, L.dot!.y, L.dot!.r, L.dot!.g], words: L.cardWords.map((w) => [w.z.t, w.x, w.y, w.lines, w.fs, !!w.onLine]), nums: L.nums.map((n) => [n.text, n.x, n.y, n.anchor]), reading: planeReading(L.pl, ring) });
};

test('the planes, the fit, the zones and the tiles\' rounding are the 2D ones', () => {
  assert.equal(fitPlane(planeOf('hvpg-ppg')!, [{ f: { hvpg: 3, ppg: 4 } }, { f: { hvpg: 12.5, ppg: 15 } }]).x.max, 16);
  assert.deepEqual(MISC.fit, { min: 0, max: 14 });
  assert.deepEqual(rd(shownReading(planeOf('csph')!, { lsm: 24.96, plt: 149.6 })), MISC.shown);
  assert.equal(zoneOf(planeOf('csph')!, { lsm: 25, plt: 100 })?.t, MISC.z);
  assert.equal(zoneOf(planeOf('csph')!, { lsm: 14, plt: 160 })?.t, MISC.z2);
  assert.equal(zoneOf(planeOf('hvpg-ppg')!, { hvpg: 11, ppg: 5 })?.t, MISC.z3);
  // the CSPH plane is the guideline card's geometry: 15 and 25 kPa, 150 platelets, in the ranges 5 to 35 and 50 to 250
  const c = planeOf('csph')!;
  assert.deepEqual([c.x.min, c.x.max, c.y.min, c.y.max, c.cuts], [5, 35, 50, 250, { x: [15, 25], y: [150] }]);
  assert.equal(c.key, 'never');
  // a deck's own plane starts from a named one and a bad one is no plane
  const own = planeOf({ base: 'hvpg-ppg', x: { key: 'hvpg', max: 30, min: 0 } })!;
  assert.equal(own.x.max, 30); assert.equal(own.zones.length, 4);
  assert.equal(planeOf({ x: 'lsm', y: 'plt' })!.x.name, 'Liver stiffness');
  assert.equal(planeOf('nope'), null);
  assert.equal(toolPlane({})!.look, 'guide');
  assert.equal(planeTitle(c), 'Stiffness and platelets');
  assert.equal(planeTitle(planeOf('hvpg-ppg')), 'HVPG and PPG');
});

test('a summary lays out its names, zones, lines and numbers where the 2D draw() puts them', () => {
  const HP: PlanePoint[] = [{ f: { hvpg: 3, ppg: 4 }, name: 'Healthy' }, { f: { hvpg: 12.5, ppg: 15 }, name: 'Cirrhosis' }, { f: { hvpg: 4, ppg: 9.5 }, name: 'Presinusoidal obstruction', short: 'Presinusoidal' }];
  assert.deepEqual(summaryOf('hvpg-ppg', HP, 330, 275, 13), REF.hp);
  assert.deepEqual(summaryOf('flow-ppg', [{ f: { pvFlow: 1.1, ppg: 3.5 }, name: 'Healthy' }, { f: { pvFlow: 0.85, ppg: 13.5 }, name: 'Cirrhosis' }], 330, 351, 13), REF.flow);
  assert.deepEqual(summaryOf('csph', [{ f: { lsm: 8.5, plt: 215 }, name: 'Healthy' }, { f: { lsm: 21, plt: 112 }, name: 'Cirrhosis' }], 330, 287, 13), REF.csph);
  // the cut-off lines run to the plot's own edge (bled to 0 and W, as 2D draws them) and are broken where a name or a number sits across them
  const L = planeLayout({ plane: planeOf('hvpg-ppg')!, W: 330, H: 275, fs: 13, points: [{ f: { hvpg: 3, ppg: 4 }, name: 'Healthy' }, { f: { hvpg: 12.5, ppg: 15 }, name: 'Cirrhosis' }] });
  assert.ok(L.cuts.length >= (CUTS.hp as unknown[]).length);
  for (const c of L.cuts) assert.ok(Math.min(c.x1, c.x2, c.y1, c.y2) >= 0 && Math.max(c.x1, c.x2) <= 330 && Math.max(c.y1, c.y2) <= 275);
});

test('the data card lays out its dot and every zone\'s words as the 2D card does, and reads the case as the tiles print it', () => {
  assert.deepEqual(cardOf('csph', { lsm: 22.4, plt: 118 }, 330, 152, 13), REF.cardCsph);
  assert.deepEqual(cardOf('hvpg-ppg', { hvpg: 12.04, ppg: 14.96 }, 330, 218, 13), REF.cardHp);
  assert.equal(planeReading(planeOf('csph')!, { lsm: 24.96, plt: 120 }), 'Stiffness 25.0 kPa · Platelets 120 ×10³/µL · CSPH');
  assert.equal(planeReading(planeOf('csph')!, { lsm: null }), '');
});

test('the dot\'s way starts where the dot stands on the last stop, drops back where it goes over itself, and the plot grows with the width', () => {
  const stops = [{ f: { lsm: 9, plt: 210 }, name: 'A' }, { f: { lsm: 16.5, plt: 150 }, name: 'B' }];
  const L = planeLayout({ plane: planeOf('csph')!, W: 330, H: 152, fs: 13, card: true, ring: { lsm: 16.5, plt: 150 }, stops });
  const st = { walk: [] as number[], armed: false };
  stepWalk(st, L, stops, { x: 10, y: 10 });
  assert.equal(st.armed, false); assert.equal(st.walk.length, 0);   // not on the stop: no way kept
  stepWalk(st, L, stops, L.dot);
  assert.equal(st.armed, true); assert.equal(st.walk.length, 2);
  const at = [[20, 130], [22, 120], [24, 110], [26, 100]].map(([x, y]) => ({ x: L.X(x!), y: L.Y(y!) }));
  for (const p of at) stepWalk(st, L, stops, p);
  assert.equal(st.walk.length, 10);
  stepWalk(st, L, stops, at[0]!);   // back over its way (the time-lapse played again or scrubbed back): the way ends there again
  assert.equal(st.walk.length, 4);
  assert.equal(plotHeightOf(planeOf('hvpg-ppg')!, 330, false), Math.round(330 / 1.2));
  assert.equal(plotHeightOf(planeOf('flow-ppg')!, 330, false), Math.round(330 / 0.94));
  assert.equal(plotHeightOf(planeOf('hvpg-ppg')!, 330, true), Math.round(0.44 * 330));
  assert.equal(plotHeightOf(planeOf('csph')!, 330, true), Math.round(330 * 0.46));
  assert.equal(plotHeightOf(planeOf('csph')!, 330, true, { room: 150 }), 110);   // never taller than the room less the key and the reading, never under 110
});

test('every specimen frame and every plane: words at least 12 px, nothing outside the box, every point has its name, in every look at every width', () => {
  const pts: Record<string, PlanePoint[]> = {
    csph: [{ f: { lsm: 8.5, plt: 215 }, name: 'Healthy' }, { f: { lsm: 21, plt: 112 }, name: 'Cirrhosis' }, { f: { lsm: 31, plt: 88 }, name: 'Decompensated' }],
    'hvpg-ppg': [{ f: { hvpg: 3, ppg: 4 }, name: 'Healthy' }, { f: { hvpg: 12.5, ppg: 15 }, name: 'Cirrhosis' }, { f: { hvpg: 4, ppg: 9.5 }, name: 'Presinusoidal', site: 'pre' }, { f: { hvpg: 15, ppg: 17 }, name: 'Decompensated', from: { hvpg: 12.5, ppg: 15 } }],
    'flow-ppg': [{ f: { pvFlow: 1.1, ppg: 3.5 }, name: 'Healthy' }, { f: { pvFlow: 0.85, ppg: 13.5 }, name: 'Cirrhosis' }, { f: { pvFlow: 0.55, ppg: 8 }, name: 'On carvedilol', from: { pvFlow: 0.85, ppg: 13.5 } }],
  };
  const rings: Record<string, Record<string, number>> = { csph: { lsm: 22.4, plt: 118 }, 'hvpg-ppg': { hvpg: 12, ppg: 15 }, 'flow-ppg': { pvFlow: 0.8, ppg: 14 } };
  eachLook((look) => {
    for (const [w, d] of [[300, 'phone-portrait'], [330, 'desktop'], [430, 'tablet-portrait'], [330, 'phone-landscape']] as const) {
      const c = ctxOf(look, w, d);
      for (const name of Object.keys(PLANES)) {
        const o = planeFrame({ plane: PLANES[name]!, points: pts[name] }, c);
        judge(o.frame, look, { onCard: false });
        // every point of the summary is drawn with its name
        for (const p of pts[name]!) assert.ok(o.frame.shapes.some((s) => s.k === 'text' && s.s.startsWith(p.name.slice(0, 4))), `${look} ${w} ${name}: ${p.name} has no name`);
        const k = planeFrame({ plane: PLANES[name]!, ring: rings[name], stops: [{ f: { ...rings[name]!, [PLANES[name]!.x.key]: PLANES[name]!.x.max / 3 }, name: 'Before' }], walk: { walk: [], armed: false } }, c);
        judge(k.frame, look, { onCard: false });
      }
    }
  });
  for (const s of planeEntry.specimens) eachLook((look) => judge(s.build(ctxOf(look, 330)), look, { onCard: false }));
  const o = planeFrame({ plane: PLANES.csph!, points: pts.csph }, ctxOf('light', 330));
  assert.equal(o.frame.w, 330);
  assert.match(o.frame.label, /^Platelets, ×10³\/µL against Liver stiffness, kPa: Healthy, 8\.5 and 215, No CSPH; Cirrhosis, 21\.0 and 112, Indeterminate/);
});

test('the rows of a plane: names from the slide, readings from its state or the engine, a patient worked out once', async () => {
  const slides = [{ id: 'a', title: 'Healthy liver', site: 'none' }, { id: 'b', title: 'Cirrhosis', site: 'pre' }];
  const rows = planeRows(['a', { id: 'b', from: 'a', short: 'Cirr' }, { preset: 'psvd', name: 'Presinusoidal', from: { preset: 'healthy', days: 0 } }, null], slides);
  assert.deepEqual(rows.map((r) => [r.name, r.short, r.site]), [['Healthy liver', '', 'none'], ['Cirrhosis', 'Cirr', 'pre'], ['Presinusoidal', '', undefined]]);
  const fp = (id: string) => (id === 'a' ? { lsm: 5, plt: 250 } : id === 'b' ? { lsm: 20, plt: 110 } : null);
  assert.equal(fillRows(planeRows(['a', 'zz'], slides), fp).length, 1);   // a slide whose state is not in is waited for
  let asked = 0;
  const client = { sequence: async (steps: unknown[]) => { asked++; return [{ type: 'seqStep' as const, reqId: 1, i: 0, fp: { lsm: 12, plt: 190 }, params: steps }]; } };
  forgetPatients();
  const pts = await loadPoints(['a', { id: 'b', from: 'a' }, { preset: 'psvd', name: 'Presinusoidal', from: { preset: 'healthy' } }], slides, fp, client);
  assert.deepEqual(pts.map((p) => p.name), ['Healthy liver', 'Cirrhosis', 'Presinusoidal']);
  assert.deepEqual(pts[1]!.from, { lsm: 5, plt: 250 });
  assert.equal(asked, 2);
  await patientFp(client, { preset: 'psvd' }); await patientFp(client, { preset: 'psvd' });
  assert.equal(asked, 2, 'a patient already worked out is not asked for again');
  assert.equal(patientKey({ preset: 'x', days: 3 }), JSON.stringify(['x', null, 3, null]));
  assert.equal(pointsOfRows(planeRows(['a'], slides).map((r) => ({ ...r, f: fp('a') }))).length, 1);
  assert.equal(trailStops([{ slide: 'a', name: 'Before' }, { slide: 'zz', name: 'x' }], fp), null);
  assert.deepEqual(trailStops([{ slide: 'a', name: 'Before' }], fp), [{ f: { lsm: 5, plt: 250 }, name: 'Before' }]);
  assert.deepEqual(trailStops(undefined, fp), []);
});
