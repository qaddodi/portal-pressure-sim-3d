// Review a56feaf2, item 12 (landscape phone): the drawer (the strip of the card that is put away) stands along the screen's foot, and the copyright, which has the one place in the foot band,
// printed over its words. Root cause: the credit's fixed foot place knew nothing of the wallet's strip, which takes the whole foot row from the card's own left edge. The line now fades while a drawer or card
// stands on it (2D's credit.js rule: never on a bar, a card or a menu; with no free place it is hidden). Pure: footClear judges the boxes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { footCredit, footClear } from '../src/ui/shell/credit-foot.ts';
import { planLayout, type Need } from '../src/ui/layout/plan.ts';
import { isSideways, layoutOf, margin } from '../src/ui/layout/rules2d.ts';

const box = (r: { x: number; y: number; w: number; h: number }) => ({ l: r.x, t: r.y, r: r.x + r.w, b: r.y + r.h });
const SIDE = [
  { n: 'iPhone 13 side', w: 844, h: 390, safe: { top: 0, bottom: 21, left: 47, right: 47 } },
  { n: 'iPhone side', w: 852, h: 393, safe: { top: 0, bottom: 21, left: 59, right: 59 } },
  { n: 'iPhone SE side', w: 667, h: 375, safe: { top: 0, bottom: 0, left: 0, right: 0 } },
];
const needs: Need[] = [{ id: 'teach', slot: 'words', h: 150 }, { id: 'ladder', slot: 'data', h: 150 }];

test('a phone on its side: the instrument bleeding off the foot stands on the credit row (and the words\' card carries the line in its own foot), so the floating line is judged covered; the figure column is clear', () => {
  for (const s of SIDE) {
    assert.ok(isSideways(s.w, s.h), s.n);
    const lay = layoutOf(s.w, s.h), at = footCredit({ vw: s.w, vh: s.h, safe: s.safe, h: 16.8, margin: margin(s.w, s.h, lay) }), w = 212, h = 16.8;
    const both = planLayout({ w: s.w, h: s.h, safe: s.safe }, needs);
    assert.equal(both.strip, null, `${s.n}: no strip in the one-column layout`);
    assert.ok(!footClear(at, w, h, both.cards.map((c) => box(c.rect))), `${s.n}: the column covers the line`);
    assert.ok(footClear({ x: both.free.x + 4, y: at.y }, Math.min(w, both.free.w - 8), h, both.cards.map((c) => box(c.rect))), `${s.n}: the figure's column is clear of both cards`);
  }
});

test('footClear: touching or inside is covered, a gap is clear', () => {
  const at = { x: 10, y: 370 };
  assert.equal(footClear(at, 200, 16, [{ l: 150, t: 342, r: 670, b: 390 }]), false);
  assert.equal(footClear(at, 200, 16, [{ l: 300, t: 342, r: 670, b: 390 }]), true);
  assert.equal(footClear(at, 200, 16, [{ l: 150, t: 100, r: 670, b: 340 }]), true);
});

test('Credit.tsx asks it for a phone on its side and fades the line (covered), never pops it', () => {
  const src = readFileSync('src/ui/shell/Credit.tsx', 'utf8');
  assert.match(src, /isSideways\(vw, vh\) \? !document\.querySelector\('\.dk-card \.pz-cred'\) && footShown\(/);
  assert.match(src, /classList\.toggle\('covered', !clear\)/);
});
