import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SHIFT_KEYS, keepClear, monotone, movedFrom, shiftStages, spread, stageVals, thin, topScale, rowVals, shiftColour, fmtV, endsLapse, lapseStage, pinStage, shownCount } from '../src/ui/charts/shift/model.ts';
import { shiftFrame } from '../src/ui/charts/shift/frame.ts';
import { shiftData, shiftTrail } from '../src/ui/charts/shift/data.ts';
import { shiftEntry } from '../src/ui/charts/shift/entry.ts';
import { ctxOf, eachLook, judge } from './charts-helpers.ts';

// The expected numbers below were computed once by running the 2D app's own functions (tool-shift.js, lines 39 to 137) in node.
test('the axis, the curve, the column, the thinning and the stages are the 2D functions', () => {
  assert.deepEqual(topScale([100, 120, 160, 45, 230, 88]), { min: 0, max: 250, step: 50, ticks: [0, 50, 100, 150, 200, 250] });
  assert.deepEqual(topScale([100, 95, 110, 102]), { min: 80, max: 120, step: 20, ticks: [80, 100, 120] });
  assert.deepEqual(topScale([100, 300, 20]), { min: 0, max: 350, step: 50, ticks: [0, 50, 100, 150, 200, 250, 300, 350] });
  assert.deepEqual(monotone([0, 10, 20, 30], [5, 9, 9.5, 2], 4), [
    [[0, 5], [2.5, 6.1171875], [5, 7.3125], [7.5, 8.3515625], [10, 9]],
    [[10, 9], [12.5, 9.2890625], [15, 9.4375], [17.5, 9.4921875], [20, 9.5]],
    [[20, 9.5], [22.5, 8.6796875], [25, 6.6875], [27.5, 4.2265625], [30, 2]]]);
  assert.deepEqual(spread([10, 12, 13, 50, 200], 14, 5, 60), [-130, -116, -102, -88, 60]);
  assert.deepEqual([...keepClear([20, 60, 100, 140, 180], [50, 50, 50, 50, 50], 200)], [4, 2]);
  assert.deepEqual(thin(Array.from({ length: 200 }, (_, i) => [i, i * 2]), 5), [[0, 0], [50, 100], [100, 200], [149, 298], [199, 398]]);
  assert.deepEqual(shiftStages([{ tool: { kind: 'shift' }, tick: 'A' }, { tool: { kind: 'shift' }, lapse: { from: 'F', to: 'T' } }, { tool: { kind: 'x' } }, { tool: { kind: 'shift' }, title: 'Z' }], [0, 1, 1, 3]),
    [{ j: 0, k: 0, start: false, name: 'A' }, { j: 1, k: 1, start: true, name: 'F' }, { j: 1, k: 1, start: false, name: 'T' }, { j: 3, k: 3, start: false, name: 'Z' }]);
  // 100 is always a gridline, and the readings are always inside the axis
  for (const vs of [[100, 130, 70], [100, 101], [100, 55, 400]]) { const s = topScale(vs); assert.ok(s.ticks.includes(100)); assert.ok(s.min <= Math.min(...vs) && s.max >= Math.max(...vs)); }
});

test('a reading moved only past 0.4 % of itself; a state is its trail first row on a time-lapse start', () => {
  const a = Object.fromEntries(SHIFT_KEYS.map((k) => [k, 1])) as Record<string, number>;
  assert.equal(movedFrom(a, { ...a, co: 1.003 }), false);
  assert.equal(movedFrom(a, { ...a, co: 1.005 }), true);
  const st = shiftStages([{ tool: { kind: 'shift' }, lapse: { from: 'Before', to: 'After' } }]);
  const row = [0, 1, 2, 3, 4, 5, 6];
  assert.deepEqual(rowVals(row), { co: 1, svr: 2, map: 3, bv: 4, pv: 5, spl: 6 });
  assert.deepEqual(stageVals(st[0]!, { fp: { ...a, co: 9 }, trail: [row] }), rowVals(row));
  assert.deepEqual(stageVals(st[1]!, { fp: a }), a);
  assert.equal(stageVals(st[1]!, { fp: { co: 1 } }), null);
  assert.equal(fmtV('co', 104.6), '105%');
  assert.equal(fmtV('pv', 12.34), '12.3');
  assert.equal(fmtV('spl', 1.5), '1.50');
  for (const k of SHIFT_KEYS) assert.match(shiftColour(k), /^tr-/);
});

