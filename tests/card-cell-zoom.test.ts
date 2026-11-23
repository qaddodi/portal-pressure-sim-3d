import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClock } from '../src/clock/frame.ts';
import { createCardZoom, zoomPlan, zoomMargin, zoomsOn } from '../src/ui/cards/card-zoom.ts';
import { centredBox, pzhOf } from '../src/ui/layout/plan.ts';
import { layoutOf, isSideways } from '../src/ui/layout/rules2d.ts';
import { RW_IDS, RW_LOADERS } from '../src/decks/rw/copied/index.ts';
import type { CopiedDeck } from '../src/decks/rw/types.ts';

// Plan 43 part B (Mohammad, 23 Nov: "I should be able to tap any one to zoom to center view like on Mac", the six ladders): one panel of the grid zooms alone, over its neighbours.
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const box = (left: number, top: number, width: number, height: number) => ({ left, top, width, height });
const attrs = () => { const a: Record<string, string> = {}; return { a, setAttribute: (n: string, v: string) => { a[n] = v; }, removeAttribute: (n: string) => { delete a[n]; } }; };
const stub = (b: ReturnType<typeof box>) => {
  const v: Record<string, string> = {};
  return { v, style: { setProperty: (n: string, x: string) => { v[n] = x; }, removeProperty: (n: string) => { delete v[n]; return ''; } }, getBoundingClientRect: () => b };
};
const world = () => {
  let t = 1000, cb: ((t: number) => void) | null = null;
  const clock = createClock({ raf: (f) => { cb = f; return 1; }, cancel: () => { cb = null; }, now: () => t });
  return { zoom: createCardZoom(clock), tick: (ms: number) => { t += ms; const f = cb; cb = null; f?.(t); } };
};

test('a panel opened writes data-zoomed on itself and data-cell-zoom on its card, moves nothing else, and end() takes both off', async () => {
  const { zoom, tick } = world();
  const cell = attrs(), card = attrs(), cs = stub(box(300, 100, 350, 300));
  const mark = { dataset: {} as Record<string, string | undefined> };
  assert.equal(zoom.open({ focus: [cs], others: [], area: box(0, 0, 1180, 746), layout: 'short', cell: { cell, card }, mark }), true);
  assert.deepEqual(cell.a, { 'data-zoomed': '' }); assert.deepEqual(card.a, { 'data-cell-zoom': '' });
  for (let i = 0; i < 12; i++) tick(50);
  assert.equal(cs.v.scale, '2.2000');
  const back = zoom.close();
  assert.deepEqual(card.a, { 'data-cell-zoom': 'back' }, 'the other panels come back up as it goes home');
  assert.deepEqual(cell.a, { 'data-zoomed': '' }, 'it stays over them until it is home');
  for (let i = 0; i < 12; i++) tick(50);
  await back;
  assert.deepEqual(cell.a, {}); assert.deepEqual(card.a, {}); assert.deepEqual(cs.v, {});
});

test('inside a zoomed grid (--pz-fit) the glide is written in the panel\'s own pixels', () => {
  const { zoom, tick } = world();
  const cs = stub(box(300, 100, 350, 300));
  zoom.open({ focus: [cs], others: [], area: box(0, 0, 1180, 746), layout: 'short', unit: 0.8, mark: null });
  assert.equal(cs.v['transform-origin'], `${(175 / 0.8).toFixed(2)}px ${(150 / 0.8).toFixed(2)}px`, 'the card\'s middle, in the panel\'s own pixels');
  for (let i = 0; i < 12; i++) tick(50);
  const p = zoomPlan(box(300, 100, 350, 300), box(0, 0, 1180, 746), zoomMargin(box(0, 0, 1180, 746), 'short'))!;
  assert.equal(cs.v.translate, `${(p.dx / 0.8).toFixed(2)}px ${(p.dy / 0.8).toFixed(2)}px`);
});

test('the tap: a panel is tried before the card, and the ladders card takes the tap where the zoom is offered', () => {
  const layer = src('src/ui/cards/CardLayer.tsx');
  const tap = layer.slice(layer.indexOf('const zoomTap'), layer.indexOf('const zoomButton'));
  assert.ok(tap.indexOf(".pz-cell") > 0 && tap.indexOf('zoomCell(') < tap.indexOf('zoomOpen(card)'), 'the panel comes first');
  assert.match(tap, /emptyTap\(e\.target, cell\)/);
  assert.match(layer, /zoomsOn\(plan\.layout, plan\.sideways\) && e\.phase === 'in' && \(zoomsHere \|\| view\.slide\?\.visual === 'ladders'\) \? zoomTap/);
  assert.match(layer, /cell: \{ cell, card \}/);
});

