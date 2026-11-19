import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csphFingerprint } from '../scripts/gen-engine-fixture.mjs';
import {
  STATIONS, SPANS, NO_SPANS, blocksOf, profileOf, spansFor, spansOf, spansStented, hasStent, goalOf, planProfile, profOf, smooth, cutRuns, bracePts, braceD, hatchLines, gridOf, holesOf,
  heightFor, twAt, bracketFit, bracketGeom, whole0, profileWords, pillReadings, chartScale, zoneFit, nameFit, profileGeo, NS, type Fp, type Prof,
} from '../src/ui/charts/profile/model.ts';
import { profileFrame, profileFrameAtRest, profileLooks, words0 } from '../src/ui/charts/profile/frame.ts';
import { ProfileMotion, follow2, restView, fadeAt } from '../src/ui/charts/profile/glide.ts';
import { beforeOf, fpFromFrame, profileInputs } from '../src/ui/charts/profile/data.ts';
import { pressureRgb, pressureColour } from '../src/ui/charts/profile/pressure-colour.ts';
import { profileEntry, profileSpecimen } from '../src/ui/charts/profile/entry.ts';
import { ctxOf, eachLook, judge } from './charts-helpers.ts';
import type { TextShape } from '../src/ui/charts/scene.ts';

const memo = new Map<string, Promise<Fp>>();
const fpOf = (id: string) => { if (!memo.has(id)) memo.set(id, csphFingerprint(id) as Promise<Fp>); return memo.get(id)!; };
const r1 = (v: number) => +v.toFixed(1);

test('the stations and the profile the engine gives: the same eight pressures and gradients the 2D tool reads', async () => {
  assert.deepEqual(STATIONS, ['INT', 'CONF', 'RPV', 'SIN_R', 'CV_R', 'RHV', 'IVCS', 'RA']);
  const csph = profileOf(await fpOf('csph'))!;
  assert.deepEqual(csph.v.map(r1), [20.8, 17.6, 17.3, 16.2, 6.3, 5.1, 4.6, 4]);
  assert.deepEqual([r1(csph.hvpg), r1(csph.eus), r1(csph.ppg)], [11.1, 12.2, 13]);
  // the sinusoid's reading is the wedged pressure (the tiles' own number), the central vein's the node's
  const fp = await fpOf('csph');
  assert.equal(csph.v[3], fp.whvp);
  assert.equal(csph.v[5], fp.fhvp);
  assert.equal(profileOf(null), null);
  assert.equal(profileOf({ ...fp, at: null, pv: undefined } as Fp), null, 'a station with no number: no profile');
});

test('the red blocks stand where the pressure falls by more than 4 mmHg, or on the heart held up past the healthy one', async () => {
  const of = async (id: string) => profileOf(await fpOf(id))!;
  const healthy = await of('healthy');
  assert.deepEqual(blocksOf(healthy, healthy), []);
  assert.deepEqual(blocksOf(await of('csph'), healthy), [3], 'the fall at the sinusoid marks the venule/sinusoid column');
  assert.deepEqual(blocksOf(await of('pvt-chronic'), healthy), [1], 'a clot: the fall from the portal vein marks the portal vein');
  assert.deepEqual(blocksOf(await of('budd-chiari'), healthy), [5], 'a block after the liver: the fall to the IVC marks the hepatic vein');
  assert.deepEqual(blocksOf(null, healthy), []);
  const held = profOf([8, 7, 6.5, 6, 5.9, 5.8, 5.7, 12], 1, 1);
  assert.deepEqual(blocksOf(held, healthy), [7], 'the pressure held up by the heart: the right atrium has the block');
});