const A = { co: 5, svr: 1000, map: 90, bv: 5000, pv: 8, spl: 1 }, B = { co: 7, svr: 700, map: 80, bv: 5600, pv: 16, spl: 1.8 }, C = { co: 8, svr: 600, map: 75, bv: 5900, pv: 20, spl: 2.2 };
const slides = [{ tool: { kind: 'shift' }, tick: 'Healthy' }, { tool: { kind: 'shift' }, tick: 'Compensated' }, { tool: { kind: 'shift' }, tick: 'Decompensated' }];

test('a slot shows once its slide is reached; the slide that brings a state shows it once the model has moved', () => {
  const d = shiftData(slides, (j) => ({ fp: [A, B, C][j] }));
  const inp = (at: number, live?: typeof A | null) => ({ ...d, at, live });
  assert.equal(shownCount(inp(0), null, -1), 1);
  assert.equal(shownCount(inp(1), null, -1), 2);
  assert.equal(shownCount(inp(2), null, -1), 3);
  // a question slide holds the state before until its readings move: a live reading that has not left the one before
  const hold = inp(1, { ...A });
  assert.equal(pinStage(hold), 1);
  assert.equal(shownCount(hold, null, 1), 1);
  assert.equal(shownCount(inp(1, B), null, 1), 2);
  // a state whose state is not worked out is not shown, nor those after it
  const half = shiftData(slides, (j) => (j < 2 ? { fp: [A, B][j] } : null));
  assert.equal(shownCount({ ...half, at: 2 }, null, -1), 2);
  assert.equal(shiftTrail({ lapse: { from: 'a' } }), SHIFT_KEYS);
  assert.equal(shiftTrail({}), false);
  const lapseSlides = [...slides, { tool: { kind: 'shift' }, lapse: { from: 'Day 0', to: 'Day 90' } }];
  const ls = shiftData(lapseSlides, (j) => ({ fp: [A, B, C, C][j], start: { fp: C } }));
  assert.equal(ls.stages.length, 5);
  assert.ok(endsLapse(ls.stages, 4) && !endsLapse(ls.stages, 3));
  assert.equal(lapseStage(ls.stages, 3), 4);
  // the days wait while the slide is a time-lapse not yet played
  assert.equal(shownCount({ ...ls, at: 3, waitDays: true }, null, -1), 4);
});

test('every frame: words at least 12 px, inside the box, in every look at every width; the lines are lit or faint as the slide says', () => {
  const d = shiftData(slides, (j) => ({ fp: [A, B, C][j] }));
  eachLook((look) => {
    for (const [w, dev] of [[300, 'phone-portrait'], [330, 'desktop'], [430, 'tablet-portrait'], [330, 'phone-landscape']] as const) {
      const c = ctxOf(look, w, dev);
      for (const at of [0, 1, 2]) judge(shiftFrame({ ...d, at }, c).frame, look, { onCard: false });
      judge(shiftFrame({ ...d, at: 2, lit: ['pv', 'spl'], whatIf: true, live: { ...C, pv: 12 } }, c).frame, look, { onCard: false });
    }
  });
  for (const s of shiftEntry.specimens) eachLook((look) => judge(s.build(ctxOf(look, 330)), look, { onCard: false }));
  const c = ctxOf('light', 330), plain = shiftFrame({ ...d, at: 2 }, c), lit = shiftFrame({ ...d, at: 2, lit: ['pv'] }, c);
  const strokes = (f: typeof plain.frame) => f.shapes.filter((s) => s.k === 'path').map((s) => (s.k === 'path' ? s.pen!.color[3] : 0));
  assert.ok(strokes(plain.frame).every((a) => a === strokes(plain.frame)[0]));
  assert.ok(strokes(lit.frame).some((a) => a < strokes(plain.frame)[0]!), 'a line the slide does not teach is faint');
  assert.equal(plain.n, 3);
  assert.match(plain.frame.label, /^Change from healthy: Healthy, CO 100%, SVR 100%, MAP 100%, Volume 100%, Portal 8\.0 mmHg, Inflow 1\.00 L\/min; Compensated, CO 140%/);
});

