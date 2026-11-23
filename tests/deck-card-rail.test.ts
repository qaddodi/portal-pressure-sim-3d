import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClock } from '../src/clock/frame.ts';
import { createRail, throwAt, followOf, commitOf, speedOf, RAIL_MS, THROW_IN, THROW_OUT, FIRST_MS, OUT_DONE, STAGGER, PARALLAX, type Styled } from '../src/ui/cards/rail.ts';

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

test('2D\'s curve and times: out is gone by 80% of its time, in whole by 60%, fading smoothly (never a pop), no overshoot', () => {
  assert.equal(RAIL_MS, 560); assert.equal(THROW_IN, 56); assert.equal(STAGGER, 40);
  assert.equal(throwAt('out', 0, { x: 0, o: 1 }, { x: -300, o: 0 }).o, 1);
  assert.equal(throwAt('out', 0.8, { x: 0, o: 1 }, { x: -56, o: 0 }).o, 0);
  assert.equal(throwAt('in', 0.6, { x: 56, o: 0 }, { x: 0, o: 1 }).o, 1);
  for (const kind of ['in', 'out'] as const) { let last = kind === 'in' ? 0 : 1; for (let k = 0; k <= 1; k += 1 / 60) { const o = throwAt(kind, k, { x: 0, o: kind === 'in' ? 0 : 1 }, { x: 0, o: kind === 'in' ? 1 : 0 }).o; assert.ok(Math.abs(o - last) < 0.12, `${kind}: no frame at 60 fps jumps the opacity (${last} to ${o})`); last = o; } }
  assert.equal(throwAt('in', 1, { x: 56, o: 0 }, { x: 0, o: 1 }).o, 1);
  for (let k = 0; k <= 1; k += 0.05) assert.ok(throwAt('in', k, { x: 56, o: 0 }, { x: 0, o: 1 }).x >= -1e-6, 'it never passes its place');
  assert.equal(THROW_OUT, 56, 'a card leaves by a short slide, not off the screen');
});

test('forward the cards leave to the left and come in from the right; back is the other way', async () => {
  const { rail, tick } = world();
  const out = [el(), el()], inn = [el(), el()];
  rail.leave(out, { dir: 1, dist: 400 });
  rail.enter(inn, { dir: 1 });
  assert.equal(xOf(inn[0]!), 56, 'in from slightly right');
  assert.equal(inn[0]!.v.opacity, '0', 'fading in as it slides');
  for (let i = 0; i < 3; i++) tick(16);
  assert.equal(xOf(inn[0]!), 56, 'the new cards wait while any old card is still going out: none lies over another');
  assert.ok(xOf(out[0]!) < 0 && xOf(out[0]!) >= -THROW_OUT, 'out a little to the left, fading');
  assert.ok(parseFloat(out[0]!.v.opacity!) < 1, 'and fading out');
  for (let i = 0; i < 80; i++) tick(16);
  assert.ok(xOf(out[0]!) >= -THROW_OUT - 1e-6 && out[0]!.v.opacity === '0', 'gone: invisible after a short slide');
  assert.equal(inn[0]!.v.transform, undefined, 'at rest the inline values are let go');
  const b = el(); rail.enter([b], { dir: -1 });
  assert.equal(xOf(b), -56, 'back: in from the left');
  const c = el(); rail.leave([c], { dir: -1, dist: 400 }); tick(16); tick(16);
  assert.ok(xOf(c) > 0, 'back: out to the right');
});

