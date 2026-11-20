import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClock } from '../src/clock/frame.ts';
import { createCardZoom, zoomPlan, zoomMargin, reverseMs, ZOOM_MAX, ZOOM_MIN, ZOOM_MS, SHUT_MS } from '../src/ui/cards/card-zoom.ts';

// Mohammad, 20 Nov: "i can't zoom into the cards when i click on them". 2D's card-zoom.js: the tapped card to the middle, at most 2.2 times, the others riding along.
const area = { left: 0, top: 0, width: 1440, height: 900 };
const el = (box: { left: number; top: number; width: number; height: number }) => {
  const v: Record<string, string> = {};
  return { v, style: { setProperty: (n: string, x: string) => { v[n] = x; }, removeProperty: (n: string) => { delete v[n]; return ''; } }, getBoundingClientRect: () => box };
};
const world = () => {
  let t = 1000, cb: ((t: number) => void) | null = null;
  const clock = createClock({ raf: (f) => { cb = f; return 1; }, cancel: () => { cb = null; }, now: () => t });
  return { zoom: createCardZoom(clock, () => t), tick: (ms: number) => { t += ms; const f = cb; cb = null; f?.(t); } };
};

test('2D\'s numbers: at most 2.2 times, none under 1.2, a margin of a tenth of the short side between 72 and 110, the card centred', () => {
  assert.equal(ZOOM_MAX, 2.2); assert.equal(ZOOM_MIN, 1.2); assert.equal(ZOOM_MS, 520); assert.equal(SHUT_MS, 440);
  assert.equal(zoomMargin(area), 90);
  const p = zoomPlan({ left: 40, top: 60, width: 400, height: 300 }, area)!;
  assert.equal(p.s, 2.2);
  assert.equal(p.dx, 720 - 240); assert.equal(p.dy, 450 - 210);
  assert.equal(zoomPlan({ left: 0, top: 0, width: 1300, height: 800 }, area), null, 'a card already large is not zoomed');
  assert.equal(reverseMs(440, 1.1, 2.2), Math.round(440 * 0.35 > 440 * (0.1 / 1.2) ? 440 * 0.35 : 440 * (0.1 / 1.2)), 'a zoom shut early goes back in a short time');
});

test('the card and its neighbours glide on the one clock about the card\'s middle and are put back whole', async () => {
  const { zoom, tick } = world();
  const focus = [el({ left: 40, top: 60, width: 400, height: 300 })], other = [el({ left: 40, top: 380, width: 400, height: 300 })];
  const veil = { on: false, classList: { add() { veil.on = true; }, remove() { veil.on = false; } } };
  assert.equal(zoom.open({ focus, others: [other], area, veil, mark: null }), true);
  assert.equal(veil.on, true);
  assert.equal(focus[0]!.v['transform-origin'], '200.00px 150.00px');
  assert.equal(other[0]!.v['transform-origin'], '200.00px -170.00px', 'the same point on the screen');
  for (let i = 0; i < 12; i++) tick(50);
  assert.equal(focus[0]!.v.scale, '2.2000'); assert.equal(other[0]!.v.scale, '2.2000');
  assert.equal(zoom.up, true);
  const back = zoom.close();
  assert.equal(veil.on, false);
  for (let i = 0; i < 12; i++) tick(50);
  await back;
  assert.equal(zoom.on, false); assert.deepEqual(focus[0]!.v, {}); assert.deepEqual(other[0]!.v, {});
});

test('a slide change puts it back at once; a card that would not grow is not zoomed', () => {
  const { zoom, tick } = world();
  const c = [el({ left: 40, top: 60, width: 400, height: 300 })];
  assert.equal(zoom.open({ focus: c, others: [], area }), true); tick(100);
  zoom.reset();
  assert.equal(zoom.on, false); assert.deepEqual(c[0]!.v, {});
  assert.equal(zoom.open({ focus: [el({ left: 0, top: 0, width: 1400, height: 880 })], others: [], area }), false);
});

test('it is wired: a tap on the empty part of a card on a wide screen, Esc first closes it', () => {
  const layer = readFileSync(new URL('../src/ui/cards/CardLayer.tsx', import.meta.url), 'utf8');
  const input = readFileSync(new URL('../src/ui/deck/useDeckInput.ts', import.meta.url), 'utf8');
  assert.match(layer, /plan\.layout === 'wide'/); assert.match(layer, /emptyTap/); assert.match(layer, /cardZoom\.close\(\{ reduce: reduceMotion\(\) \}\); \}, \[wordsKey/, 'a slide change glides it back');
  assert.match(input, /cardZoom\.on\) void cardZoom\.close\(\)/);
});
