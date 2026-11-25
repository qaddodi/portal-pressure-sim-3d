import { test } from 'node:test';
import assert from 'node:assert/strict';
import { criteriaRow, criteriaRows, criteriaMet, criteriaReading, cutParts, verdictParts, keyLine, criteriaHasCase } from '../src/ui/charts/criteria/rows.ts';
import { ZONES, bavenoRects, hatchSegments, hatchSlivers, zonesFrame, plotHeight, BAVENO } from '../src/ui/charts/criteria/zones.ts';
import { ctxOf, eachLook, judge } from './charts-helpers.ts';

test('rows: a plain string, a tuple and an object read into one shape; empty ones are dropped; at most four', () => {
  assert.equal(criteriaRow('  ')?.text, undefined);
  assert.deepEqual(criteriaRow('Child–Pugh **>7**')?.bold, ['Child–Pugh ', '>7', '']);
  const live = criteriaRow(['HVPG ≥10', 'hvpg', '>=', 10])!;
  assert.deepEqual([live.key, live.op, live.value], ['hvpg', '>=', 10]);
  assert.equal(criteriaRow({ text: 'x', key: 'hvpg', op: 'nope', value: 3 })!.key, null);
  assert.equal(criteriaRows({ rows: ['a', 'b', '', 'c', 'd', 'e'] }).length, 4);
  assert.equal(criteriaHasCase({ rows: ['a', { text: 'b', note: 'C 10' }] }), true);
});

test('a live row is judged as its tile prints the reading (HVPG 9.96 prints 10.0 and meets ≥10)', () => {
  const r = criteriaRow(['CSPH', 'hvpg', '>=', 10])!;
  assert.equal(criteriaMet(r, { hvpg: 9.96 }), true);
  assert.equal(criteriaMet(r, { hvpg: 9.94 }), false);
  assert.equal(criteriaMet(r, {}), null);
  assert.equal(criteriaReading(r, { hvpg: 21.34 }), '21.3 mmHg');
  assert.equal(criteriaReading(r, null), '—');
  // a tile with a scale: ascites in mL on the engine, litres on the screen
  const a = criteriaRow(['Ascites', 'asc', '>', 1])!;
  assert.equal(criteriaMet(a, { asc: 1500 }), true);
  assert.equal(criteriaReading(a, { asc: 1500 }), '1.5 L');
});

test('cut-offs, verdicts and key lines are split the way the card sets them', () => {
  assert.deepEqual(cutParts('≥20 mmHg'), { sign: '≥', num: '20', unit: 'mmHg' });
  assert.deepEqual(cutParts('C 10–13'), { sign: '', num: 'C 10–13', unit: '' });
  assert.equal(cutParts(''), null);
  assert.deepEqual(verdictParts('Result: TIPS is indicated.'), { bold: 'Result:', rest: 'TIPS is indicated.' });
  assert.deepEqual(verdictParts('No colon here'), { bold: '', rest: 'No colon here' });
  assert.equal(keyLine({ text: '**Hatched:** can skip EGD', swatch: 'hatch' })!.swatch, 'hatch');
  assert.equal(keyLine('  '), null);
});

test('the first-visit zones are the Baveno VIII cut-offs and tile the plot exactly once (never overlapping)', () => {
  assert.deepEqual([BAVENO.out, BAVENO.in, BAVENO.egd, BAVENO.plt], [15, 25, 20, 150]);
  const fig = ZONES['first-visit']!;
  const area = fig.zones.reduce((s, z) => s + (z.x[1] - z.x[0]) * (z.y[1] - z.y[0]), 0);
  assert.equal(area, (fig.x[1] - fig.x[0]) * (fig.y[1] - fig.y[0]));
  assert.equal(bavenoRects(fig.x, fig.y).length, 4);
  assert.deepEqual(fig.hatch, { x: [5, 20], y: [150, 250] });
});

test('the hatch stripes stay inside their rectangle and are 7 px apart across', () => {
  const segs = hatchSegments(10, 20, 80, 40);
  assert.ok(segs.length > 10);
  for (const [x1, y1, x2, y2] of segs) {
    for (const [x, y] of [[x1, y1], [x2, y2]] as const) assert.ok(x! >= 10 - 1e-6 && x! <= 90 + 1e-6 && y! >= 20 - 1e-6 && y! <= 60 + 1e-6);
    assert.ok(Math.abs(x1! + y1! - (x2! + y2!)) < 1e-6, 'a stripe is one "/" line');
  }
  const cs = segs.map(([x1, y1]) => x1! + y1!);
  assert.ok(Math.abs(cs[1]! - cs[0]! - 7 * Math.SQRT2) < 1e-6);
});

