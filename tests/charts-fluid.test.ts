import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fluidOf, fluidWords, fluidDay, dayWords, gaugeParts, tugParts, fluidFlows, mlMin, mlInt, partPts, END_POINT, END_ROUND, bandPts, BAND_N, forcesWords, sinusoidForces, pinnedForces } from '../src/ui/charts/fluid/model.ts';
import { fluidFrame, fluidLabel } from '../src/ui/charts/fluid/frame.ts';
import { fluidInputs, ForcesAverage, wantsCaveat } from '../src/ui/charts/fluid/data.ts';
import { fluidEntry } from '../src/ui/charts/fluid/entry.ts';
import { sinusoidPull, tissueP, hepLymphOf } from '../src/engine/hales/portal/lymph.js';
import { NODES } from '../src/engine/hales/portal/topology.js';
import { ctxOf, eachLook, judge } from './charts-helpers.ts';
import type { TextShape } from '../src/ui/charts/scene.ts';

// The numbers below were computed once by running the 2D app's own functions (src/ui/tool-fluid.js fluidOf … fluidFlows, lifted out of the file with the DOM stubbed) at the same inputs.
const near = (a: number, b: number, m = '') => assert.ok(Math.abs(a - b) < 1e-9, `${m}: ${a} vs ${b}`);
const FP = { hepLymph: 3.2, splLymph: 1.6, lymphCap: 4, lymphOver: 0.8, lymphBack: 0.3, lymphNet: 0.5 };

test('the balance, its sentence and its day numbers are the 2D app\'s', () => {
  const f = fluidOf(FP)!;
  near(f.made, 4.8, 'made'); near(f.carried, 4, 'carried'); near(f.spare, 0, 'spare'); near(f.drained, 4.3, 'drained'); near(f.perDay, 720, 'perDay');
  assert.equal(fluidWords(f), 'Ascites accumulates at about 720 mL/day.');
  const d = fluidDay(f);
  assert.deepEqual(d, { liver: 4610, gut: 2300, made: 6910, limit: 5760, carried: 5760, over: 1150, back: 430, net: 720, room: -1150 });
  assert.deepEqual(dayWords(d), { title: 'Ascites accumulating', detail: 'Transudation 1,150; peritoneal reabsorption 430.', limit: 'Capacity 5,760 · full', net: '▲ 720', dir: 'up' });
  const live = fluidOf({ ascites: { hepLymph: 3, splLymph: 1, lymphCap: 3, ratePerDay: -144 } })!;
  near(live.over, 1, 'live over'); near(live.back, 1.1, 'live back'); near(live.net, -0.1, 'live net'); near(live.perDay, -144, 'live perDay');
  assert.equal(fluidWords(live), 'Ascites decreases by about 140 mL/day.');
  assert.equal(fluidOf(null), null);
  assert.equal(fluidOf({ hepLymph: 1 }), null, 'a fingerprint without the fluid terms');
  assert.equal(fluidOf({ ascites: { hepLymph: 1, splLymph: 1, lymphCap: 1 } }), null, 'a live frame without a rate');
  assert.equal(fluidWords(fluidOf({ hepLymph: 0.5, splLymph: 0.4, lymphCap: 5, lymphOver: 0, lymphBack: 0, lymphNet: 0 })!), 'No ascites: lymphatic drainage matches lymph formation.');
  assert.equal(fluidWords(fluidOf({ hepLymph: 2.6, splLymph: 1.5, lymphCap: 4, lymphOver: 0.1, lymphBack: 0.1, lymphNet: 0 })!), 'Ascites is stable: peritoneal reabsorption matches transudation.');
  assert.deepEqual([mlMin(0.04), mlMin(12.6), mlMin(-1)], ['0.0', '13', '0.0']);
  assert.equal(mlInt(5360.4), '5,360');
});

test('the lymph gauge and the forces strip split a track as the 2D app does', () => {
  const g = gaugeParts({ carried: 5760, over: 1150, room: 0 }, 200);
  near(g.car.w, 162.2149059334298, 'car w'); near(g.over.x, 164.2149059334298, 'over x'); near(g.over.w, 35.78509406657019, 'over w'); assert.equal(g.tick.op, 1);
  const g2 = gaugeParts({ carried: 3000, over: 0, room: 2000 }, 180);
  near(g2.car.w, 108, 'car w 2'); assert.equal(g2.over.w, 0); assert.equal(g2.tick.op, 0, 'no tick while nothing leaks');
  const t = tugParts(9.4, 6.1, 300);
  near(t.push.w, 180.43548387096774, 'push'); near(t.pull.x, 183.43548387096774, 'pull x'); near(t.pull.w, 116.56451612903226, 'pull w'); near(t.wall, 181.93548387096774, 'wall');
  assert.equal(tugParts(0, 0, 100).wall, 50);
});

