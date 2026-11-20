import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClock } from '../src/clock/frame.ts';
import { createRail, throwAt, followOf, commitOf, speedOf, outDistance, RAIL_MS, STAGGER, PARALLAX, inDistance, type Styled } from '../src/ui/cards/rail.ts';

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
  const rail = createRail(clock);
  const tick = (ms: number) => { t += ms; const f = cb; cb = null; f?.(t); };
  return { rail, tick, now: () => t };
};
const xOf = (e: { v: Record<string, string> }) => parseFloat(/-?[\d.]+/.exec(e.v.transform ?? '')?.[0] ?? '0');

test('2D\'s curve and times: out is gone by 85% of its way, in whole by 40%, no overshoot', () => {
  assert.equal(RAIL_MS, 560); assert.equal(STAGGER, 40);
  assert.equal(throwAt('out', 0, { x: 0, o: 1 }, { x: -300, o: 0 }).o, 1);
  assert.ok(throwAt('out', 0.5, { x: 0, o: 1 }, { x: -300, o: 0 }).o < 0.05 || throwAt('out', 0.5, { x: 0, o: 1 }, { x: -300, o: 0 }).o <= 0.2);
  assert.equal(throwAt('in', 1, { x: 56, o: 0 }, { x: 0, o: 1 }).o, 1);
  for (let k = 0; k <= 1; k += 0.05) assert.ok(throwAt('in', k, { x: 56, o: 0 }, { x: 0, o: 1 }).x >= -1e-6, 'it never passes its place');
  assert.equal(outDistance(48, 600), 672, 'right edge and a gap: wholly out of sight'); assert.equal(inDistance(48, 1440), 1416, 'from a gap beyond the right edge');
});

test('forward the cards leave to the left and come in from the right; back is the other way', async () => {
  const { rail, tick } = world();
  const out = [el(), el()], inn = [el(), el()];
  rail.leave(out, { dir: 1, dist: 400 });
  rail.enter(inn, { dir: 1, dist: 1000 });
  assert.equal(xOf(inn[0]!), 1000, 'in from beyond the right edge');
  assert.equal(inn[0]!.v.opacity, '1', 'a slide, no fade in place');
  for (let i = 0; i < 12; i++) tick(16);
  assert.equal(xOf(inn[0]!), 1000, 'the new cards wait while any old card is still going out: none lies over another');
  assert.ok(xOf(out[0]!) < -100, 'out to the left');
  for (let i = 0; i < 80; i++) tick(16);
  assert.ok(xOf(out[0]!) <= -399, 'wholly out of sight');
  assert.equal(inn[0]!.v.transform, undefined, 'at rest the inline values are let go');
  const b = el(); rail.enter([b], { dir: -1, dist: 700 });
  assert.equal(xOf(b), -700, 'back: in from the left');
  const c = el(); rail.leave([c], { dir: -1, dist: 400 }); tick(16); tick(16);
  assert.ok(xOf(c) > 0, 'back: out to the right');
});

test('the data card comes in 40 ms behind the words', () => {
  const { rail, tick } = world();
  const w = [el()], d = [el()];
  rail.enter(w, { dir: 1, dist: 800, delay: 0, par: PARALLAX.words });
  rail.enter(d, { dir: 1, dist: 800, delay: STAGGER, par: PARALLAX.data });
  assert.equal(xOf(d[0]!), 800, 'on screen the same start (its offset is divided by its parallax, then scaled by it)');
  tick(16); tick(16);
  assert.ok(xOf(w[0]!) < 800, 'the first card has set off');
  assert.equal(xOf(d[0]!), 800, 'the second card is 40 ms behind the first, still at its start');
});

test('a card taken mid-way goes on from where it is, never from a jump; a second enter does not restart it', () => {
  const { rail, tick } = world();
  const a = [el()];
  rail.enter(a, { dir: 1, dist: 900 });
  tick(16); tick(16); tick(16);
  const mid = xOf(a[0]!);
  rail.enter(a, { dir: 1, dist: 900 });
  assert.equal(xOf(a[0]!), mid, 'not put back at its start');
  rail.leave(a, { dir: 1, dist: 400 });
  assert.equal(xOf(a[0]!), mid, 'the way out starts where the card stands');
});

test('the card is let in once: done runs on landing, and the clock sleeps after', () => {
  const { rail, tick } = world();
  let landed = 0; const a = [el()];
  rail.enter(a, { dir: 1, dist: 900, done: () => { landed++; } });
  for (let i = 0; i < 50; i++) tick(16);
  assert.equal(landed, 1); assert.equal(rail.busy, 0);
});