test('the hatch is drawn as filled slivers: 2 px stripes (2·√2 across x + y) 7 px apart, wholly inside the rectangle', () => {
  const sl = hatchSlivers(10, 20, 80, 40);
  assert.ok(sl.length > 10);
  const area = (p: number[]) => { let a = 0; for (let i = 0; i < p.length; i += 2) { const j = (i + 2) % p.length; a += p[i]! * p[j + 1]! - p[j]! * p[i + 1]!; } return Math.abs(a) / 2; };
  for (const p of sl) for (let i = 0; i < p.length; i += 2) assert.ok(p[i]! >= 10 - 1e-6 && p[i]! <= 90 + 1e-6 && p[i + 1]! >= 20 - 1e-6 && p[i + 1]! <= 60 + 1e-6);
  // a stripe wholly inside is a 2 px wide band: its area is 2 px times its length
  const mid = sl[Math.floor(sl.length / 2)]!;
  assert.ok(area(mid) > 0);
  // together the stripes cover 2/7 of the rectangle
  assert.ok(Math.abs(sl.reduce((a, p) => a + area(p), 0) / (80 * 40) - 2 / 7) < 0.02);
  const f = zonesFrame(ZONES['first-visit']!, ctxOf('light', 330), 'z');
  assert.ok(f.shapes.filter((s) => s.k === 'path' && s.closed && s.fill).length >= 10);
  assert.ok(!f.shapes.some((s) => s.k === 'line'), 'no stroked hatch lines');
});

test('the zones graph in every look: words ≥12 px, inside the box, height from the width only, names where the zones are', () => {
  eachLook((look) => {
    for (const w of [300, 330, 430, 560]) {
      const f = zonesFrame(ZONES['first-visit']!, ctxOf(look, w), 'Stiffness and platelets');
      assert.equal(f.h, plotHeight(w));
      const { words } = judge(f, look, { onCard: false });
      for (const name of ['No CSPH', 'Indeterminate', 'CSPH', '15', '20', '25', 'LSM, kPa', '150K', 'PLT']) assert.ok(words.some((t) => t.s === name), `${look} ${w}: no "${name}"`);
    }
  });
});

test('the zone words read on their tint in every look (4.5:1, the halo is the card)', async () => {
  const { paletteOf } = await import('../src/ui/charts/palette.ts');
  const { contrast, mix } = await import('../src/ui/charts/colour.ts');
  eachLook((look) => {
    const p = paletteOf(look);
    for (const [tok, pct] of [['ok', 34], ['caution', 28], ['danger', 32]] as const) {
      const bg = mix('srgb', mix('srgb', p.tok(tok), pct, [0, 0, 0, 0]), 100, p.tok('surface'));
      // the tint over the card: alpha-composited by hand
      const t = mix('srgb', p.tok(tok), pct, p.tok('surface'), 100 - pct);
      assert.ok(contrast(p.tok('text'), t) >= 4.5, `${look}: the zone name on the ${tok} tint reads ${contrast(p.tok('text'), t).toFixed(2)}`);
      void bg;
    }
  });
});

// Tipping 6, capture 52ef8e63: "This case 12.4 mmHg" never said which pressure.
import { criteriaCaseHead } from '../src/ui/charts/criteria/rows.ts';
test('the case column is named by the measure when every live row reads one', () => {
  assert.equal(criteriaCaseHead(criteriaRows({ rows: [['With CSPH', 'hvpg', '>=', 10], 'Without CSPH']})), 'HVPG, this case');
  assert.equal(criteriaCaseHead(criteriaRows({ rows: [['a', 'hvpg', '>=', 10], ['b', 'map', '<', 65]]})), 'This case');
  assert.equal(criteriaCaseHead(criteriaRows({ rows: [{ text: 'a', note: 'x' }] })), 'This case');
});

import { patientDot } from '../src/ui/charts/criteria/zones.ts';
test('the zones chart marks the patient where his LSM and platelets stand, inside the plot', () => {
  const fig = ZONES['first-visit']!, W = 330, ph = plotHeight(W);
  assert.equal(patientDot(fig, { lsm: 18 }, W, ph), null, 'both readings or no dot');
  const d = patientDot(fig, { lsm: 18, plt: 128 }, W, ph)!;
  assert.ok(d.x > W * (18 - 5) / 30 - 1 && d.x < W * (18 - 5) / 30 + 1, 'LSM 18 on the x axis');
  const far = patientDot(fig, { lsm: 90, plt: 10 }, W, ph)!;
  assert.ok(far.x <= W && far.y <= ph && far.x >= 0 && far.y >= 0, 'past the axes: on the edge');
  const f = zonesFrame(fig, ctxOf('dark', W), 'z', { lsm: 18, plt: 128 });
  assert.equal(f.shapes.filter((s) => s.k === 'circle').length, 1);
  assert.equal(zonesFrame(fig, ctxOf('dark', W), 'z').shapes.filter((s) => s.k === 'circle').length, 0);
});