test('the flow picture\'s nodes and bands sit where the 2D app puts them', () => {
  const L = fluidFlows(fluidOf(FP)!, 360);
  assert.equal(L.xL, 78); assert.equal(L.xR, 210);
  const want = { left: [['liver', 29, 50.33333333333333, 42.666666666666664], ['gut', 77.66666666666666, 88.33333333333333, 21.333333333333332]],
    right: [['carried', 22.66666666666667, 49.333333333333336, 53.33333333333333, 0], ['back', 82, 84, 3.9999999999999996, 0], ['build', 98.66666666666666, 102, 6.666666666666675, 0]],
    bands: [['liver-carried', 29, 22.66666666666667, 42.666666666666664], ['gut-carried', 77.66666666666666, 65.33333333333334, 10.666666666666663], ['gut-back', 88.33333333333331, 82, 3.9999999999999973], ['gut-build', 92.33333333333331, 98.66666666666666, 6.666666666666675]] };
  L.left.forEach((n, i) => { assert.equal(n.id, want.left[i]![0]); near(n.y, want.left[i]![1] as number, 'y'); near(n.cy, want.left[i]![2] as number, 'cy'); near(n.lh, want.left[i]![3] as number, 'lh'); });
  assert.equal(L.right.length, 3);
  L.right.forEach((n, i) => { assert.equal(n.id, want.right[i]![0]); near(n.y, want.right[i]![1] as number, 'y'); near(n.cy, want.right[i]![2] as number, 'cy'); near(n.lh, want.right[i]![3] as number, 'lh'); near(n.room, want.right[i]![4] as number, 'room'); });
  assert.equal(L.bands.length, 4);
  L.bands.forEach((b, i) => { assert.equal(b.key, want.bands[i]![0]); near(b.ly, want.bands[i]![1] as number, 'ly'); near(b.ry, want.bands[i]![2] as number, 'ry'); near(b.t, want.bands[i]![3] as number, 't'); });
  // a healthy patient: the lymphatics have room left (a dashed outline under the carried node), nothing is taken back or built up
  const H = fluidFlows(fluidOf({ hepLymph: 0.5, splLymph: 0.4, lymphCap: 5, lymphOver: 0, lymphBack: 0, lymphNet: 0 })!, 320);
  assert.equal(H.xR, 170); assert.deepEqual(H.right.map((n) => n.id), ['carried']);
  near(H.right[0]!.room, 52.48, 'room'); near(H.right[0]!.y, 32, 'carried y'); near(H.left[0]!.y, 52.12, 'liver y'); near(H.left[0]!.lh, 6.4, 'liver lh');
  // a shrinking belly keeps the build-up node (it reads a negative number) even with nothing built
  const S = fluidFlows(fluidOf({ hepLymph: 2.4, splLymph: 1.3, lymphCap: 4.6, lymphOver: 0, lymphBack: 0.2, lymphNet: -0.2 })!, 300);
  assert.deepEqual(S.right.map((n) => n.id), ['carried', 'back', 'build']);
  near(S.right[0]!.room, 12.521739130434776, 'shrinking room');
});

test('a band is a closed outline of the same curve the 2D path drew, and a part\'s outline keeps its ends', () => {
  const b = bandPts(10, 5, 90, 25, 6);
  assert.equal(b.length, 4 * (BAND_N + 1));
  near(b[0]!, 10); near(b[1]!, 5); near(b[2 * BAND_N]!, 90); near(b[2 * BAND_N + 1]!, 25);   // the top edge, left to right
  near(b[2 * (2 * BAND_N + 1)]!, 10); near(b[2 * (2 * BAND_N + 1) + 1]!, 11);                  // the lower edge ends back at the left, t below
  const p = partPts(0, 100, 0, 10, 4, 7, END_ROUND, END_POINT);
  assert.ok(p.length > 0);
  assert.ok(p.some((v, i) => i % 2 === 0 && Math.abs(v - 100) < 1e-9 && Math.abs(p[i + 1]! - 5) < 1e-9), 'the point at the right end, on the middle');
  assert.deepEqual(partPts(0, 0.005, 0, 10, 4, 4, END_ROUND, END_ROUND), []);
  // a part shorter than its two ends shrinks both
  const q = partPts(0, 5, 0, 10, 4, 4, END_ROUND, END_ROUND);
  assert.ok(Math.max(...q.filter((_, i) => i % 2 === 0)) <= 5 + 1e-9);
});