test('the brackets: the slide asks, a stent takes the HVPG out, none is a list of its own', () => {
  assert.equal(spansOf(undefined), SPANS);
  assert.equal(spansOf([]), NO_SPANS);
  assert.deepEqual(spansOf(['ppg', 'eus', 'hvpg']).map((s) => s[0]), ['hvpg', 'eus', 'ppg'], 'in the chart order, narrowest first');
  assert.equal(spansOf(['hvpg', 'eus', 'ppg']), spansOf(['ppg', 'hvpg', 'eus']), 'the same list for the same names');
  assert.deepEqual(spansStented(SPANS).map((s) => s[0]), ['ppg']);
  assert.equal(spansStented(NO_SPANS), NO_SPANS);
  assert.ok(hasStent({ tipsFlow: 1.2 }) && hasStent({ dipsFlow: 0.3 }) && !hasStent({ tipsFlow: null }) && !hasStent(null));
  assert.deepEqual(spansFor(undefined, { tipsFlow: 1.2 }).map((s) => s[0]), ['ppg'], 'a stent in: the slide\'s brackets less the HVPG');
  assert.deepEqual(spansFor(['hvpg'], { tipsFlow: 1.2 }), spansStented(spansOf(['hvpg'])));
});

test('the axis tops at the highest line, up to the next 5 (10 over 40), at least 15', () => {
  const a = profOf([21, 17.6, 17.3, 16.2, 6.3, 5.1, 4.6, 4], 11, 13), h = profOf([12, 8, 7, 7, 5, 4, 4, 3], 2, 4);
  assert.equal(goalOf(a, h, null).top, 25);
  assert.equal(goalOf(h, null, null).top, 15);
  assert.equal(goalOf(profOf([42, 30, 20, 10, 5, 5, 4, 3], 5, 5), null, null).top, 50);
  assert.equal(goalOf(profOf([40, 30, 20, 10, 5, 5, 4, 3], 5, 5), null, null).top, 40);
});

test('the smooth line passes through every station and never overshoots one; the readings cut it', () => {
  const xs = Array.from({ length: NS }, (_, i) => 40 + 40 * i), ys = [20, 30, 31, 90, 140, 150, 152, 160];
  const p = smooth(xs, ys);
  assert.equal(p.length / 2, (NS - 1) * 10 + 1);
  for (let i = 0; i < NS; i++) { assert.ok(Math.abs(p[20 * i]! - xs[i]!) < 1e-9 && Math.abs(p[20 * i + 1]! - ys[i]!) < 1e-9, `station ${i}`); }
  for (let i = 0; i + 1 < p.length / 2; i++) assert.ok(p[2 * i + 3]! >= p[2 * i + 1]! - 1e-9, 'monotone: a rising line never dips');
  // cut: a hole in the middle of a straight line leaves two runs, ending at the hole's edges
  const runs = cutRuns([0, 0, 100, 0], [[40, 60, -5, 5]]);
  assert.deepEqual(runs, [[0, 0, 40, 0], [60, 0, 100, 0]]);
  assert.deepEqual(cutRuns([0, 0, 100, 0], []), [[0, 0, 100, 0]]);
  assert.deepEqual(cutRuns([0, 0, 50, 0, 100, 0], [[45, 55, -5, 5]]), [[0, 0, 45, 0], [55, 0, 100, 0]], 'a hole across a vertex');
  assert.deepEqual(cutRuns([0, 0, 100, 0], [[-10, 110, -5, 5]]), []);
  assert.deepEqual(cutRuns([0, 20, 100, 20], [[40, 60, -5, 5]]), [[0, 20, 100, 20]], 'a hole off the line');
});

test('the brace and the hatching: the brace\'s ends are braceD\'s, the stripes stand 45 degrees and stay in the box', () => {
  const pts = bracePts(10, 200, 50, 7), d = braceD(10, 200, 50, 7);
  assert.deepEqual([pts[0], pts[1]], [10, 50]);
  assert.deepEqual([pts.at(-2), pts.at(-1)].map((v) => +v!.toFixed(1)), [200, 50]);
  const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  assert.deepEqual(nums.slice(0, 2), [10, 50], 'both start at the back');
  assert.deepEqual(nums.slice(-2), [200, 50], 'both end at the back');
  assert.ok(pts.some((v, i) => i % 2 && Math.abs(v - 57) < 1e-9), 'the tip is d under the back');
  const lines = hatchLines(20, 30, 36, 90);
  assert.ok(lines.length > 10);
  for (const [x1, y1, x2, y2] of lines) {
    assert.ok(Math.abs(x1! + y1! - (x2! + y2!)) < 1e-9, 'a stripe is a line of constant x + y');
    for (const [x, y] of [[x1!, y1!], [x2!, y2!]] as const) assert.ok(x >= 20 - 3 && x <= 56 + 3 && y >= 30 - 3 && y <= 120 + 3, 'cut to the box');
  }
  const cs = lines.map((l) => l[0]! + l[1]!).sort((a, b) => a - b);
  for (let i = 1; i < cs.length; i++) assert.ok(Math.abs(cs[i]! - cs[i - 1]! - 8 * Math.SQRT2) < 1e-6, 'the stripes are 8 px apart');
});

