import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClock } from '../src/clock/frame.ts';
import { createDock, closedPx, shows, settleOf, translateAt, DOCK_MS } from '../src/ui/cards/dock.ts';
import { planLayout } from '../src/ui/layout/plan.ts';

// Mohammad, 20 Nov: on mobile "when I swipe up the instrument card doesn't move up slowly and hide except a little handle, then I can swipe anywhere down to open it". 2D's dock (presenter.js dockTouch):
// the card follows the finger, a flick (0.5 px/ms) or past half decides, it glides to its handle (GRIP 34) or back.
const el = () => { const v: Record<string, string> = {}; return { v, style: { setProperty: (n: string, x: string) => { v[n] = x; }, removeProperty: (n: string) => { delete v[n]; return ''; } } }; };
const world = () => {
  let t = 1000, cb: ((t: number) => void) | null = null;
  const clock = createClock({ raf: (f) => { cb = f; return 1; }, cancel: () => { cb = null; }, now: () => t });
  const dock = createDock(clock);
  return { dock, tick: (ms: number) => { t += ms; const f = cb; cb = null; f?.(t); } };
};

test('2D\'s numbers: the card goes all but its 34 px edge, its words fade over the last third, a flick or past half decides', () => {
  assert.equal(closedPx(300), 266);
  assert.equal(shows(0), 1); assert.equal(shows(1), 0); assert.ok(shows(0.9) > 0 && shows(0.9) < 1, 'the words fade over the last third');
  assert.equal(translateAt(1, 266), '0 -266.00px');
  assert.equal(settleOf(0.2, -0.6), 1, 'a quick flick up closes it, even from a short way');
  assert.equal(settleOf(0.9, 0.6), 0, 'a quick flick down opens it, even from nearly shut');
  assert.equal(settleOf(0.6, 0.1), 1); assert.equal(settleOf(0.4, -0.1), 0, 'slow: by how far it got');
});

test('the card follows the finger, then glides to where it was heading and lands', () => {
  const { dock, tick } = world();
  const pos = el(), inner = el();
  dock.begin({ pos, inner }, 266, 0);
  dock.move(-133, 0);   // (half way up)
  assert.equal(pos.v.translate, '0 -133.00px');
  dock.move(-250, 0);
  assert.ok(parseFloat(inner.v.opacity!) < 0.5, 'its words fade as it goes');
  dock.move(-133, 0);
  assert.equal(pos.v.transition, 'none', 'no CSS transition fights the finger');
  let done = 0;
  dock.glide(1, DOCK_MS, () => { done++; });
  tick(16); tick(16);
  assert.ok(Math.abs(parseFloat(pos.v.translate!.split(' ')[1]!)) > 133, 'on its way up from where the finger left it');
  for (let i = 0; i < 30; i++) tick(16);
  assert.equal(done, 1); assert.equal(pos.v.translate, '0 -266.00px'); assert.equal(inner.v.opacity, '0.000');
  // and back: a pull down lands open and leaves nothing written
  dock.begin({ pos, inner }, 266, 1);
  dock.glide(0, 380, () => { done++; });
  for (let i = 0; i < 40; i++) tick(16);
  assert.equal(done, 2); assert.equal(pos.v.translate, undefined); assert.equal(inner.v.opacity, undefined); assert.equal(pos.v.transition, undefined);
});

test('a stalled frame never throws the glide to its end', () => {
  const { dock, tick } = world();
  const pos = el(); dock.begin({ pos, inner: null }, 200, 0);
  dock.glide(1, DOCK_MS, () => undefined);
  tick(1000);
  assert.ok(parseFloat(pos.v.translate!.split(' ')[1]!) > -200, 'still on its way');
});

test('the plan keeps the docked card up where it was, and the layer slides it away; a push up anywhere is the dock\'s, not a wallet swap', () => {
  const phone = { w: 393, h: 852, safe: { top: 59, right: 0, bottom: 34, left: 0 } };
  const plan = planLayout(phone, [{ id: 'teach', slot: 'words', h: 260 }, { id: 'ladder', slot: 'data', h: 220 }], 'words', 0, true);
  assert.equal(plan.docked, true);
  assert.ok(plan.tucked && plan.tucked.h === 220, 'the card keeps its own place and size');
  assert.ok(!plan.cards.some((c) => c.slot === 'data'), 'the figure has the room it left');
  const layer = readFileSync(new URL('../src/ui/cards/CardLayer.tsx', import.meta.url), 'utf8');
  assert.match(layer, /useDockSwipe\(\{ enabled: dockable/);
  assert.doesNotMatch(layer, /setDocked\(true\); return; \}/, 'the old release-only dock is gone');
  const frame = readFileSync(new URL('../src/ui/cards/CardFrame.tsx', import.meta.url), 'utf8');
  assert.match(frame, /translate: `0 \$\{-closedPx\(rect\.h\)\}px`/);
});
