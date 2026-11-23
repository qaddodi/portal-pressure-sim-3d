// Plan 43 Part A: a pair is judged by what its instrument WANTS, so the title steps before a chart is squeezed (2D's order). Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planLayout } from '../src/ui/layout/plan.ts';
import { pzhOf } from '../src/ui/layout/plan.ts';
import { layoutOf, isSideways } from '../src/ui/layout/rules2d.ts';
import { layoutHeight, layoutCeiling, fitToRoom, heldToRoom } from '../src/ui/charts/profile/model.ts';
import { heldPx } from '../src/ui/cards/card-want.ts';

const S = [
  { n: 'iPad side', w: 1180, h: 820, safe: { top: 24, bottom: 20, left: 0, right: 0 } },
  { n: 'iPad 11"', w: 1194, h: 834, safe: { top: 24, bottom: 20, left: 0, right: 0 } },
  { n: 'iPad 13"', w: 1366, h: 1024, safe: { top: 24, bottom: 20, left: 0, right: 0 } },
  { n: 'Mac', w: 1440, h: 900, safe: { top: 0, bottom: 0, left: 0, right: 0 } },
  { n: 'Mac small', w: 1280, h: 720, safe: { top: 0, bottom: 0, left: 0, right: 0 } },
  { n: '1024', w: 1024, h: 768, safe: { top: 0, bottom: 0, left: 0, right: 0 } },
];

test('plan.short: the data card\'s want is more than the card may be', () => {
  for (const vp of S) {
    const needs = (want: number) => [{ id: 'teach' as const, slot: 'words' as const, h: 400 }, { id: 'ladder' as const, slot: 'data' as const, h: 250, want }];
    const cap = planLayout(vp as never, needs(250), 'words').maxH.data;
    assert.ok(cap > 0, vp.n);
    assert.equal(planLayout(vp as never, needs(cap), 'words').short, false, `${vp.n}: wanting exactly the cap fits`);
    assert.equal(planLayout(vp as never, needs(cap + 20), 'words').short, true, `${vp.n}: wanting 20 px more than the cap is short`);
    assert.equal(planLayout(vp as never, [{ id: 'teach', slot: 'words', h: 400 }, { id: 'ladder', slot: 'data', h: 250 }], 'words').short, false, `${vp.n}: no want, no short`);
    assert.equal(planLayout(vp as never, [{ id: 'teach', slot: 'words', h: 400 }], 'words').short, false, 'words alone');
  }
});

test('a phone or an upright iPad judges its pair by the want too', () => {
  for (const vp of [{ n: 'iPhone', w: 393, h: 852, safe: { top: 59, bottom: 34, left: 0, right: 0 } }, { n: 'iPad up', w: 820, h: 1180, safe: { top: 24, bottom: 20, left: 0, right: 0 } }]) {
    const needs = (want: number) => [{ id: 'teach' as const, slot: 'words' as const, h: 300 }, { id: 'ladder' as const, slot: 'data' as const, h: 200, want }];
    const cap = planLayout(vp as never, needs(200), 'words').maxH.data;
    assert.equal(planLayout(vp as never, needs(cap), 'words').short, false, vp.n);
    assert.equal(planLayout(vp as never, needs(cap + 30), 'words').short, true, vp.n);
  }
});

test('a shorter words card only ever gives the data card more room (so each title step lowers what is held, and the ladder converges)', () => {
  for (const vp of S) {
    let prev = -Infinity;
    for (let wh = 900; wh >= 120; wh -= 30) {
      const cap = planLayout(vp as never, [{ id: 'teach', slot: 'words', h: wh }, { id: 'ladder', slot: 'data', h: 200, want: 300 }], 'words').maxH.data;
      assert.ok(cap >= prev, `${vp.n}: words ${wh} give ${cap} after ${prev}`);
      prev = cap;
    }
  }
});