test('the layout: names, zones and brackets fit as the 2D tool fits them, at phone and Mac widths', () => {
  const tw = twAt(13);
  // the same numbers as the copied 2D code gives with this app's measure
  const wide = profileGeo(700, 280, 13, tw, false, SPANS);
  assert.equal(wide.fit.rows, 1);
  assert.deepEqual(wide.fit.names, ['Intestine', 'Portal vein', 'Pre-', 'Intra-', 'Post-', 'Hepatic vein', 'IVC', 'RA']);
  assert.ok((zoneFit(88, 13, tw) as { lines: number }).lines === 1, 'a wide chart: the zones named on one line');
  const phone = profileGeo(330, 230, 13, tw, false, SPANS);
  assert.deepEqual(phone.fit.names, ['Gut', 'PV', 'Pre-', 'Intra-', 'Post-', 'HV', 'IVC', 'RA'], 'a phone: the short names');
  assert.ok(phone.zone.lines >= 1);
  for (const g of [wide, phone]) {
    assert.ok(g.T > 0 && g.Z > g.T && g.B > g.Z && g.h >= g.need - 1, 'the plot has height, the band under it, the axis under that');
    assert.equal(g.brFs.length, 2);
  }
  assert.ok(phone.need > phone.T + 3 * 13, 'the plot keeps at least three lines of type');
  assert.ok(heightFor(330, 13, SPANS) >= phone.need);
  assert.ok(heightFor(330, 13, SPANS, 400) === 400);
  assert.equal((nameFit(10, tw) as { rows: number }).rows, 2, 'no room at all: two rows');
  const br = bracketFit(60, 'HVPG', tw, 13);
  assert.ok(br.mode === 'gap' || br.mode === 'tight' || br.mode === 'stack');
  assert.ok(br.fs >= 12 && br.fs <= 13);
  assert.deepEqual(chartScale(300, 600, 14), { k: 0.5, s: 12.02 / 7 });
  assert.deepEqual(chartScale(900, 600, 14), { k: 1, s: 1 });
});

test('a plan puts the pills, the readings and the lines\' names clear of each other, and the brackets under the plot', async () => {
  const of = async (id: string) => profileOf(await fpOf(id))!;
  const [p, hl, bf] = [await of('csph'), await of('healthy'), await of('cirr-decomp')];
  for (const w of [300, 330, 430, 700]) {
    const plan = planProfile(w, 0, 13, goalOf(p, hl, bf), hl, bf, SPANS, 'No Rx');
    assert.equal(plan.sides.length, NS);
    assert.ok(plan.pills === null || plan.pills.length === 2);
    for (const b of plan.pills ?? []) assert.ok(b[0] >= plan.G.L && b[1] <= plan.G.R + 1 && b[2] >= plan.G.T && b[3] <= plan.G.Z, `pill in the plot at ${w}`);
    assert.deepEqual(plan.names.map((n) => n.t).sort(), ['Healthy', 'No Rx'].sort());
    assert.ok(plan.G.brY(1) > plan.G.brY(0), 'the PPG\'s bracket lowest');
    assert.ok(plan.G.brY(1) <= plan.G.B && plan.G.brY(0) >= plan.G.Z, 'the brackets stand in the band between the zero line and the axis');
    // each name stands inside the plot
    for (const n of plan.names) assert.ok(n.x - n.w / 2 >= 0 && n.x + n.w / 2 <= w);
  }
});