test('the data card comes in 40 ms behind the words', () => {
  const { rail, tick } = world();
  const w = [el()], d = [el()];
  rail.enter(w, { dir: 1, delay: 0, par: PARALLAX.words });
  rail.enter(d, { dir: 1, delay: STAGGER, par: PARALLAX.data });
  assert.equal(xOf(d[0]!), 56, 'on screen the same start (its offset is divided by its parallax, then scaled by it)');
  tick(16); tick(16);
  assert.ok(xOf(w[0]!) < 56, 'the first card has set off');
  assert.equal(xOf(d[0]!), 56, 'the second card is 40 ms behind the first, still at its start');
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
  rail.leave(a, { dir: 1 });
  tick(1000);   // (a one second frame)
  assert.ok(a[0]!.v.opacity !== '0' && xOf(a[0]!) > -THROW_OUT, 'still in sight, near where it was, after the stall');
  for (let i = 0; i < 40; i++) tick(16);
  assert.ok(a[0]!.v.opacity === '0' && xOf(a[0]!) <= -THROW_OUT + 1e-6, 'then gone');
});

test('under Reduce Motion nothing travels but nothing pops: a fade of at least 240 ms', () => {
  const { rail, tick } = world();
  const a = [el()];
  rail.enter(a, { dir: 1, reduce: true });
  assert.equal(a[0]!.v.opacity, '0'); assert.equal(xOf(a[0]!), 0);
  tick(16); tick(16);
  assert.ok(parseFloat(a[0]!.v.opacity ?? '0') < 0.5, 'not in one frame');
});

// Mohammad (no Reduce Motion): the new card still "fades in place". The lifted 2D rule `.pz-shade.pz-card:not(.stack)` carries a 420 ms transition on transform and
// opacity, 120 ms delayed; each frame's inline write restarted it, so nothing moved until the writes stopped and then the card eased to its place.
test('a card moved by the rail has its CSS transition switched off while it moves, and given back at rest', () => {
  const { rail, tick } = world();
  const a = [el()];
  rail.enter(a, { dir: 1 });
  assert.equal(a[0]!.v.transition, 'none');
  tick(16); assert.equal(a[0]!.v.transition, 'none');
  for (let i = 0; i < 60; i++) tick(16);
  assert.equal(a[0]!.v.transition, undefined, 'the card\'s own transition is back at rest');
  assert.match(rail.log.join(' '), /in 56->0px 520ms/);
});

test('the first card of a talk fades in where it stands, rising a little, never popping in', () => {
  const { rail, tick } = world();
  const a = [el()];
  rail.enter(a, { dir: 1, fresh: true });
  assert.equal(a[0]!.v.opacity, '0');
  assert.equal(xOf(a[0]!), 0, 'no slide from a side');
  assert.match(a[0]!.v.transform!, /translateY\(14\.00px\)/, 'starts a little low');
  tick(16); tick(16); tick(16);
  assert.ok(parseFloat(a[0]!.v.opacity!) > 0 && parseFloat(a[0]!.v.opacity!) < 1, 'fading in');
  for (let i = 0; i < Math.ceil(FIRST_MS / 16) + 4; i++) tick(16);
  assert.equal(a[0]!.v.transform, undefined); assert.equal(rail.busy, 0);
});

// Mohammad, 20 Nov: "when the instrument card does not change, we should not be able to swipe it (it shouldn't swipe away and back in)". A data card the next slide keeps
// (the same key) stays put under a finger and on Next, and moves to its new place with the new cards, on their curve, after the old ones are gone.
test('the data card a slide keeps does not follow the finger, and glides with the swap on the rail\'s curve', () => {
  const layer = readFileSync(new URL('../src/ui/cards/CardLayer.tsx', import.meta.url), 'utf8');
  const drag = readFileSync(new URL('../src/ui/cards/useCardDrag.ts', import.meta.url), 'utf8');
  const frame = readFileSync(new URL('../src/ui/cards/CardFrame.tsx', import.meta.url), 'utf8');
  assert.match(layer, /keeps: \(dx\) => .*to\.key === dataKey/, 'the layer says whether the data card is kept by the slide a drag goes to');
  assert.match(drag, /filter\(\(c\) => !\(keep && c\.data\)\)/, 'a kept data card is left out of the drag');
  assert.match(frame, /transition: `transform \$\{IN_MS\}ms \$\{RAIL_CSS\} \$\{OUT_DONE\}ms`/, 'its move to a new place waits for the old cards to be gone, then runs as long as the new cards\' entrance');
  assert.equal(OUT_DONE, 272);
});

