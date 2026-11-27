// History's panel beside the figure takes room like the Tests card and a case's stop card: the figure is panned into what it leaves and the names keep off it, and the list opens resting on a moment's top
// (Mac promotion pictures of history:<case>:timeline, 27 Nov 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sheetFree, sheetRoom, PANEL_AIR } from '../src/ui/history/room.ts';
import { caseRoom, type CaseCut } from '../src/ui/case/room.ts';
import { chromeBoxes } from '../src/scene/labels/chrome-claims.ts';
import { freeRoom } from '../src/ui/shell/room.ts';
import { restHistory } from '../src/ui/history/open-scroll.ts';
import { restOnRow } from '../src/ui/menu/open-scroll.ts';
import type { Rect } from '../src/ui/layout/device.ts';

const vpOf = (w: number, h: number) => ({ w, h, safe: { top: 0, right: 0, bottom: 0, left: 0 } });
// the panel as the stylesheet places it: 460 px wide (less two side pads) at the right, or the column at the left of a phone on its side
const SCREENS = [
  { name: 'mac 1440', vp: vpOf(1440, 900), d: 'desktop' as const, panel: { x: 1440 - 12 - 460, y: 68, w: 460, h: 780 } },
  { name: 'mac 1728', vp: vpOf(1728, 1117), d: 'desktop' as const, panel: { x: 1728 - 12 - 460, y: 68, w: 460, h: 990 } },
  { name: 'ipad on its side', vp: vpOf(1180, 820), d: 'desktop' as const, panel: { x: 1180 - 12 - 460, y: 68, w: 460, h: 700 } },
  { name: 'iphone on its side', vp: vpOf(844, 390), d: 'desktop' as const, panel: { x: 6, y: 60, w: 320, h: 320 } },
];

for (const sc of SCREENS) {
  test(`${sc.name}: the figure is centred in the room the panel leaves, never under it, and the names have the panel as a wall`, () => {
    const base = freeRoom(sc.vp, sc.d), p: Rect = sc.panel;
    const free = sheetFree(base, null, p), room = sheetRoom(base, null, p);
    assert.equal(room.w, base.w); assert.equal(room.h, base.h);   // (panned, never squeezed)
    assert.ok(free.w > 0);
    assert.ok(Math.abs(room.x + room.w / 2 - (free.x + free.w / 2)) < 0.5, 'centred in what the panel leaves');
    if (p.x > sc.vp.w / 2) assert.ok(free.x + free.w <= p.x - PANEL_AIR + 0.5, 'the free room ends before the panel');
    else assert.ok(free.x >= p.x + p.w + PANEL_AIR - 0.5, 'the free room starts after the panel');
    assert.ok(sheetRoom(base, null, null).x === base.x, 'no panel: the room itself');
    const boxes = chromeBoxes({ vp: sc.vp, d: sc.d, caseUp: false, cut: null, cardH: 0, tests: null, panel: p });
    assert.ok(boxes.some((b) => b.x0 === p.x && b.x1 === p.x + p.w && b.y0 === p.y), 'the panel is a box the names keep off');
  });
}

test('with the panel shut the room is the case room, for every cut (nothing else changes)', () => {
  const room = freeRoom(vpOf(1440, 900), 'desktop');
  for (const cut of [null, { kind: 'left', x: 412 }, { kind: 'foot', y: 560 }] as (CaseCut | null)[]) assert.deepEqual(sheetRoom(room, cut, null), caseRoom(room, cut));
});

test('the stop card at the left and the panel at the right: the figure is centred between them', () => {
  const room = freeRoom(vpOf(1440, 900), 'desktop'), cut: CaseCut = { kind: 'left', x: 412 };
  const f = sheetFree(room, cut, { x: 968, y: 68, w: 460, h: 780 });
  assert.equal(f.x, 420); assert.equal(f.x + f.w, 960);
});

test('the shell, the camera\'s cut and the names all read the panel', () => {
  assert.ok(/sheetRoom\(base, caseCut, panel\)/.test(readFileSync('src/ui/shell/Shell.tsx', 'utf8')));
  assert.ok(/liveSheetRoom/.test(readFileSync('src/ui/tests/room.ts', 'utf8')));
  assert.ok(/panel: useHistoryRoom\.getState\(\)\.rect/.test(readFileSync('src/ui/shell/chrome-claims-writer.ts', 'utf8')));
  assert.ok(/usePublishPanel\(\)/.test(readFileSync('src/ui/history/HistorySheet.tsx', 'utf8')));
});

// the list: moments of any heights, any moment opened on, any size of list
test('opened on any moment of any list the list rests on a moment top (never part-way through one), or where it was sent', () => {
  const lists = [[60, 140, 90, 200, 120], [200, 200, 200, 200], [90, 90, 90, 90, 90, 90, 90], [300, 80, 80, 80, 500, 80], [60]];
  for (const heights of lists) for (const H of [320, 460, 600]) {
    const heading = 56, tops: number[] = []; let y = 0;
    for (const h of heights) { tops.push(Math.max(0, y - heading)); y += h; }
    const total = y + 12, max = Math.max(0, total - H);
    for (let k = 0; k < heights.length; k++) {
      const asked = tops[k]!, stopped = Math.min(asked, max);
      const r = restHistory(stopped, asked, tops, max);
      if (asked <= max + 0.5) { assert.equal(r.top, stopped); assert.equal(r.room, 0); continue; }
      assert.ok(tops.some((t) => Math.abs(t - r.top) < 0.5) || r.top === stopped, `rests on a top (heights ${heights}, H ${H}, moment ${k})`);
      assert.ok(r.top <= max + r.room + 0.5, 'reachable with the room given');
    }
  }
});
test('the case that was cut: a list stopped part-way through a moment by its end moves to the next moment top and is given the room', () => {
  const tops = [0, 40, 180, 300, 480], max = 420;   // the last moment asked at 480, the list stopped at 420 (part-way through the one before)
  const r = restHistory(420, 480, tops, max);
  assert.equal(r.top, 480); assert.equal(r.room, 60);
  assert.deepEqual(restOnRow(420, tops, max), r);
});
test('the list opens through it', () => {
  const s = readFileSync('src/ui/history/HistoryList.tsx', 'utf8');
  assert.ok(/restOpenHistory\(scroller, list\.current, el\)/.test(s));
});