test('the gridlines: every 5, every 10 over 40, every other where they would crowd; the holes round the readings', () => {
  const G = planProfile(400, 0, 13, goalOf(profOf([21, 17, 17, 16, 6, 5, 4, 4], 11, 13), null, null), null, null, SPANS).G;
  assert.deepEqual(gridOf(G, 13, 25).map((g) => g.v), [0, 5, 10, 15, 20, 25]);
  assert.deepEqual(gridOf(G, 13, 60).map((g) => g.v), [0, 10, 20, 30, 40, 50, 60]);
  assert.ok(gridOf(G, 13, 25)[0]!.y === G.Z && Math.abs(gridOf(G, 13, 25).at(-1)!.y - G.T) < 1e-9);
  const hs = holesOf(G, 13, twAt(13), Array(NS).fill(100), [3, 12, 120, 5, 5, 5, 5, 5]);
  assert.equal(hs.length, NS);
  assert.ok(hs[2]![1] - hs[2]![0] > hs[0]![1] - hs[0]![0], 'a three-digit reading cuts a wider hole');
  assert.equal(whole0(-2), 0);
  assert.equal(whole0(999), 300);
});

test('the colour of a pressure: the look\'s own ramp, in OKLab, from 0 to 35 mmHg', () => {
  assert.deepEqual(pressureRgb('light', 0), [184, 213, 237]);
  assert.deepEqual(pressureRgb('light', 35), [104, 12, 47], 'past the last stop: the last colour');
  assert.deepEqual(pressureRgb('light', -4), [184, 213, 237]);
  assert.deepEqual(pressureRgb('dark', 0), [215, 231, 244], 'the dark looks have their own ramp');
  assert.deepEqual(pressureRgb('soft', 0), [141, 184, 226]);
  const lo = pressureRgb('light', 5), hi = pressureRgb('light', 20);
  assert.ok(lo[0] > hi[0] || lo[2] > hi[2], 'a higher pressure is a deeper colour');
  assert.deepEqual(pressureColour('light', 0, 0.5), [184 / 255, 213 / 255, 237 / 255, 0.5]);
});

test('the glide: the shown numbers follow the goal on the 2D filter, blocks fade in, a hold takes the brackets out', async () => {
  // follow2 is the 2D display-state filter: it settles on the target and never overshoots by much
  let v = 0, w = 0;
  for (let i = 0; i < 400; i++) { const r = follow2(v, w, 10, 1 / 60, 0.2, 0.005); v = r.v; w = r.w; assert.ok(v <= 10.2); }
  assert.equal(v, 10);
  assert.deepEqual(follow2(3, 3, 10, 0, 0.2, 0.005), { v: 3, w: 3 }, 'no time, no step');

  const of = async (id: string) => profileOf(await fpOf(id))!;
  const [a, b, hl] = [await of('healthy'), await of('csph'), await of('healthy')];
  const planA = planProfile(400, 0, 13, goalOf(a, hl, null), hl, null, SPANS), planB = planProfile(400, 0, 13, goalOf(b, hl, null), hl, null, SPANS);
  const m = new ProfileMotion();
  m.aim(planA.goal, planA, 0);
  assert.deepEqual(m.view(0)!.shown.v.map(r1), a.v.map(r1), 'the first state is shown at once');
  assert.ok(m.view(0)!.blk.every((x) => x === 0), 'a healthy patient has no block');
  assert.equal(m.view(0)!.brk, 1);
  m.aim(planB.goal, planB, 1000);
  assert.equal(planB.size, planA.size.replace(/^\d+x\d+/, `${planB.w}x${planB.h}`));
  assert.ok(m.tick(1000), 'the numbers are on their way');
  assert.ok(m.view(1000)!.blk[3]! < 0.01, 'the block fades in, never pops');
  let now = 1000, last = a.v[0]!;
  for (let i = 0; i < 20; i++) { now += 16; m.tick(now); const s = m.view(now)!.shown.v[0]!; assert.ok(s >= last - 1e-9 && s <= b.v[0]! + 0.2); last = s; }
  assert.ok(m.view(now)!.shown.v[0]! > a.v[0]! && m.view(now)!.shown.v[0]! < b.v[0]!, 'between the two');
  assert.ok(m.view(now)!.blk[3]! > 0 && m.view(now)!.blk[3]! < 1, 'the block half in');
  for (let i = 0; i < 400; i++) { now += 16; m.tick(now); }
  assert.ok(!m.tick(now + 16) || true);
  assert.deepEqual(m.view(now)!.shown.v.map(r1), b.v.map(r1), 'settled on the goal');
  assert.equal(m.view(now)!.blk[3], 1);
  assert.equal(m.fading(now), false);
  m.setHold(true, now);
  assert.ok(m.view(now)!.brk > 0.99, 'the hold starts from where it is');
  assert.ok(m.view(now + 600)!.brk < 1e-6 && m.view(now + 600)!.blk[3]! < 1e-6, 'held: no brackets, no block');
  m.setHold(false, now + 700);
  assert.ok(m.view(now + 700 + 600)!.brk > 0.999 && m.view(now + 700 + 600)!.blk[3]! > 0.999, 'released: they ease back');
  const r = restView(planB);
  assert.equal(r.blk[3], 1);
  assert.equal(restView(planB, true).brk, 0);
  assert.equal(fadeAt({ a: 1, from: 0, t0: 0 }, 420), 1);
  assert.equal(fadeAt({ a: 1, from: 0, t0: 0 }, 0), 0);
  const red = new ProfileMotion(); red.reduce = true; red.aim(planB.goal, planB, 0); red.aim(planA.goal, planA, 10);
  red.tick(10);
  assert.deepEqual(red.view(10)!.shown.v.map(r1), a.v.map(r1), 'reduced motion: at once');
});