test('a time-lapse in play draws its head on the trail and the column follows the head', () => {
  const row = (t: number) => [90 * t, ...['co', 'svr', 'map', 'bv', 'pv', 'spl'].map((k) => (C as Record<string, number>)[k]! + (B as Record<string, number>)[k]! * 0 - ((C as Record<string, number>)[k]! - (A as Record<string, number>)[k]!) * 0.5 * t)];
  const trail = Array.from({ length: 31 }, (_, i) => row(i / 30));
  const ls = shiftData([...slides, { tool: { kind: 'shift' }, lapse: { from: 'Day 0', to: 'Day 90' } }], (j) => ({ fp: [A, B, C, C][j], trail: j === 3 ? trail : null }));
  const c = ctxOf('light', 330);
  const f0 = shiftFrame({ ...ls, at: 3, lapse: { i: 4, trail, shown: 0.25 } }, c), f1 = shiftFrame({ ...ls, at: 3, lapse: { i: 4, trail, shown: 0.75 } }, c);
  assert.equal(f0.n, 4);
  const word = (f: typeof f0, s: string) => f.frame.shapes.filter((x) => x.k === 'text' && x.s === s).length;
  assert.equal(word(f0, 'Day 90'), 1);
  const heads = (f: typeof f0) => f.frame.shapes.filter((x) => x.k === 'circle' && x.r === 4.5).map((x) => (x.k === 'circle' ? x.cx : 0));
  assert.ok(Math.max(...heads(f1)) > Math.max(...heads(f0)), 'the head moves right as the days play');
  assert.ok(f1.frame.label.length > 0);
});

test('the chart\'s SVR is MAP over CO, so CO x SVR is the MAP it names (hyperdynamic 4: 133 % x 64 % was 85 %, not 91 %)', async () => {
  const { stateOfStep } = await import('../src/ui/charts/shift/data.ts');
  const h = stateOfStep({ fp: { co: 5, svr: 18, map: 93, bv: 5000, pv: 7, spl: 1 } as never }).fp!, c = stateOfStep({ fp: { co: 6.65, svr: 11.6, map: 84.6, bv: 5500, pv: 13, spl: 1.5 } as never, trail: [[0, 5, 18, 93, 5000, 7, 1], [1, 6.65, 11.6, 84.6, 5500, 13, 1.5]] as never });
  assert.ok(Math.abs((c.fp!.co! / h.co!) * (c.fp!.svr! / h.svr!) - c.fp!.map! / h.map!) < 1e-9);
  assert.ok(Math.abs(c.trail![1]![2]! - 84.6 / 6.65) < 1e-9);
});

// Audit af1c51a0 (iPhone, Hyperdynamic 5): the state's name was the slide's title ("Splanchnic vasodilation keeps the portal pressure high"), centred on its state, so its left end was cut off at the card's edge.
// Every name under the lower panel now stands whole inside the card, in every deck that names a state by its title, at every width; one wider than the card is not drawn (text never shrinks, nothing is cut off).
test('a state\'s name under the lower panel is never cut off by the card\'s edge, at any width, for the hyperdynamic deck\'s own states', async () => {
  const { DECK } = await import('../src/decks/hp/data/hyperdynamic.copied.ts');
  const { measure } = await import('../src/ui/charts/measure.ts');
  const { stageNameX } = await import('../src/ui/charts/shift/model.ts');
  assert.equal(stageNameX(10, 100, 300), 52, 'held 2 px inside the left edge');
  assert.equal(stageNameX(290, 100, 300), 248, 'held 2 px inside the right edge');
  assert.equal(stageNameX(150, 100, 300), 150, 'a name clear of both edges stays on its state');
  const slides = ((DECK as unknown as { slides: { tool?: { kind?: string }; tick?: string; lapse?: { from?: string; to?: string }; title?: string }[] }).slides);
  const R = (j: number) => ({ co: 5 + 0.4 * j, svr: 1000 - 40 * j, map: 90 - j, bv: 5000 + 150 * j, pv: 8 + 1.5 * j, spl: 1 + 0.12 * j });
  const d = shiftData(slides, (j) => ({ fp: R(j), start: { fp: R(j - 0.5) } }));
  for (const [w, dev] of [[300, 'phone-portrait'], [340, 'phone-portrait'], [390, 'phone-portrait'], [430, 'tablet-portrait'], [330, 'phone-landscape']] as const) {
    const c = ctxOf('dark', w, dev);
    for (let at = 0; at < slides.length; at++) {
      const fr = shiftFrame({ ...d, at }, c).frame;
      for (const t of fr.shapes) {
        if (t.k !== 'text' || !t.s.trim()) continue;
        const wd = measure(t.s, t.size, t.weight ?? 500);
        const x0 = t.anchor === 'end' ? t.x - wd : t.anchor === 'middle' ? t.x - wd / 2 : t.x;
        assert.ok(x0 >= -0.5 && x0 + wd <= fr.w + 0.5, `${w} px, slide ${at + 1}: "${t.s}" stands ${x0.toFixed(1)} to ${(x0 + wd).toFixed(1)} in a card ${fr.w.toFixed(0)} px wide`);
      }
    }
  }
});