test('the finger drags the cards the whole way with a soft stop; a data card parts a little', () => {
  const f = followOf(-20, 393);
  assert.ok(f.x < -15 && f.x > -20, 'finger-true at first');
  assert.ok(Math.abs(followOf(-2000, 393).x) <= 118.0001, 'a soft stop');
  assert.ok(followOf(-300, 393).o < 1 && followOf(-300, 393).o >= 0.8);
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

// Mohammad, 20 Nov: "when i finish the slides, the whole thing goes black". 2D ends the talk on a Next past the last slide (presenter.js next(): `else stop()`), and
// 3D's quick check (2D has none) is veiled so softly that the figure the talk ended on stays in view.
test('a Next from the last stop, with no page left, ends the talk; the quick check keeps the figure in view', async () => {
  const { atEnd } = await import('../src/ui/ui-store.ts');
  const stops = [{ kind: 'title' }, { kind: 'check' }] as never;
  assert.equal(atEnd({ stops, pos: { stop: 1, beat: 0 }, page: 0, pageCount: 1 }), true);
  assert.equal(atEnd({ stops, pos: { stop: 1, beat: 0 }, page: 0, pageCount: 2 }), false, 'a page left to turn');
  assert.equal(atEnd({ stops, pos: { stop: 0, beat: 0 }, page: 0, pageCount: 1 }), false);
  const css = readFileSync(new URL('../src/ui/deck-ui.css', import.meta.url), 'utf8');
  assert.match(css, /\.pz-veil\.soft \{ opacity: 0\.5; \}/);
});

// Mohammad, 20 Nov, build 92aea6a: "new card appearing before old one going away ... old card disappearing in a weird glitchy way" (the old teaching card clipped to a
// short box, its title cut). For one render the card on its way out was still 'in' and was handed the NEW card's box, so its height glide clipped it.
test('only the card the plan is for takes its place, and a card going out is never clipped by a height glide', () => {
  const layer = readFileSync(new URL('../src/ui/cards/CardLayer.tsx', import.meta.url), 'utf8');
  const frame = readFileSync(new URL('../src/ui/cards/CardFrame.tsx', import.meta.url), 'utf8');
  assert.match(layer, /e\.phase === 'in' && e\.key === wantedKey/);
  assert.match(frame, /if \(out\) \{ anims\.current\.forEach\(\(a\) => a\.cancel\(\)\)/);
});

// The play-test thread (9836a7a, Mac): about a second with no frames after the press; the old card was "gone by the first frame after it". A move was timed from the
// moment it was asked for, so a stall ate it whole. Now it is timed by the frames it has had (a stalled frame counts 50 ms at most): the card stands where it was
// through the stall and the slide then plays out.
test('a stalled frame never eats a move: the old card is still in sight after a one second stall, and the slide then plays', () => {
  const { rail, tick } = world();
  const a = [el()];
  rail.leave(a, { dir: 1, dist: 600 });
  tick(1000);   // (a one second frame)
  assert.ok(xOf(a[0]!) > -100, 'still near where it was after the stall');
  for (let i = 0; i < 40; i++) tick(16);
  assert.ok(xOf(a[0]!) <= -599, 'then wholly out');
});

test('under Reduce Motion nothing travels but nothing pops: a fade of at least 240 ms', () => {
  const { rail, tick } = world();
  const a = [el()];
  rail.enter(a, { dir: 1, dist: 800, reduce: true });
  assert.equal(a[0]!.v.opacity, '0'); assert.equal(xOf(a[0]!), 0);
  tick(16); tick(16);
  assert.ok(parseFloat(a[0]!.v.opacity ?? '0') < 0.5, 'not in one frame');
});

// Mohammad (no Reduce Motion): the new card still "fades in place". The lifted 2D rule `.pz-shade.pz-card:not(.stack)` carries a 420 ms transition on transform and
// opacity, 120 ms delayed; each frame's inline write restarted it, so nothing moved until the writes stopped and then the card eased to its place.
test('a card moved by the rail has its CSS transition switched off while it moves, and given back at rest', () => {
  const { rail, tick } = world();
  const a = [el()];
  rail.enter(a, { dir: 1, dist: 900 });
  assert.equal(a[0]!.v.transition, 'none');
  tick(16); assert.equal(a[0]!.v.transition, 'none');
  for (let i = 0; i < 60; i++) tick(16);
  assert.equal(a[0]!.v.transition, undefined, 'the card\'s own transition is back at rest');
  assert.match(rail.log.join(' '), /in 900->0px 520ms/);
});