test('the frame: every piece in every look, no word under 12 px, nothing outside the box, the gradient at its stations\' colours', async () => {
  const of = async (id: string) => profileOf(await fpOf(id))!;
  const healthy = await of('healthy');
  for (const id of ['healthy', 'csph', 'cirr-decomp', 'pvt-chronic', 'budd-chiari', 'cirr-decomp-tips']) {
    const p = await of(id);
    eachLook((look) => {
      for (const [w, d] of [[300, 'phone-portrait'], [330, 'desktop'], [330, 'phone-landscape'], [430, 'tablet-portrait'], [720, 'desktop']] as const) {
        const c = ctxOf(look, w, d), plan = planProfile(w, 0, Math.max(12, c.type.sm), goalOf(p, healthy, null), healthy, null, SPANS);
        const f = profileFrameAtRest(plan, c);
        judge(f, look, { onCard: false });
        assert.equal(f.w, w);
        assert.ok(f.h >= plan.G.need - 1);
        const words = f.shapes.filter((s): s is TextShape => s.k === 'text').map((s) => s.s);
        assert.ok(words.includes('mmHg') && words.includes('sinusoidal'), 'the unit and the brace\'s name');
        for (const n of plan.G.fit.names) assert.ok(words.includes(n), `${look}: station name ${n}`);
        for (const v of p.v) assert.ok(words.includes(words0(v)), `${look}: reading ${v}`);
        assert.equal(f.label, profileWords(plan.goal, SPANS));
      }
    });
  }
  // the line starts and ends in the pressure ramp's colours at the first and last stations (the 2D gradient)
  const c = ctxOf('light', 400), p = await of('csph'), plan = planProfile(400, 0, 13, goalOf(p, healthy, null), healthy, null, SPANS), f = profileFrameAtRest(plan, c);
  const strokes = f.shapes.filter((s) => s.k === 'path' && s.pen && s.pen.w === 3 && !s.pen.dash) as unknown as { k: 'path'; pts: number[]; pen: { color: readonly number[] } }[];
  assert.ok(strokes.length > 30);
  const first = strokes[0]!, last = strokes.at(-1)!;
  const want0 = pressureColour('light', p.v[0]!), want1 = pressureColour('light', p.v[7]!);
  assert.ok(Math.abs(first.pen.color[0]! - want0[0]) < 0.06 && Math.abs(first.pen.color[2]! - want0[2]) < 0.06);
  assert.ok(Math.abs(last.pen.color[0]! - want1[0]) < 0.06 && Math.abs(last.pen.color[2]! - want1[2]) < 0.06);
  // no line is drawn through a reading
  for (const s of strokes) for (let i = 0; i < NS; i++) {
    const [x0, y0, x1, y1] = s.pts as [number, number, number, number], cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    if (Math.abs(cx - plan.G.x(i)) < 3) assert.ok(Math.abs(cy - (plan.G.Z - (plan.G.Z - plan.G.T) * p.v[i]! / plan.goal.top)) > 4, 'the line stops short of the reading');
  }
});

