import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { wheelGesture, wheelFinger, sidewaysGesture, type WheelG } from '../src/ui/deck/wheel-swipe.ts';

const run = (events: [number, number, number][]) => {
  let g: WheelG | null = null; const acts: number[] = [];
  for (const [dx, dy, t] of events) { const [fx, fy] = wheelFinger(dx, dy); const r = wheelGesture(g, fx, fy, t); g = r.g; if (r.dir) acts.push(r.dir); }
  return acts;
};

describe('trackpad swipe between slides', () => {
  it('fingers left (natural scrolling: deltaX positive) go next, once', () => {
    const ev: [number, number, number][] = [];
    for (let i = 0; i < 60; i++) ev.push([Math.max(1, 30 - i), 1, i * 16]);   // swipe and its momentum tail
    assert.deepEqual(run(ev), [-1]);
  });
  it('fingers right go back', () => {
    const ev: [number, number, number][] = [];
    for (let i = 0; i < 30; i++) ev.push([-20, 0, i * 16]);
    assert.deepEqual(run(ev), [1]);
  });
  it('momentum that jitters never moves a second slide', () => {
    const ev: [number, number, number][] = [];
    for (let i = 0; i < 100; i++) ev.push([i < 8 ? 25 : (i % 2 ? 3 : -1), 0, i * 16]);
    assert.deepEqual(run(ev), [-1]);
  });
  it('a pause longer than the quiet gap starts a new gesture', () => {
    const a: [number, number, number][] = [[30, 0, 0], [30, 0, 16], [30, 0, 32]];
    const b: [number, number, number][] = [[30, 0, 600], [30, 0, 616], [30, 0, 632]];
    assert.deepEqual(run([...a, ...b]), [-1, -1]);
  });
  it('a vertical scroll never moves a slide and is not cancelled', () => {
    let g: WheelG | null = null; const acts: number[] = [];
    for (let i = 0; i < 40; i++) { const [fx, fy] = wheelFinger(2, 40, 0); const r = wheelGesture(g, fx, fy, i * 16); g = r.g; if (r.dir) acts.push(r.dir); assert.equal(sidewaysGesture(g, fx, fy), false); }
    assert.deepEqual(acts, []);
  });
  it('a sideways gesture is cancelled from its first event', () => {
    const [fx, fy] = wheelFinger(12, 1); const r = wheelGesture(null, fx, fy, 0);
    assert.equal(sidewaysGesture(r.g, fx, fy), true);
  });
  it('is wired into the slide surface and cancels only sideways wheel events', () => {
    assert.match(readFileSync(new URL('../src/ui/cards/CardLayer.tsx', import.meta.url), 'utf8'), /useDeckWheel\(goTo\)/);
    const hook = readFileSync(new URL('../src/ui/deck/useDeckWheel.ts', import.meta.url), 'utf8');
    assert.match(hook, /sidewaysGesture/); assert.match(hook, /e\.ctrlKey \|\| e\.metaKey\) return/);
  });
});
