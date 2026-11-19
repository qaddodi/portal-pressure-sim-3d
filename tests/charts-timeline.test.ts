import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fmtClock as timelineClock } from '../src/ui/timeline/model.ts';
import { clockFrame } from '../src/ui/charts/timeline/frame.ts';
import { clockWords, clockLabel, jumpDayNum, easeOut3, dayWords, fmtClock, JUMP_MS } from '../src/ui/charts/timeline/model.ts';
import { timelineEntry } from '../src/ui/charts/timeline/entry.ts';
import { ctxOf, eachLook, judge } from './charts-helpers.ts';
import { paletteOf } from '../src/ui/charts/palette.ts';
import type { TextShape } from '../src/ui/charts/scene.ts';

test('two clocks: the first day in minutes and seconds, then a day count (the timeline dock\'s own fmtClock)', () => {
  assert.equal(fmtClock, timelineClock);
  assert.equal(clockWords({ t: 14, day: 0 }), '0:14');
  assert.equal(clockWords({ t: 74, day: 0 }), '1:14');
  assert.equal(clockWords({ t: 3725, day: 0 }), '1:02:05');
  assert.equal(clockWords({ t: 8.5e6, day: 142 }), 'Day 142');
});

test('a jump counts the days up on the 2D curve: the same day at the same share of the 900 ms, 2D ease-out and rounding', async () => {
  assert.equal(JUMP_MS, 900);
  for (const [d0, days, u] of [[0, 7, 0], [0, 7, 0.5], [142, 180, 0.4], [142, 180, 1], [30, 30, 0.1], [5, 180, 1.4], [5, 180, -1]] as const) {
    const uu = Math.min(1, Math.max(0, u));
    assert.equal(jumpDayNum(d0, days, u), Math.round(d0 + days * (1 - (1 - uu) ** 3)));
  }
  assert.equal(jumpDayNum(142, 180, 1), 322);
  assert.equal(jumpDayNum(142, 180, 0), 142);
  assert.ok(easeOut3(0.5) > 0.5, 'it starts fast and slows down');
  const days = Array.from({ length: 11 }, (_, i) => jumpDayNum(0, 180, i / 10));
  assert.deepEqual(days, [...days].sort((a, b) => a - b));
  assert.equal(clockWords({ t: 0, day: 142, jump: { from: 142, days: 180, u: 0.4 } }), dayWords(jumpDayNum(142, 180, 0.4)));
  assert.match(clockLabel({ t: 0, day: 142, jump: { from: 142, days: 180, u: 0.1 } }), /Jumping ahead to Day 322/);
  const f = '/home/claude/portal-pressure-simulator/src/ui/ease.js';
  if (existsSync(f)) { const two = await import(f); for (let u = 0; u <= 1; u += 0.125) assert.equal(easeOut3(u), two.easeOut3(u)); }
});

test('the frame is one line of words in the look small.day (the text-2 ink), anchored as the clock is, never under 12 px, in every look and width', () => {
  eachLook((look) => {
    for (const [w, d] of [[120, 'phone-portrait'], [330, 'desktop'], [430, 'tablet-portrait']] as const) {
      const c = ctxOf(look, w, d);
      for (const align of ['start', 'middle', 'end'] as const) {
        const f = clockFrame({ t: 74, day: 0, align, size: 12 }, c);
        const { words } = judge(f, look, { onCard: false });
        assert.equal(words.length, 1);
        paletteOf(look).tok('text-2').forEach((v, i) => assert.ok(Math.abs(words[0]!.color[i]! - v) < 1e-9));
        assert.equal(words[0]!.anchor, align);
        assert.equal((f.shapes[0] as TextShape).s, '1:14');
      }
      assert.ok(clockFrame({ t: 0, day: 0, size: 5 }, c).shapes.every((s) => s.k !== 'text' || s.size >= 12), 'a size under 12 is taken up to 12');
    }
  });
});

test('the specimens and the registry', () => {
  assert.equal(timelineEntry.status, 'done');
  assert.ok(timelineEntry.specimens.length >= 3);
});