// Mohammad, 20 Nov: "the last question slide the card is not expanding as fast as the text" and "i should be able to swipe on last card to close and go back to the figure".
test('a card whose words grow is revealed in the measuring callback, and a swipe on the last card ends the talk through the rail', () => {
  const frame = readFileSync(new URL('../src/ui/cards/CardFrame.tsx', import.meta.url), 'utf8');
  assert.match(frame, /growNow\(h\); shrinkNow\(h\);\s*\n\s*onHeight\(/, 'the card grows before the frame is painted, not a React round trip later');
  const layer = readFileSync(new URL('../src/ui/cards/CardLayer.tsx', import.meta.url), 'utf8');
  assert.match(layer, /can: \(dx\) => !cardZoom\.on && \(pages > 1 \|\| \(dx < 0 && atEnd\(useUi\.getState\(\)\)\)/, 'a sideways drag is allowed on the last slide');
  assert.match(layer, /m === 'next' && atEnd\(useUi\.getState\(\)\)\) finishTalk\(\)/, 'a swipe on the last slide ends the talk');
  const fin = readFileSync(new URL('../src/ui/cards/finish.ts', import.meta.url), 'utf8');
  assert.match(fin, /stopTalk\(\)/, 'Finish ends the talk through the one exit');
  const talk = readFileSync(new URL('../src/ui/shell/talk.ts', import.meta.url), 'utf8');
  assert.match(talk, /rail\.leave\(/, 'the cards go out on the rail before the talk is let go');
});

test('a card the finger took far on keeps going the way it went: it never drifts back toward its end as it fades (the bounce)', () => {
  const { rail, tick } = world();
  const w = [el()], b = [el()];
  rail.drag(w, -120, 0.9, PARALLAX.words);            // the finger took it 120 px left (the soft stop is further than the 56 px a card leaves by)
  rail.leave(w, { dir: 1 });
  let last = xOf(w[0]!);
  assert.equal(last, -120, 'it goes on from the finger');
  for (let i = 0; i < 40; i++) { tick(16); const x = xOf(w[0]!); assert.ok(x <= last + 1e-6, `never back to the right (${last} then ${x})`); last = x; }
  assert.ok(last <= -120 - THROW_OUT * PARALLAX.words + 1e-6 || last <= -120 - THROW_OUT + 1, 'it ends a leave\'s distance past where the finger let go');
  // swiping back (to the right) is the same in the other direction
  rail.drag(b, 100, 0.9, PARALLAX.words); rail.leave(b, { dir: -1 });
  let lb = xOf(b[0]!); for (let i = 0; i < 40; i++) { tick(16); const x = xOf(b[0]!); assert.ok(x >= lb - 1e-6, 'never back to the left'); lb = x; }
  // a card that was not dragged leaves by its usual short slide
  const c = [el()]; rail.leave(c, { dir: 1 }); for (let i = 0; i < 40; i++) tick(16);
  assert.ok(xOf(c[0]!) >= -THROW_OUT - 1e-6);
});

test('a swipe that commits a slide change does not ease the leaving cards back first; one that does not (a page, a beat) does', () => {
  const drag = readFileSync(new URL('../src/ui/cards/useCardDrag.ts', import.meta.url), 'utf8');
  assert.match(drag, /const out = m \? opts\.current\.leaves\?\.\(m\) \?\? true : false;/);
  assert.match(drag, /if \(!m\) clock.after\(home, 0\);\s*else if \(!out\) clock.after\(home, 60\);/, 'only the cards that stay come back, and a leave that never came is the 900 ms net');
  const layer = readFileSync(new URL('../src/ui/cards/CardLayer.tsx', import.meta.url), 'utf8');
  assert.match(layer, /leaves: \(m\) =>/);
});
