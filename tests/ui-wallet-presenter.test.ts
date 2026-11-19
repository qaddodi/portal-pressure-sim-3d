import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSwapSwipe, isTap, swap, walletStart, resetForSlide, stripLabel, other } from '../src/ui/wallet/wallet-machine.ts';
import { stopsOf, next, back, first, last, goto, viewAt, keyMove, swipeMove, apply, isLast, lastSlideShot, lastSlideScene } from '../src/ui/deck/presenter-machine.ts';
import { reconcile, drop } from '../src/ui/cards/stack.ts';
import { HVPG_DECK } from '../src/decks/hvpg.ts';

test('a vertical swipe, far or fast, swaps the wallet; a tap, a slow drag and a sideways swipe do not', () => {
  assert.ok(isSwapSwipe({ dx: 4, dy: -60, ms: 300 }));
  assert.ok(isSwapSwipe({ dx: 0, dy: 50, ms: 200 }));
  assert.ok(isSwapSwipe({ dx: 2, dy: -20, ms: 30 }), 'a short quick flick');
  assert.ok(!isSwapSwipe({ dx: 0, dy: -20, ms: 400 }), 'a short slow drag');
  assert.ok(!isSwapSwipe({ dx: 80, dy: -50, ms: 200 }), 'mostly sideways');
  assert.ok(isTap({ dx: 2, dy: 3, ms: 120 }) && !isTap({ dx: 40, dy: 0, ms: 100 }));
});

test('the wallet swaps and a new slide brings the words back without counting as a swap', () => {
  let w = walletStart();
  w = swap(w); assert.equal(w.active, 'data'); assert.equal(w.swaps, 1);
  w = resetForSlide(w); assert.equal(w.active, 'words'); assert.equal(w.swaps, 1);
  assert.equal(other('words'), 'data');
  assert.deepEqual(stripLabel('data', '11.6', 'x'), { lead: 'Pressures', rest: 'HVPG 11.6' });
  assert.deepEqual(stripLabel('words', null, 'The wedged pressure'), { lead: 'Slide', rest: 'The wedged pressure' });
});

const stops = stopsOf(HVPG_DECK);

test('the talk plays title, the 13 slides of the 2D deck (a case first where a slide has one), quick check', () => {
  assert.deepEqual(stops.map((s) => (s.kind === 'slide' ? s.slide.id : s.kind)), ['title', 'route', 'free', 'wedge', 'wedge-sinusoid', 'hvpg', 'presin', 'ppg', 'eus', 'eus-ladder', 'heart', 'bc', 'plane', 'summary', 'check']);
  const walk = [first()]; for (let p = first(), n = next(stops, p); n.stop !== p.stop || n.beat !== p.beat; p = n, n = next(stops, p)) walk.push(n);
  const beats = stops.flatMap((s, i) => Array.from({ length: s.kind === 'slide' ? s.beats : 1 }, (_, b) => `${i}.${b}`));
  assert.deepEqual(walk.map((p) => `${p.stop}.${p.beat}`), beats);
  assert.ok(beats.includes('1.1') && !beats.includes('2.1'), 'the route slide has a case beat, the free slide has none');
  assert.deepEqual(last(stops), { stop: 14, beat: 0 });
  assert.ok(isLast(stops, last(stops)));
  assert.deepEqual(next(stops, last(stops)), last(stops), 'Next at the end stays');
  assert.deepEqual(back(stops, first()), first(), 'Back at the start stays');
});

test('Back from the first beat of a slide lands on the last beat of the slide before', () => {
  assert.deepEqual(back(stops, { stop: 2, beat: 0 }), { stop: 1, beat: 1 });
  assert.deepEqual(back(stops, { stop: 1, beat: 1 }), { stop: 1, beat: 0 });
  assert.deepEqual(goto(stops, 99), { stop: 14, beat: 0 });
});

test('what is on screen: the case alone first, then words with the ladder where the slide has one', () => {
  const v = (stop: number, beat = 0) => viewAt(stops, { stop, beat });
  assert.deepEqual([v(0).words, v(0).data], ['title', null]);
  assert.deepEqual([v(1, 0).words, v(1, 0).data], ['case', null]);
  assert.deepEqual([v(1, 1).words, v(1, 1).data], ['teach', null], 'the route slide has no data card');
  assert.deepEqual([v(2).words, v(2).data, v(2).cath, v(2).shot], ['teach', 'ladder', 'free', 'free']);
  assert.deepEqual([v(5).words, v(5).data, v(5).cath], ['teach', 'ladder', 'result']);
  assert.deepEqual([v(14).words, v(14).data, v(14).shot], ['check', null, lastSlideScene(stops)?.shot ?? lastSlideShot(stops)], 'the figure stays where the result left it');
  assert.equal(v(3).number, 4); assert.equal(v(3).of, 15);
});

test('keys and swipes: forward, back, first, last; a sideways swipe moves the talk, a vertical one does not', () => {
  assert.equal(keyMove('ArrowRight'), 'next'); assert.equal(keyMove(' '), 'next'); assert.equal(keyMove(' ', true), 'back');
  assert.equal(keyMove('ArrowLeft'), 'back'); assert.equal(keyMove('Home'), 'first'); assert.equal(keyMove('End'), 'last'); assert.equal(keyMove('q'), null);
  assert.equal(swipeMove(-80, 5, 200), 'next'); assert.equal(swipeMove(80, -5, 200), 'back');
  assert.equal(swipeMove(10, 90, 200), null); assert.equal(swipeMove(-20, 0, 500), null); assert.equal(swipeMove(-30, 2, 40), 'next', 'a short flick');
  assert.deepEqual(apply(stops, { stop: 3, beat: 0 }, 'first'), first());
});

test('a card that comes and goes: the old one leaves as the new one comes in, and comes back if wanted again', () => {
  let e = reconcile([], { key: 'teach:free', id: 'teach' });
  assert.deepEqual(e.map((x) => x.phase), ['in']);
  assert.equal(reconcile(e, { key: 'teach:free', id: 'teach' }), e, 'the same card changes nothing');
  e = reconcile(e, { key: 'teach:wedge', id: 'teach' });
  assert.deepEqual(e.map((x) => `${x.key}:${x.phase}`), ['teach:free:out', 'teach:wedge:in']);
  e = reconcile(e, { key: 'teach:free', id: 'teach' });
  assert.deepEqual(e.map((x) => `${x.key}:${x.phase}`), ['teach:free:in', 'teach:wedge:out'], 'no second copy is mounted');
  e = drop(e, 'teach:wedge'); assert.equal(e.length, 1);
  assert.equal(drop(e, 'teach:free').length, 1, 'a card that is in is never dropped');
  e = reconcile(e, null); assert.deepEqual(e.map((x) => x.phase), ['out']);
});
