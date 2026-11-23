// Review of the random capture bbe955e5 (23 Nov): the fixes that are pure enough for node.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reserveOf } from '../src/ui/cards/roll-reserve.ts';
import { flowTimeSeries } from '../src/ui/charts/flowtime/model.ts';
import { planeLayout, planeOf } from '../src/ui/charts/plane/model.ts';
import { inputsIn } from '../src/ui/cards/inputs-in.ts';

test('item 6: a reading holds no minus slot unless a slider or a strain can take it below zero, and a time-lapse reading is as wide as the widest it takes', () => {
  assert.equal(reserveOf('1.4 mmHg', 'ppg', false, false, { minus: false }), '00.0 mmHg');
  assert.equal(reserveOf('1.4 mmHg', 'ppg', false, false), '−00.0 mmHg', 'a slider slide keeps it');
  assert.equal(reserveOf('−2.1 mmHg', 'ppg', false, false, { minus: false }), '−00.0 mmHg', 'a negative value always has its sign');
  // recompensation 4: the ascites goes 0.0 to 3.8 L, the HVPG 11 to 16.5: no digit is held that no day of the lapse reaches
  assert.equal(reserveOf('3.8 L', 'asc', false, false, { seen: ['0.0 L', '3.8 L'], minus: false }), '0.0 L');
  assert.equal(reserveOf('16.5 mmHg', 'hvpg', false, false, { seen: ['11.1 mmHg', '16.5 mmHg'], minus: false }), '00.0 mmHg');
  // a day of the lapse that reaches two digits widens the box for the whole lapse
  assert.equal(reserveOf('9.8 L', 'asc', false, false, { seen: ['0.0 L', '12.4 L'] }), '00.0 L');
});

test('item 4: a time-lapse chart that names the slide before starts from its readings, so "falls to 6.6" is a fall on the chart', () => {
  const trail = [[0, 28.5, 6.2], [30, 36, 6.4], [60, 37.7, 6.6]];
  const lines = ['pv', 'hvpg'];
  const plain = flowTimeSeries(trail, 'days', lines, null, null)!, lead = flowTimeSeries(trail, 'days', lines, null, { before: { pv: 23.8, hvpg: 8.2 } })!;
  assert.equal(plain.flow[0], 6.2);
  assert.equal(lead.flow[0], 8.2);
  assert.equal(lead.pv[0], 23.8);
  assert.equal(lead.flow.at(-1), 6.6, 'the end is the slide\'s own');
  assert.ok(lead.flow[0]! > lead.flow.at(-1)!);
  const src = readFileSync('src/ui/talk/ToolCardBody.tsx', 'utf8');
  assert.match(src, /before=\{\(tool\.delta \?\? \(cs as Rec\)\.delta\) != null \? refOf\(/);
});

test('item 5: the cards of a slide count the build-time states as in, so a slide opened first by a link does not wait for the live chain', () => {
  const src = readFileSync('src/ui/cards/CardLayer.tsx', 'utf8');
  assert.match(src, /const states = useMemo\(\(\) => mergeStates\(deck\.id, liveStates\)/);
  assert.match(src, /inputsIn\(toolAt, states\) && inputsIn\(wordsAt, states\)/);
  assert.equal(inputsIn(7, [undefined, undefined]), false);
  assert.equal(inputsIn(1, [undefined, { fp: {} }]), true);
});

test('item 7: the chart\'s step numbers are a bold numeral with a halo, no disc', () => {
  const src = readFileSync('src/ui/charts/trace/frame.ts', 'utf8');
  const ring = src.slice(src.indexOf('const ring = ('), src.indexOf('const y0 = fs + 3'));
  assert.doesNotMatch(ring, /k: 'circle'/);
  assert.match(ring, /weight: 700, halo:/);
});

test('item 8: the fluid card cuts no words with an ellipsis (captions, feet, the answer and its detail wrap)', () => {
  const src = readFileSync('src/ui/charts/fluid/frame.ts', 'utf8');
  const day = src.slice(src.indexOf('// ── the day card ──'), src.indexOf('// ── the flow picture ──'));
  assert.doesNotMatch(day.replace(/ellip\(unit/, ''), /ellip\(/);
});

test('item 10: a line of equal resistance names itself in full where any room is left (masld 9 on a phone)', () => {
  let seed = 7;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
  const pl = planeOf('flow-ppg')!;
  let bare = 0, whole = 0;
  for (let n = 0; n < 200; n++) {
    const W = [300, 340, 390, 480][n % 4]!;
    const pts = [0, 1, 2].map(() => ({ f: { pvFlow: 0.4 + rnd() * 1.4, ppg: 3 + rnd() * 15 } }));
    const L = planeLayout({ plane: pl, W, H: Math.round(W * 0.75), fs: 13, points: pts as never });
    for (const l of L.iso!.lines) { whole++; if (!/^R = /.test(l.label.text)) bare++; }
  }
  assert.ok(bare / whole < 0.05, `${bare} of ${whole} names are a bare number`);
});