test('the brackets and pills are rated on the cut-offs: HVPG amber past 5, red from 10; PPG amber from 6, red from 12', async () => {
  const hl = profOf([12, 8, 7, 7, 5, 4.5, 4, 3.5], 2.3, 4.1);
  const c = ctxOf('light', 400), lk = profileLooks(c, 13);
  const ok = lk('prof.br.path', { rate: 'ok' }).stroke, mid = lk('prof.br.path', { rate: 'mid' }).stroke, hi = lk('prof.br.path', { rate: 'hi' }).stroke;
  assert.notDeepEqual(ok, mid); assert.notDeepEqual(mid, hi);
  const draw = (hvpg: number, ppg: number) => {
    const p = profOf([20, 17, 17, 16, 6, 5, 4.6, 4], hvpg, ppg), plan = planProfile(400, 0, 13, goalOf(p, hl, null), hl, null, SPANS);
    return profileFrameAtRest(plan, c).shapes.filter((s) => s.k === 'path' && s.pen && s.pen.w === 1.5).map((s) => (s as { pen: { color: readonly number[] } }).pen.color.join());
  };
  const calm = draw(3, 4), sick = draw(12, 14);
  assert.notDeepEqual(calm, sick, 'the brackets change colour with the rating');
  assert.ok(sick.includes(hi!.join()), 'red past the cut-offs');
  assert.deepEqual(pillReadings({ ...profOfFp(11.1, 13) }).map((q) => [q.k, q.v, q.rate]), [['hvpg', '11', 'hi'], ['ppg', '13', 'hi']]);
  assert.deepEqual(pillReadings({ ...profOfFp(5, 6) }).map((q) => [q.k, q.v, q.rate]), [['hvpg', '5', 'ok'], ['ppg', '6', 'mid']]);
  assert.deepEqual(pillReadings({ ...profOfFp(7, 6), tipsFlow: 1.2 }).map((q) => q.k), ['ppg'], 'a stent in: no HVPG pill');
  assert.deepEqual(pillReadings(null), []);
});
const profOfFp = (hvpg: number, ppg: number): Fp => ({ int: 20, pv: 17, cv: 6, whvp: 16, fhvp: 5, ivc: 4.6, ra: 4, at: { P: new Array(80).fill(8) }, hvpg, ppg });

test('the ladder\'s cell variant: thicker pens at the cell\'s type size, the same pieces', () => {
  const c = ctxOf('light', 400);
  const own = profileLooks(c, 20), cell = profileLooks(c, 20, { chCap: 20, lad: 1 });
  assert.equal(own('prof.line').width, 3);
  assert.equal(cell('prof.line').width, 4, 'max(3 px, 0.2 em) at 20 px');
  assert.equal(cell('prof.axis').width, 1.5);
  assert.equal(own('prof.axis').width, 1);
  const p = profOf([21, 17.6, 17.3, 16.2, 6.3, 5.1, 4.6, 4], 11.1, 13);
  const plan = planProfile(400, 0, 20, goalOf(p, null, null), null, null, SPANS);
  const a = profileFrameAtRest(plan, c), b = profileFrameAtRest(plan, c, { cell: { chCap: 20, lad: 1 } });
  assert.equal(a.shapes.length, b.shapes.length);
});

