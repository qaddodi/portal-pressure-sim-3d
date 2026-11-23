import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClock } from '../src/clock/frame.ts';
import { createCardZoom, zoomKOf, onZoomK } from '../src/ui/cards/card-zoom.ts';
import { chartRatio } from '../src/ui/charts/gl.ts';

// Plan 43: a zoomed card is a CSS scale, so a chart canvas drawn at its box times the device ratio is stretched. It draws the zoomed size's pixels while the zoom is up.
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('chartRatio: the device ratio (capped at 2) times the zoom, never under the base, never a side over 4096', () => {
  assert.equal(chartRatio(2, 2.2, 405, 260), 4.4);
  assert.ok(Math.abs(chartRatio(2, 2.2, 1000, 300) - 4.096) < 1e-9);
  assert.equal(chartRatio(3, 1, 400, 300), 2);
  assert.equal(chartRatio(1, 1, 400, 300), 1);
  assert.equal(chartRatio(2, 0.5, 400, 300), 2, 'a factor under 1 never lowers it');
  assert.equal(chartRatio(2, 1, 3000, 300), 2, 'the base is the floor even where the cap is under it');
  // (a ladder's cell scales its chart down by --lad-k: the pixels on the glass are the box x ladK x zoom)
  assert.ok(Math.abs(chartRatio(2, 2.2, 100, 100, 0.8) - 3.52) < 1e-9);
  assert.equal(chartRatio(2, 1, 100, 100, 0.8), 2);
  assert.equal(chartRatio(2, 1, 100, 100, 1), 2);
});

const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });
const stub = (b: ReturnType<typeof box>, kids: unknown[] = []) => {
  const v: Record<string, string> = {};
  const e = { v, style: { setProperty: (n: string, x: string) => { v[n] = x; }, removeProperty: (n: string) => { delete v[n]; return ''; } }, getBoundingClientRect: () => b, contains: (n: unknown) => n === e || kids.includes(n) };
  return e;
};
const world = () => {
  let t = 1000, cb: ((t: number) => void) | null = null;
  const clock = createClock({ raf: (f) => { cb = f; return 1; }, cancel: () => { cb = null; }, now: () => t });
  return { zoom: createCardZoom(clock), tick: (ms: number) => { t += ms; const f = cb; cb = null; f?.(t); } };
};
const area = box(0, 0, 1180, 746);

test('the factor is the plan\'s from open() (before any frame) to the end of the glide home, 1 outside the cards, told twice per zoom', async () => {
  const { zoom, tick } = world();
  const child = {}, other = {}, outside = {};
  const focus = stub(box(40, 60, 405, 300), [child]), ride = stub(box(40, 380, 405, 300), [other]);
  const mark = { dataset: {} as Record<string, string | undefined> };
  let told = 0; const off = onZoomK(() => { told++; });
  assert.equal(zoomKOf(child as never), 1);
  assert.equal(zoom.open({ focus: [focus], others: [[ride]], area, layout: 'short', mark }), true);
  assert.equal(zoomKOf(child as never), 2.2, 'before the first frame');
  assert.equal(zoomKOf(other as never), 2.2, 'the card riding along');
  assert.equal(zoomKOf(outside as never), 1); assert.equal(told, 1);
  assert.equal(mark.dataset.cardZoom, '', 'gliding');
  for (let i = 0; i < 12; i++) tick(50);
  assert.equal(mark.dataset.cardZoom, 'up', 'the glide in has landed');
  const back = zoom.close();
  assert.equal(mark.dataset.cardZoom, 'back', 'gliding home (Plan 44: the slide pill comes back as it starts)');
  tick(100);
  assert.equal(zoomKOf(child as never), 2.2, 'still while it glides home');
  for (let i = 0; i < 12; i++) tick(50);
  await back;
  assert.equal(zoomKOf(child as never), 1); assert.equal(told, 2); assert.equal(mark.dataset.cardZoom, undefined);
  off();
});

test('a reduced-motion zoom is up at once; a card that would not grow tells nobody', () => {
  const { zoom } = world();
  const mark = { dataset: {} as Record<string, string | undefined> };
  let told = 0; const off = onZoomK(() => { told++; });
  assert.equal(zoom.open({ focus: [stub(box(0, 0, 1100, 700))], others: [], area, layout: 'short', mark }), false);
  assert.equal(told, 0);
  assert.equal(zoom.open({ focus: [stub(box(40, 60, 405, 300))], others: [], area, layout: 'short', mark, reduce: true }), true);
  assert.equal(mark.dataset.cardZoom, 'up'); assert.equal(told, 1);
  zoom.reset(); assert.equal(told, 2);
  off();
});

test('the charts are wired: the painter listens and lets go, the canvas ratio has one source, the panes take theirs from the painter', () => {
  const painter = src('src/ui/charts/painter.ts'), gl = src('src/ui/charts/gl.ts');
  assert.match(painter, /onZoomK\(/); assert.match(painter, /this\.offZoom\(\)/); assert.match(painter, /get ratio\(\)/);
  assert.match(gl, /chartRatio\(this\.dev, zoomKOf\(this\.canvas\)/);
  for (const f of ['src/ui/tests/doppler/DopplerPane.tsx', 'src/ui/tests/fibro/FibroPane.tsx']) {
    const t = src(f);
    assert.doesNotMatch(t, /devicePixelRatio/, f); assert.match(t, /painter\.current\?\.ratio/, f); assert.match(t, /onZoomK\(/, f);
  }
});

test('the Doppler box gives up its own layer while a zoom stands up', () => {
  assert.match(src('src/ui/css3d-over-2d.css'), /body\[data-card-zoom="up"\] \.pz-data \.pz-tool\[data-kind="doppler"\] \.dop-box \{ will-change: auto; \}/);
});

test('gestures: while a card is zoomed no drag follows a finger, a swipe of any kind puts the card back and the slide stays, a touch on the dimmed page is a swipe too', () => {
  const layer = src('src/ui/cards/CardLayer.tsx'), drag = src('src/ui/cards/useCardDrag.ts');
  assert.match(layer, /can: \(dx\) => !cardZoom\.on && /);
  assert.match(layer, /const goTo = \(m: Move\) => \{\n\s+if \(cardZoom\.on\) \{ void cardZoom\.close\(\{ reduce: reduceMotion\(\) \}\); return; \}/);
  assert.match(layer, /const zoomTap[\s\S]*?if \(cardZoom\.on\) \{ void cardZoom\.close/);
  assert.doesNotMatch(layer, /cardZoom\.up\)/);
  assert.match(drag, /veil: !!t\?\.closest\?\.\('\.pz-zveil'\)/); assert.match(drag, /g\.card \|\| g\.veil/);
});
