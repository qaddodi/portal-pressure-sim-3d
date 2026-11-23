import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClock } from '../src/clock/frame.ts';
import { createCardZoom, zoomPlan, zoomMargin, zoomsOn, reverseMs, ZOOM_MAX, ZOOM_MIN, ZOOM_MS, SHUT_MS } from '../src/ui/cards/card-zoom.ts';
import { layoutOf, isSideways } from '../src/ui/layout/rules2d.ts';

// Mohammad, 20 Nov: "i can't zoom into the cards when i click on them". 2D's card-zoom.js: the tapped card to the middle, at most 2.2 times, the others riding along.
const area = { left: 0, top: 0, width: 1440, height: 900 };
const el = (box: { left: number; top: number; width: number; height: number }) => {
  const v: Record<string, string> = {};
  return { v, style: { setProperty: (n: string, x: string) => { v[n] = x; }, removeProperty: (n: string) => { delete v[n]; return ''; } }, getBoundingClientRect: () => box };
};
const world = () => {
  let t = 1000, cb: ((t: number) => void) | null = null;
  const clock = createClock({ raf: (f) => { cb = f; return 1; }, cancel: () => { cb = null; }, now: () => t });
  return { zoom: createCardZoom(clock), tick: (ms: number) => { t += ms; const f = cb; cb = null; f?.(t); } };
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

// Plan 44 (Mohammad, 23 Nov: "when we zoom hide the pill"): the pill must tell "going in" from "going home", so the mark says so.
test('body[data-card-zoom] is "" gliding in, "up" landed, "back" gliding home, and gone at rest; reset takes it off', async () => {
  const { zoom, tick } = world();
  const mark = { dataset: {} as Record<string, string | undefined> };
  const c = [el({ left: 40, top: 60, width: 400, height: 300 })];
  assert.equal(zoom.open({ focus: c, others: [], area, mark }), true);
  assert.equal(mark.dataset.cardZoom, '', 'gliding in');
  for (let i = 0; i < 12; i++) tick(50);
  assert.equal(mark.dataset.cardZoom, 'up', 'landed');
  const back = zoom.close();
  assert.equal(mark.dataset.cardZoom, 'back', 'the first call of close: the pill comes back as the card starts home');
  tick(50);
  assert.equal(mark.dataset.cardZoom, 'back', 'still gliding home');
  for (let i = 0; i < 12; i++) tick(50);
  await back;
  assert.equal(mark.dataset.cardZoom, undefined, 'at rest');
  assert.equal(zoom.open({ focus: c, others: [], area, mark }), true);
  tick(50);
  zoom.reset();
  assert.equal(mark.dataset.cardZoom, undefined, 'reset');
});

test('a slide change puts it back at once; a card that would not grow is not zoomed', () => {
  const { zoom, tick } = world();
  const c = [el({ left: 40, top: 60, width: 400, height: 300 })];
  assert.equal(zoom.open({ focus: c, others: [], area }), true); tick(100);
  zoom.reset();
  assert.equal(zoom.on, false); assert.deepEqual(c[0]!.v, {});
  assert.equal(zoom.open({ focus: [el({ left: 0, top: 0, width: 1400, height: 880 })], others: [], area }), false);
});

test('it is wired: a tap on the empty part of a card, Esc first closes it', () => {
  const layer = readFileSync(new URL('../src/ui/cards/CardLayer.tsx', import.meta.url), 'utf8');
  const input = readFileSync(new URL('../src/ui/deck/useDeckInput.ts', import.meta.url), 'utf8');
  assert.match(layer, /emptyTap/); assert.match(layer, /cardZoom\.close\(\{ reduce: reduceMotion\(\) \}\); \}, \[wordsKey/, 'a slide change glides it back');
  assert.match(input, /cardZoom\.on\) void cardZoom\.close\(\)/);
});

// Plan 43 (Mohammad, 23 Nov: "tap on cards and zoom on landscape iPad"): the gate named one layout, 'wide', and every iPad under 860 px tall is 'short'.
test('the zoom is offered by device: every landscape iPad and Mac window, not a phone, not an upright iPad', () => {
  const on = (w: number, h: number) => zoomsOn(layoutOf(w, h), isSideways(w, h));
  for (const [w, h] of [[1180, 820], [1180, 746], [1210, 834], [1133, 744], [1024, 768], [1366, 1024], [1440, 800], [1512, 945]]) assert.equal(on(w, h), true, `${w}x${h}`);
  for (const [w, h] of [[852, 393], [820, 1180], [393, 852], [375, 667]]) assert.equal(on(w, h), false, `${w}x${h}`);
  const layer = readFileSync(new URL('../src/ui/cards/CardLayer.tsx', import.meta.url), 'utf8');
  assert.match(layer, /const zoomsHere = zoomsOn\(plan\.layout, plan\.sideways\)/);
  assert.doesNotMatch(layer, /plan\.layout === 'wide'/);
});

test('the room on a short screen is 32 px, and a card that was too tall for 2D\'s margin now grows; a wide screen keeps 2D\'s', () => {
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const safari = { left: 0, top: 0, width: 1180, height: 746 };
  assert.equal(zoomMargin(safari, 'short'), 32); assert.equal(zoomMargin(area, 'wide'), 90); assert.equal(zoomMargin(area), 90);
  assert.equal(r2(zoomPlan({ left: 0, top: 0, width: 405, height: 500 }, safari, 32)!.s), 1.36);
  assert.equal(r2(zoomPlan({ left: 0, top: 0, width: 405, height: 300 }, safari, 32)!.s), 2.2);
  assert.equal(zoomPlan({ left: 0, top: 0, width: 405, height: 600 }, safari, 32), null, 'a card of 600 px fills the height already');
  // the iPad app 1180x820 inside its safe areas (24 / 20): 776 px of height
  const app = { left: 0, top: 24, width: 1180, height: 776 };
  assert.equal(r2(zoomPlan({ left: 0, top: 0, width: 445, height: 560 }, app, 32)!.s), 1.27);
  assert.equal(zoomPlan({ left: 0, top: 0, width: 405, height: 500 }, safari, zoomMargin(safari, 'wide')), null, '2D\'s margin (75 px) left a 500 px card under 1.2: the tap did nothing');
});