test('the forces are the engine\'s Starling terms, as the 2D card reads them', () => {
  const P = new Float64Array((NODES as unknown[]).length).fill(0);
  const id = (n: string) => (NODES as { id: string }[]).findIndex((x) => x.id === n);
  P[id('SIN_R')] = 32; P[id('CV_R')] = 14; P[id('SIN_L')] = 30; P[id('CV_L')] = 13;
  const F = sinusoidForces(P, { albumin: 3, cirrhosis: 1 }, 15)!;
  near(F.out, 0.6 * (0.7 * 32 + 0.3 * 14) + 0.4 * (0.7 * 30 + 0.3 * 13) - tissueP(15), 'push');
  near(F.pull, sinusoidPull(3, 0.6), 'pull');
  assert.equal(sinusoidForces(null, { albumin: 3 }), null);
  const fp = { hepLymph: hepLymphOf(F.out, F.pull) + 0, salb: 3 };
  const pin = pinnedForces(fp, { albumin: 3, cirrhosis: 1 })!;
  near(pin.pull, F.pull, 'pinned pull');
  near(pin.out, F.out, 'the push read back from the engine\'s own liver lymph');
  assert.equal(pinnedForces({ hepLymph: 0.5 }, { albumin: 4 }), null, 'at its healthy floor the lymph does not tell the push');
  const w = forcesWords(9.44, 6.06);
  assert.equal(w.net, 'Hydrostatic 9.4 − oncotic 6.1 = net 3.3 outward');
  assert.equal(w.wFoot, 'ΔP 9.4 − σΔπ 6.1');
  assert.equal(forcesWords(2, 5).wUnit, 'mmHg inward');
});

test('what the card reads: the slide\'s fingerprint pins it, a live frame fills in, the push is eased', () => {
  const frame = { metrics: { ascites: { hepLymph: 3, splLymph: 1, lymphCap: 3, ratePerDay: -144, iap: 8 } } };
  const a = fluidInputs(FP, frame, null);
  assert.equal(a.pinned, false, 'no params: no forces');
  assert.equal(a.f!.hep, 3.2, 'the fingerprint wins over the frame');
  const b = fluidInputs(null, frame, null);
  assert.equal(b.f!.hep, 3, 'the live frame');
  assert.equal(fluidInputs(null, null, null).f, null);
  const avg = new ForcesAverage();
  const first = avg.next({ out: 10, pull: 5 }, 0);
  assert.deepEqual(first, { out: 10, pull: 5 });
  const second = avg.next({ out: 14, pull: 5 }, 1000);
  assert.ok(second.out > 10 && second.out < 14, 'it moves toward the new push, not onto it');
  assert.equal(wantsCaveat({}, { diuretics: { on: true } }), true);
  assert.equal(wantsCaveat({}, {}, [{ params: { diuretics: 1 } }]), true);
  assert.equal(wantsCaveat({}, {}), false);
  assert.equal(wantsCaveat({ caveat: true }, null), true);
});

test('every look and width: the day card, the flow picture and the strips are sound, with words of 12 px or more and the 2D look\'s colours', () => {
  const f = fluidOf(FP)!;
  const F = { out: 9.4, pull: 6.1 };
  for (const [o, forces] of [[{}, null], [{ forces: true, caveat: true }, F], [{ window: true }, null], [{ window: true, forces: true }, F]] as const) {
    eachLook((look) => {
      for (const [w, d] of [[300, 'phone-portrait'], [330, 'desktop'], [330, 'phone-landscape'], [430, 'tablet-portrait']] as const) {
        const fr = fluidFrame(f, forces, ctxOf(look, w, d), o);
        const { words } = judge(fr, look, { onCard: false });
        assert.ok(words.length >= 3);
        assert.ok(fr.h > 40 && fr.h < 400, `${look} ${w}: height ${fr.h}`);
      }
    });
  }
  // the day card's words are the 2D words
  const w = fluidFrame(f, null, ctxOf('light', 330), { window: true }).shapes.filter((s): s is TextShape => s.k === 'text').map((s) => s.s);
  for (const s of ['LIVER + GUT LYMPH', '6,910', 'mL/day', 'Capacity 5,760 · full', 'Ascites accumulating', '▲ 720', 'Transudation 1,150; peritoneal reabsorption 430.']) assert.ok(w.some((x) => x.toUpperCase() === s.toUpperCase() || x === s), `the day card says "${s}": ${w.join(' | ')}`);
  const flow = fluidFrame(f, null, ctxOf('light', 360), {}).shapes.filter((s): s is TextShape => s.k === 'text').map((s) => s.s);
  for (const s of ['Liver', 'Bowel', 'Lymphatics', 'Reabsorbed', 'Ascites', '3.2', '1.6', '4.0', '0.3', '0.5', 'mL/min', 'Ascites accumulates at about 720 mL/day.']) assert.ok(flow.includes(s), `the flow picture says "${s}": ${flow.join(' | ')}`);
  // no balance yet: a line, never an empty box
  const none = fluidFrame(null, null, ctxOf('dark', 330), {});
  assert.ok(none.h > 0 && none.shapes.length === 1);
  assert.match(fluidLabel(f, { window: true }), /Fluid balance, mL\/day: Ascites accumulating, 720/);
});

test('the specimens are in the registry and the lymph day rounding is the 2D one', () => {
  assert.equal(fluidEntry.status, 'done');
  assert.ok(fluidEntry.specimens.length >= 4);
});