test('the two slides of his photos (iPad 1180x820): after the title\'s step the chart has at least 225 px', () => {
  const vp = S[0]!, f = 12, pzh = pzhOf(vp as never), own = layoutHeight(392, f, layoutOf(vp.w, vp.h), isSideways(vp.w, vp.h), pzh)!;
  const PARTS = 90;   // (the data card's padding, "PRESSURE, GUT TO HEART" and the gap, measured)
  const chartAt = (wh: number) => {
    const cap = planLayout(vp as never, [{ id: 'teach', slot: 'words', h: wh }, { id: 'ladder', slot: 'data', h: 300, want: own + PARTS }], 'words').maxH.data;
    return fitToRoom(own, cap - PARTS, f, layoutCeiling('short', false, pzh, f))!;
  };
  assert.ok(own >= 215 && own <= 235, `the chart's own height on this screen (${own})`);
  for (const [name, before, after] of [['Right heart failure', 485, 418], ['Schistosomiasis', 437, 362]] as const) {
    assert.ok(chartAt(before) < own, `${name}: held today (${chartAt(before)})`);
    assert.ok(chartAt(after) >= 225, `${name}: ${chartAt(after)} after the title's step`);
  }
});

test('fitToRoom: held down to the room (never under 11 em), grown up to the ceiling with 2 px to spare, never past it', () => {
  const f = 12, own = 225, ceil = 309;
  assert.equal(fitToRoom(undefined, 300, f, ceil), undefined);
  assert.equal(fitToRoom(own, 0, f, ceil), own, 'no room measured');
  assert.equal(fitToRoom(own, 200.7, f, ceil), 200);
  assert.equal(fitToRoom(own, 60, f, ceil), 11 * f);
  assert.equal(fitToRoom(own, 226, f, ceil), own, 'a room that only just holds it');
  assert.equal(fitToRoom(own, 280, f, ceil), 278, 'room to spare: it takes the room less 2 px');
  assert.equal(fitToRoom(own, 900, f, ceil), ceil, 'never past 2D\'s own ceiling');
  assert.equal(fitToRoom(own, 900, f), own, 'no ceiling (a phone on its side, a stacked card): unchanged');
  for (let room = 0; room <= 600; room += 7) {
    const h = fitToRoom(own, room, f, ceil)!;
    assert.ok(h <= ceil || h === own, `${room}: ${h}`);
    assert.equal(h, room > 0 && room >= own ? h : heldToRoom(own, room, f), `${room}: held the way it was before`);
  }
  assert.equal(layoutCeiling('stack', false, 8, 12), undefined);
  assert.equal(layoutCeiling('short', true, 4, 12), undefined);
});

test('heldPx: how much taller a card would stand at its pictures\' wanted heights, in the card\'s own measure', () => {
  assert.equal(heldPx([]), 0);
  assert.equal(heldPx([{ want: 225, rectH: 164, fit: 1, scale: 1 }]), 61);
  assert.equal(heldPx([{ want: 225, rectH: 250, fit: 1, scale: 1 }]), 0, 'a chart taller than it wanted holds nothing');
  assert.equal(heldPx([{ want: 200, rectH: 150, fit: 0.8, scale: 1 }]), 10, 'under the card\'s fit the want is in screen px');
  assert.equal(heldPx([{ want: 200, rectH: 300, fit: 1, scale: 2 }]), 50, 'a card zoom is a transform: the rect is its multiple');
});

test('the wiring: the chart frames carry a want, the painter writes it, the card reports it, the plan judges by it', () => {
  const rd = (p: string) => readFileSync(p, 'utf8');
  for (const p of ['src/ui/charts/profile/ProfileCard.tsx', 'src/ui/charts/curve/frame.ts', 'src/ui/charts/curve/course-frame.ts', 'src/ui/charts/flowtime/frame.ts', 'src/ui/charts/plane/frame.ts']) assert.match(rd(p), /want/, p);
  assert.match(rd('src/ui/charts/painter.ts'), /dataset\.wantH/);
  assert.match(rd('src/ui/cards/CardFrame.tsx'), /onHeight\(entry\.key, Math\.round\(rect\.w\), h, h \+ heldBy\(el\)/);
  const cl = rd('src/ui/cards/CardLayer.tsx');
  assert.match(cl, /want: hit\(dataKey\)\?\.want/);
  assert.match(cl, /plan\.overflow\.length > 0 \|\| plan\.short/, 'the pair is over when its instrument was squeezed');
  assert.match(rd('src/ui/layout/plan.ts'), /short = !!data && \(data\.want \?\? 0\) > maxH\.data \+ 0\.5/);
});
