// A chart's box is exactly as tall as the picture drawn in it (Mohammad, 21 Nov: the "HVPG and ascites over the month" card cut the chart off at its foot: lower values, lines and the last point gone).
// Root: the 2D sheet gives the chart's wrapper a height of its own (`.pz-flowtime` max(60cqi, 15em)), 2D's SVG is drawn to that box; the 3D frame draws at its own height, so the card measured the box and clipped the picture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { flowTimeFit, flowTimeHeight, MEAL_LINES } from '../src/ui/charts/flowtime/model.ts';
import { flowTimeFrame } from '../src/ui/charts/flowtime/frame.ts';
import { flowTimeSeries } from '../src/ui/charts/flowtime/model.ts';
import { ctxOf } from './charts-helpers.ts';

const css = readFileSync(new URL('../src/ui/charts/charts.css', import.meta.url), 'utf8');

test('every chart wrapper that 2D gives a fixed height takes the height of its picture: the box is never shorter than its content', () => {
  const m = /:is\(([^)]+)\)\s*\{\s*height:\s*auto\s*!important;\s*min-height:\s*0\s*!important/.exec(css);
  assert.ok(m, 'charts.css gives the wrappers the height of their picture');
  for (const k of ['.pz-flowtime', '.pz-curve', '.pz-talk', '.pz-shift', '.pz-flows']) assert.ok(m![1]!.includes(k), `${k} is held to its picture`);
});

test('the flow-time chart is drawn no taller than the room its card leaves it, and a phone keeps 2D\'s one height', () => {
  for (const w of [260, 330, 420, 700]) for (const f of [12, 13, 15]) for (const keys of [MEAL_LINES, ['hvpg', 'asc']]) {
    const { min, preferred } = flowTimeHeight(w, f, keys, 0);
    assert.equal(flowTimeFit(w, f, keys, 0), preferred, 'no room, no cap: what it wants');
    assert.equal(flowTimeFit(w, f, keys, 0, preferred + 50), preferred, 'room to spare: what it wants');
    for (const room of [min, (min + preferred) / 2, preferred - 1]) assert.ok(flowTimeFit(w, f, keys, 0, room) <= room + 1e-9, `${w}/${f}: stands in ${room}`);
    assert.ok(flowTimeFit(w, f, keys, 0, min - 5) >= min, 'less than its words need: it keeps what they need (2D keeps its fit)');
    assert.ok(flowTimeFit(w, f, keys, 0, 0, 144) <= Math.max(min, 144) + 1e-9, 'a phone: 2D --ft-h');
    // the treatments' rows are added to the cap, as 2D's `.has-bands` adds --band-room
    assert.ok(flowTimeFit(w, f, keys, 3, 0, 144) <= Math.max(flowTimeHeight(w, f, keys, 3).min, 144 + 3 * f) + 1e-9);
  }
});

test('the frame takes the room and the cap: the height it draws at is the height the box gets', () => {
  const n = 61, trail = Array.from({ length: n }, (_, i) => { const t = i / (n - 1); return [30 * t, 10.3 - 8 * t, 2.3 - 1.4 * t]; });
  const ser = flowTimeSeries(trail, 'days', ['hvpg', 'asc'])!;
  assert.ok(ser);
  const c = ctxOf('light', 410, 'desktop'), want = flowTimeHeight(410, c.type.sm, ['hvpg', 'asc'], 0);
  const free = flowTimeFrame({ ser, clock: 'days', keys: ['hvpg', 'asc'], rx: [] }, ser.ax.end, c).frame;
  assert.equal(free.h, Math.round(want.preferred));
  const room = Math.round((want.min + want.preferred) / 2);
  const tight = flowTimeFrame({ ser, clock: 'days', keys: ['hvpg', 'asc'], rx: [], room }, ser.ax.end, c).frame;
  assert.equal(tight.h, room, 'the chart is drawn to the room, not past it');
  const phone = flowTimeFrame({ ser, clock: 'days', keys: ['hvpg', 'asc'], rx: [], cap: 144 }, ser.ax.end, c).frame;
  assert.equal(phone.h, Math.max(Math.round(want.min), 144));
});

test('FlowTimeCard hands the chart its room and a phone\'s height, and redraws when they change', () => {
  const src = readFileSync(new URL('../src/ui/charts/flowtime/FlowTimeCard.tsx', import.meta.url), 'utf8');
  assert.match(src, /useContext\(ToolRoom\)/);
  assert.match(src, /deps=\{\[ser, rx\.join\(\), height, room, cap\]\}/);
});
