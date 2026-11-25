// Capture 2a54261a, Where is the resistance 6 (Case 5), iPhone 440x736: the words card stood 250 px tall with 325 px of words, buttons and credit row, so the © ran through the buttons.
// Headless, software GL, 25 Nov, same size at normal speed: the card is 325 px (content 322, credit row at 704, buttons end at 644): not reproduced. This pins what the plan does with those numbers:
// the room is there (the plan gives the words 334 px under a 208 px instrument), so the short card of the capture was a card measured at 250, not a plan that refused it. The cause sits in the card's measure and lock.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planLayout } from '../src/ui/layout/plan.ts';

const vp = { w: 440, h: 736, safe: { top: 0, right: 0, bottom: 0, left: 0 } };
const plan = (wh: number, dh: number) => planLayout(vp, [{ id: 'teach', slot: 'words', h: wh }, { id: 'ladder', slot: 'data', h: dh }] as never);

test('the plan has room for Case 5\'s words (325 px) under the profile card (208 px) on an iPhone 440x736, and stands them at the foot as measured', () => {
  const p = plan(325, 208);
  assert.deepEqual(p.overflow, []);
  assert.ok(p.maxH.words >= 325, `the words may stand ${p.maxH.words} px`);
  const words = p.cards.find((c) => c.slot === 'words')!.rect;
  assert.equal(words.h, 325, 'the card is as tall as it measured');
  assert.equal(words.y + words.h, 728, 'and ends at the foot');
});

test('a card measured short is drawn short: the plan follows the measure (the capture\'s 250 px)', () => {
  assert.equal(plan(250, 202).cards.find((c) => c.slot === 'words')!.rect.h, 250);
});
