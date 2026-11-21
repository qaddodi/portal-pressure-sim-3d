import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClock } from '../src/clock/frame.ts';
import { createDock, DOCK_MS, OPEN_MS } from '../src/ui/cards/dock.ts';
import { useUi } from '../src/ui/ui-store.ts';

// Audit 20 Nov PM 5.4: the figure reframed only after a dock push had landed (the plan was published on settle). 2D's dockTo calls layout() and then reframe(ms) as the glide starts,
// so the camera rides the card's own clock. The dock now says when a glide sets off, the card layer tells the store the room the card is going to, the scene link moves the camera there in the glide's time.
const el = () => ({ style: { setProperty: () => undefined, removeProperty: () => '' } });
const world = () => {
  let t = 1000, cb: ((t: number) => void) | null = null;
  const clock = createClock({ raf: (f) => { cb = f; return 1; }, cancel: () => { cb = null; }, now: () => t });
  return { dock: createDock(clock), tick: (ms: number) => { t += ms; const f = cb; cb = null; f?.(t); } };
};

test('a dock glide tells its listener where it goes and how long it takes, at the start, once', () => {
  const { dock, tick } = world();
  const told: [number, number][] = [];
  dock.onGlide = (to, ms) => { told.push([to, ms]); };
  dock.begin({ pos: el(), inner: null }, 266, 0);
  dock.move(-100, 0);
  dock.glide(1, DOCK_MS, () => undefined);
  assert.deepEqual(told, [[1, DOCK_MS]], 'told before the card has moved on');
  tick(16); tick(16);
  assert.equal(told.length, 1);
  dock.begin({ pos: el(), inner: null }, 266, 1);
  dock.glide(0, OPEN_MS, () => undefined);
  assert.deepEqual(told[1], [0, OPEN_MS]);
});

test('no glide, nothing told (already there, or reduced motion lands at once)', () => {
  const { dock } = world();
  let n = 0; dock.onGlide = () => { n++; };
  dock.begin({ pos: el(), inner: null }, 266, 0);
  dock.glide(0, DOCK_MS, () => undefined);
  dock.glide(1, DOCK_MS, () => undefined, true);
  assert.equal(n, 0);
});

test('the store keeps the room hint, and the scene link moves the camera to it in the glide\'s own time (the card\'s arrive curve)', () => {
  useUi.getState().hintRoom({ x: 0, y: 0, w: 390, h: 500 }, 300);
  assert.deepEqual(useUi.getState().roomHint, { free: { x: 0, y: 0, w: 390, h: 500 }, ms: 300 });
  const link = readFileSync('src/ui/deck/scene-link.ts', 'utf8');
  assert.match(link, /s\.roomHint; if \(h && h !== prev\.roomHint[^)]*\)[^;]*sceneApi\.setRoom\(h\.free, h\.ms, false, true, easeArrive\)/);
  assert.match(link, /stepped \|\| !sceneApi\.roomIs\(room\)/, 'the landing asks for nothing the glide already sent');
  assert.match(readFileSync('src/ui/cards/CardLayer.tsx', 'utf8'), /dock\.onGlide = \(to, ms\) => \{ const p = planFor\.current\(to === 1\); useUi\.getState\(\)\.hintRoom\(p\.free, ms\)/);
});