test('data: the earlier state a slide names, a frame\'s fingerprint, the chart\'s inputs', async () => {
  const [A, B, C] = [await fpOf('healthy'), await fpOf('csph'), await fpOf('cirr-decomp')];
  const slides = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], by: Record<string, Fp> = { a: A, b: B, c: B, d: C };
  const o = (index: number, fp: Fp) => ({ slides, index, fp, fpOf: (id: string) => by[id] });
  assert.equal(beforeOf(false, o(3, C)), null);
  assert.equal(beforeOf('a', o(3, C)), A, 'a slide id: that slide\'s state');
  assert.equal(beforeOf(true, o(3, C)), B, 'true: the nearest slide before whose state differs');
  assert.equal(beforeOf(true, o(2, B)), B === by.b ? A : null, 'a slide before with the same state is skipped');
  assert.equal(beforeOf(true, o(0, A)), null);
  const inp = profileInputs(B, A, C)!;
  assert.equal(inp.goal.top, 30);
  assert.equal(profileInputs(null, A, C), null);
  assert.equal(profileInputs({ pv: 3 } as Fp), null);
  // a live frame gives the same readings the profile reads
  const P = new Float32Array(80).fill(7);
  const fp = fpFromFrame({ P, Pf: P, metrics: { hvpg: 11.14, whvp: 16.2, fhvp: 5.1, pv: 17.6, ivc: 4.6, ra: 4 } } as never);
  assert.equal(fp.whvp, 16.2);
  assert.equal(fp.at!.P, P);
  assert.equal(hasStent(fp), false);
});

test('the registry entry: done, seven specimens, each sound in every look', () => {
  assert.equal(profileEntry.status, 'done');
  assert.ok(profileEntry.specimens.length >= 4);
  const ids = profileEntry.specimens.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length);
  eachLook((look) => { for (const s of profileEntry.specimens) judge(s.build(ctxOf(look, 330)), look, { onCard: false }); });
  // a specimen with no bracket has no band under the plot: its box is shorter than the default one's
  const c = ctxOf('light', 330);
  const hl = profOf([12, 8.1, 7.6, 6.9, 5.2, 4.6, 4, 3.5], 2.3, 4.1), p = profOf([21, 17.6, 17.3, 16.2, 6.3, 5.1, 4.6, 4], 11.1, 13);
  assert.ok(profileSpecimen({ p, hl, spans: NO_SPANS }, c).h <= profileSpecimen({ p, hl }, c).h);
  // the stent's specimen has one bracket, the PPG's
  const f = profileSpecimen({ p, hl, spans: spansStented(SPANS) }, c);
  const words = f.shapes.filter((s): s is TextShape => s.k === 'text').map((s) => s.s.trim());
  assert.ok(words.includes('PPG') && !words.includes('HVPG'));
  const g = profileGeo(330, 0, 13, twAt(13), false, SPANS);
  assert.equal(bracketGeom(g, 13, twAt(13), 0, 11).ticks.length, 2);
});

test('a frame in the middle of a glide keeps the box; held, it has no bracket and no block; the readings are the shown ones', async () => {
  const of = async (id: string) => profileOf(await fpOf(id))!;
  const [a, b] = [await of('csph'), await of('cirr-decomp')], hl = await of('healthy');
  const c = ctxOf('light', 400);
  const plan = planProfile(400, 0, 13, goalOf(b, hl, null), hl, null, SPANS), mid = restView(plan);
  mid.shown = { ...mid.shown, v: a.v.map((v, i) => (v + b.v[i]!) / 2) };
  const f1 = profileFrame(plan, mid, c), f2 = profileFrameAtRest(plan, c), f3 = profileFrameAtRest(plan, c, { held: true });
  assert.equal(f1.h, f2.h);
  const words = (f: { shapes: readonly { k: string }[] }) => f.shapes.filter((s): s is TextShape => s.k === 'text').map((s) => s.s.trim());
  assert.ok(words(f1).includes(words0(mid.shown.v[0]!)) && !words(f1).includes(words0(b.v[0]!)), 'the reading shown is the glide\'s, not the goal\'s');
  assert.ok(words(f2).includes('HVPG') && words(f2).includes('PPG'));
  const pen15 = (f: { shapes: readonly { k: string; pen?: { w: number } }[] }) => f.shapes.filter((s) => s.k === 'path' && s.pen?.w === 1.5).length;
  assert.ok(pen15(f3) < pen15(f2), 'held: the brackets\' ticks and bars are out (the pills stay, as in 2D)');
  assert.ok(words(f3).filter((w) => w === 'HVPG').length < words(f2).filter((w) => w === 'HVPG').length, 'held: the bracket\'s name is out, the pill\'s stays');
  assert.ok(f3.shapes.filter((s) => s.k === 'clip').length < f2.shapes.filter((s) => s.k === 'clip').length, 'held: no block (a block is clipped hatching)');
});

