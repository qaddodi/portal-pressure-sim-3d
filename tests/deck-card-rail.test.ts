import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClock } from '../src/clock/frame.ts';
import { createRail, throwAt, followOf, commitOf, speedOf, outDistance, RAIL_MS, THROW_IN, STAGGER, PARALLAX, type Styled } from '../src/ui/cards/rail.ts';

// Mohammad, 20 Nov: cards appeared one before the other and grew as they came in; the slide change should move the cards out of view (forward right to left, back
// left to right), the new ones come in from the other side, and on a phone the cards follow the finger. 2D's card-throw.js, kept, then refined.
const el = (): Styled & { v: Record<string, string> } => {
  const v: Record<string, string> = {};
  const style = { setProperty: (n: string, x: string) => { v[n] = x; }, removeProperty: (n: string) => { delete v[n]; return ''; }, get transform() { return v.transform ?? ''; }, get opacity() { return v.opacity ?? ''; } };
  return { style, v };
};
const world = () => {
  let t = 1000, cb: ((t: number) => void) | null = null;
  const clock = createClock({ raf: (f) => { cb = f; return 1; }, cancel: () => { cb = null; }, now: () => t });
  const rail = createRail(clock, () => t);
  const tick = (ms: number) => { t += ms; const f = cb; cb = null; f?.(t); };
  return { rail, tick, now: () => t };
};
const xOf = (e: { v: Record<string, string> }) => parseFloat(/-?[\d.]+/.exec(e.v.transform ?? '')?.[0] ?? '0');

test('2D\'s curve and times: out is gone by 85% of its way, in whole by 40%, no overshoot', () => {
  assert.equal(RAIL_MS, 560); assert.equal(THROW_IN, 56); assert.equal(STAGGER, 40);
  assert.equal(throwAt('out', 0, { x: 0, o: 1 }, { x: -300, o: 0 }).o, 1);
  assert.ok(throwAt('out', 0.5, { x: 0, o: 1 }, { x: -300, o: 0 }).o < 0.05 || throwAt('out', 0.5, { x: 0, o: 1 }, { x: -300, o: 0 }).o <= 0.2);
  assert.equal(throwAt('in', 1, { x: 56, o: 0 }, { x: 0, o: 1 }).o, 1);
  for (let k = 0; k <= 1; k += 0.05) assert.ok(throwAt('in', k, { x: 56, o: 0 }, { x: 0, o: 1 }).x >= -1e-6, 'it never passes its place');
  assert.equal(outDistance(400, 1440), 424); assert.equal(outDistance(400, 300), 300);
});

test('forward the cards leave to the left and come in from the right; back is the other way', async () => {
  const { rail, tick } = world();
  const out = [el(), el()], inn = [el(), el()];
  rail.leave(out, { dir: 1, dist: 400 });
  rail.enter(inn, { dir: 1 });
  assert.equal(xOf(inn[0]!), 56, 'in from the right');
  assert.equal(inn[0]!.v.opacity, '0');
  for (let i = 0; i < 40; i++) tick(16);
  assert.ok(xOf(out[0]!) < -300 || out[0]!.v.opacity === '0', 'out to the left');
  assert.equal(inn[0]!.v.transform, undefined, 'at rest the inline values are let go');
  const b = el(); rail.enter([b], { dir: -1 });
  assert.equal(xOf(b), -56, 'back: in from the left');
  const c = el(); rail.leave([c], { dir: -1, dist: 400 }); tick(16); tick(16);
  assert.ok(xOf(c) > 0, 'back: out to the right');
});

test('the data card comes in 40 ms behind the words and travels a little less far', () => {
  const { rail, tick } = world();
  const w = [el()], d = [el()];
  rail.enter(w, { dir: 1, delay: 0, par: PARALLAX.words });
  rail.enter(d, { dir: 1, delay: STAGGER, par: PARALLAX.data });
  assert.ok(Math.abs(xOf(d[0]!)) < Math.abs(xOf(w[0]!)), 'the parallax');
  tick(16); tick(16);
  assert.ok(parseFloat(w[0]!.v.opacity ?? '0') > parseFloat(d[0]!.v.opacity ?? '0'), 'the second card is behind the first');
});

test('a card taken mid-way goes on from where it is, never from a jump; a second enter does not restart it', () => {
  const { rail, tick } = world();
  const a = [el()];
  rail.enter(a, { dir: 1 });
  tick(16); tick(16); tick(16);
  const mid = xOf(a[0]!);
  rail.enter(a, { dir: 1 });
  assert.equal(xOf(a[0]!), mid, 'not put back at its start');
  rail.leave(a, { dir: 1, dist: 400 });
  assert.equal(xOf(a[0]!), mid, 'the way out starts where the card stands');
});

test('the card is let in once: done runs on landing, and the clock sleeps after', () => {
  const { rail, tick } = world();
  let landed = 0; const a = [el()];
  rail.enter(a, { dir: 1, done: () => { landed++; } });
  for (let i = 0; i < 50; i++) tick(16);
  assert.equal(landed, 1); assert.equal(rail.busy, 0);
});

test('the finger drags the cards the whole way with a soft stop; a data card parts a little', () => {
  const f = followOf(-20, 393);
  assert.ok(f.x < -15 && f.x > -20, 'finger-true at first');
  assert.ok(Math.abs(followOf(-2000, 393).x) <= 118.0001, 'a soft stop');
  assert.ok(followOf(-300, 393).o < 1 && followOf(-300, 393).o >= 0.5);
  const { rail } = world(); const w = [el()], d = [el()];
  rail.drag(w, -80, 0.8, PARALLAX.words); rail.drag(d, -80, 0.8, PARALLAX.data);
  assert.ok(Math.abs(xOf(d[0]!)) < Math.abs(xOf(w[0]!)));
  rail.leave(w, { dir: 1, dist: 400 });   // goes on from the finger
  assert.equal(xOf(w[0]!), -80);
});

test('a swipe commits on where its speed would carry it', () => {
  assert.equal(commitOf(-90, 5, -0.2), 'next');
  assert.equal(commitOf(90, 5, 0.2), 'back');
  assert.equal(commitOf(-40, 4, -0.7), 'next', 'a short quick flick goes on');
  assert.equal(commitOf(-40, 4, -0.05), null, 'a slow short drag springs back');
  assert.equal(commitOf(-100, 4, 0.8), null, 'a flick back the way it came cancels');
  assert.equal(commitOf(-90, 80, -0.5), null, 'mostly vertical is not a swipe');
  assert.ok(speedOf([[0, 0], [30, 50], [60, 100]]) > 0.5);
});

test('the cards come in together, whole: a card is let in only by the group\'s gate, and there is no CSS animation left on a card', () => {
  const frame = readFileSync(new URL('../src/ui/cards/CardFrame.tsx', import.meta.url), 'utf8');
  const layer = readFileSync(new URL('../src/ui/cards/CardLayer.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/ui/deck-ui.css', import.meta.url), 'utf8');
  assert.match(frame, /gate\.current/); assert.match(layer, /go=\{go\}/); assert.match(layer, /useFontsReady/);
  assert.doesNotMatch(css, /\.dk-card\[data-phase="in"\]\s*\{\s*animation/);
  assert.doesNotMatch(frame, /onAnimationEnd/);
});
