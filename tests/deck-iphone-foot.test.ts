// The iPhone's bottom card (Mohammad, 20 Nov): it reaches down to the screen's corner with the screen's own radius less its inset, the pill stands in its lower right corner,
// and a swipe that starts on a quick-check question (a button that fills the card) still moves the talk.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planLayout, barOf, footReserve, footRadius, screenRadius, CARD_INSET, PILL_W_PHONE, BAR_H_PHONE, PILL_CORNER, type Need } from '../src/ui/layout/plan.ts';

const S = (w: number, h: number, safe: [number, number, number, number]) => ({ vp: { w, h, safe: { top: safe[0], right: safe[1], bottom: safe[2], left: safe[3] } } });
const SCREENS = { 'iphone-portrait': S(393, 852, [59, 0, 34, 0]), 'ipad-portrait': S(820, 1180, [24, 0, 20, 0]), mac: S(1440, 900, [0, 0, 0, 0]) };
const needs: Need[] = [{ id: 'teach', slot: 'words', h: 230 }, { id: 'ladder', slot: 'data', h: 150 }];

test('an iPhone with a home bar: the words card ends CARD_INSET from the screen edge, its bottom corners are the screen\'s less that inset', () => {
  const { vp } = SCREENS['iphone-portrait'];
  assert.ok(vp.safe.bottom > 0);
  assert.equal(footReserve(vp), CARD_INSET);
  assert.equal(footRadius(vp), screenRadius(vp) - CARD_INSET);
  const w = planLayout(vp, needs).cards.find((c) => c.slot === 'words')!.rect;
  assert.equal(w.y + w.h, vp.h - CARD_INSET);
  const b = barOf(vp).rect;
  assert.equal(b.x + b.w, w.x + w.w - PILL_CORNER, 'the pill in the card\'s lower right corner');
  assert.equal(b.w, PILL_W_PHONE); assert.equal(b.h, BAR_H_PHONE);
  assert.equal(b.y + b.h, w.y + w.h - PILL_CORNER, 'the same inset below it'); assert.ok(b.y >= w.y, 'inside the card');
});

test('screens with no rounded bottom keep their margin and radius', () => {
  const ipad = SCREENS['ipad-portrait'].vp;
  assert.equal(footRadius(ipad), null);
  assert.equal(footReserve(ipad), Math.max(ipad.safe.bottom, 0) + 8);
  assert.equal(footRadius(SCREENS.mac.vp), null);
});

test('a press on a button can still become a swipe (the quick check\'s questions are buttons); a slider, a link and the strain button are their own', () => {
  const src = readFileSync(new URL('../src/ui/cards/useCardDrag.ts', import.meta.url), 'utf8');
  assert.match(src, /ownsTouch\(t\)/, 'a touch is judged by the one list of what stays a control\'s own');
  const own = readFileSync(new URL('../src/ui/cards/swipe-own.ts', import.meta.url), 'utf8').split('\n').find((l) => l.startsWith('export const OWN'))!;
  assert.ok(!/\bbutton\b/.test(own), own);
  assert.match(own, /\.pz-strain/); assert.match(own, /input/); assert.match(own, /\[role="dialog"\]/);
});