test('deck-ui.css lets the grown panel out of its card, stands it on an opaque surface and eases only opacity', () => {
  const css = src('src/ui/deck-ui.css');
  assert.match(css, /\.deck-ui \.dk-card\[data-cell-zoom\] \{ overflow: visible; clip-path: none; z-index: 3; \}/);
  assert.match(css, /\.deck-ui \.pz-cell\[data-zoomed\] \{ position: relative; z-index: 2; background: var\(--surface-2\);/);
  assert.match(css, /\.deck-ui \.dk-card\[data-cell-zoom=""\] \.pz-cell:not\(\[data-zoomed\]\) \{ opacity: \.35; transition: opacity var\(--d-zoom-in\) var\(--ease-arrive\); \}/);
  const rules = css.split('\n').filter((l) => /pz-cell(\[data-zoomed\]|:not)|dk-card\[data-cell-zoom/.test(l)).join('\n');
  for (const m of rules.matchAll(/transition:([^;]*);/g)) assert.match(m[1]!, /^\s*opacity /, 'only opacity eases');
});

// Every ladders slide of every deck, on the nine screens: the planned panel grows by at least 1.2 on every iPad and Mac size, and the tap is offered exactly where zoomsOn says.
const SCREENS = [
  { n: 'iPhone', w: 393, h: 852, safe: { top: 59, bottom: 34, left: 0, right: 0 } },
  { n: 'iPhone SE', w: 375, h: 667, safe: { top: 20, bottom: 0, left: 0, right: 0 } },
  { n: 'iPhone mini', w: 360, h: 640, safe: { top: 20, bottom: 0, left: 0, right: 0 } },
  { n: 'iPhone side', w: 852, h: 393, safe: { top: 0, bottom: 21, left: 59, right: 59 } },
  { n: 'iPhone SE side', w: 667, h: 375, safe: { top: 0, bottom: 0, left: 0, right: 0 } },
  { n: 'iPad up', w: 820, h: 1180, safe: { top: 24, bottom: 20, left: 0, right: 0 } },
  { n: 'iPad side', w: 1180, h: 820, safe: { top: 24, bottom: 20, left: 0, right: 0 } },
  { n: 'Mac', w: 1440, h: 900, safe: { top: 0, bottom: 0, left: 0, right: 0 } },
  { n: 'Mac small', w: 1280, h: 720, safe: { top: 0, bottom: 0, left: 0, right: 0 } },
  { n: 'iPad Safari', w: 1180, h: 746, safe: { top: 0, bottom: 0, left: 0, right: 0 } },
  { n: 'iPad mini', w: 1133, h: 744, safe: { top: 0, bottom: 0, left: 0, right: 0 } },
];
const decks: CopiedDeck[] = [];
for (const id of RW_IDS) decks.push((await RW_LOADERS[id]!()) as unknown as CopiedDeck);
test('every ladders slide: the tap is offered where zoomsOn says, and the panel grows at least 1.2 on every iPad and Mac size', () => {
  let ladders = 0;
  for (const d of decks) for (const sl of d.slides) {
    if (sl.visual !== 'ladders') continue;
    ladders++;
    for (const vp of SCREENS) {
      const layout = layoutOf(vp.w, vp.h), on = zoomsOn(layout, isSideways(vp.w, vp.h));
      assert.equal(on, !/iPhone|iPad up/.test(vp.n), `${vp.n}: zoomsOn`);
      if (!on) continue;
      // the panel's width and height, at most what the grid's 3-column, 2-row rule leaves a cell (the panel's padding and gaps, 2D's own formulas)
      const b = centredBox(vp, 'panel', 'ladders'), pzh = pzhOf(vp);
      const padX = Math.min(52, Math.max(20, 0.03 * vp.w)), padY = Math.min(44, Math.max(18, 3.4 * pzh)), gap = Math.min(26, Math.max(10, 2 * pzh));
      const cw = (b.w - 2 * padX - 2 * gap) / 3, ch = (b.maxH - 2 * padY - gap) / 2;
      const area = box(vp.safe.left, vp.safe.top, vp.w - vp.safe.left - vp.safe.right, vp.h - vp.safe.top - vp.safe.bottom);
      const p = zoomPlan(box(0, 0, cw, ch), area, zoomMargin(area, layout));
      assert.ok(p && p.s >= 1.2, `${d.id} ${vp.n}: panel ${Math.round(cw)}x${Math.round(ch)} grows ${p?.s}`);
    }
  }
  assert.ok(ladders >= 1, 'the decks have a ladders slide');
});
