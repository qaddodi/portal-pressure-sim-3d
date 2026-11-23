// Landscape phone (Mohammad, 23 Nov: "yes, good. let's do it" to the one-column mock): the two cards stand in ONE column at the left, the words centred top to bottom and the instrument under them,
// bleeding off the foot; a swipe up slides both up until the instrument is centred and the words bleed off the top; a swipe down brings them back. Approved sheet: docs/approved/landscape-phone.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planLayout, columnOf, sideBox, PEEK, SIDE_GAP, type Need } from '../src/ui/layout/plan.ts';
import { isSideways, sideColW } from '../src/ui/layout/rules2d.ts';

const VPS = [
  { n: 'iPhone 17 Pro Max side', w: 932, h: 430, safe: { top: 0, right: 52, bottom: 21, left: 52 } },
  { n: 'iPhone 15 side', w: 852, h: 393, safe: { top: 0, right: 59, bottom: 21, left: 59 } },
  { n: 'iPhone 13 side', w: 844, h: 390, safe: { top: 0, right: 47, bottom: 21, left: 47 } },
  { n: 'iPhone SE side', w: 667, h: 375, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
];
const needs = (w = 240, d = 270): Need[] => [{ id: 'teach', slot: 'words', h: w }, { id: 'ladder', slot: 'data', h: d }];
type R = { x: number; y: number; w: number; h: number };
const hit = (a: R, b: R) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

for (const s of VPS) {
  const vp = { w: s.w, h: s.h, safe: s.safe };
  test(`${s.n}: one left column, the words centred, the instrument under it bleeding off the foot, the figure and the pill to the right`, () => {
    assert.ok(isSideways(s.w, s.h));
    const p = planLayout(vp, needs());
    const [w, d] = [p.cards[0].rect, p.cards[1].rect];
    assert.equal(p.cards[0].id, 'teach'); assert.equal(p.cards[1].id, 'ladder');
    assert.equal(w.w, sideColW(s.w)); assert.equal(d.w, w.w); assert.equal(d.x, w.x, 'one column');
    assert.equal(w.x, Math.max(s.safe.left, 10));
    assert.ok(Math.abs(w.y - (s.h - w.y - w.h)) <= 1, 'the words are centred top to bottom');
    assert.equal(d.y, w.y + w.h + SIDE_GAP, 'the instrument stands under them');
    assert.ok(d.y < s.h - PEEK + 0.5 && d.y > s.h - PEEK - 120, `a ${s.h - d.y} px peek shows`);
    assert.ok(d.y + d.h > s.h, 'and the rest bleeds off the foot');
    assert.equal(p.docked, false); assert.equal(p.strip, null); assert.equal(p.scrolled, false);
    assert.ok(p.free.x >= w.x + w.w && p.free.w >= s.w * 0.4, `the figure has the rest of the screen: ${JSON.stringify(p.free)}`);
    assert.ok(!hit(p.bar.rect, w) && !hit(p.bar.rect, d) && p.bar.rect.x >= w.x + w.w, 'the pill stands in the figure column');
    assert.ok(Math.abs(p.bar.rect.x + p.bar.rect.w / 2 - (sideBox(vp).figL + sideBox(vp).right) / 2) <= 1, 'centred in it');
    assert.deepEqual(p.overflow, []);
  });

  test(`${s.n}: scrolled, the instrument is the card in the middle and the words bleed off the top, the same rects slid up`, () => {
    const open = planLayout(vp, needs()), t = planLayout(vp, needs(), 'words', 0, true);
    assert.equal(t.scrolled, true); assert.equal(t.docked, false);
    assert.deepEqual(t.cards.map((c) => c.rect), open.cards.map((c) => c.rect), 'the rects are the same: both cards are slid by a translate');
    const d = t.cards[1].rect, w = t.cards[0].rect;
    assert.ok(t.scrollDy > 0);
    assert.ok(Math.abs((d.y - t.scrollDy) - (s.h - d.h - (d.y - t.scrollDy))) <= 1, 'the instrument is centred');
    assert.ok(w.y + w.h - t.scrollDy > 0 && w.y + w.h - t.scrollDy < s.h / 2, 'the words\' foot still peeks at the top');
    assert.deepEqual(t.free, open.free); assert.deepEqual(t.bar.rect, open.bar.rect);
  });
}

test('neither card is taller than leaves the other PEEK px showing, and a taller one pages', () => {
  const vp = { w: 852, h: 393, safe: { top: 0, right: 59, bottom: 21, left: 59 } };
  const b = sideBox(vp);
  assert.equal(b.maxH, 393 - 2 * (PEEK + SIDE_GAP));
  const p = planLayout(vp, needs(600, 600));
  assert.ok(p.cards.every((c) => c.rect.h <= b.maxH));
  assert.deepEqual(p.overflow.sort(), ['ladder', 'teach']);
  const c = columnOf(vp, b.maxH, b.maxH);
  assert.ok(vp.h - c.dataY >= PEEK - 0.5, 'a card at the cap still peeks');
});

test('a slide with one card keeps it at the left, centred, with the pill in the figure column; nothing to scroll', () => {
  const vp = { w: 852, h: 393, safe: { top: 0, right: 59, bottom: 21, left: 59 } };
  const p = planLayout(vp, [needs()[0]], 'words', 0, true);
  assert.equal(p.scrolled, false); assert.equal(p.scrollDy, 0); assert.equal(p.cards.length, 1);
  assert.ok(Math.abs(p.cards[0].rect.y - (vp.h - p.cards[0].rect.y - p.cards[0].rect.h)) <= 1);
});

test('the swipe moves both cards: dock.ts takes the words as well, Strip.tsx stays the portrait wallet\'s, CardLayer gives the card its lift', () => {
  const dock = readFileSync('src/ui/cards/dock.ts', 'utf8'), swipe = readFileSync('src/ui/cards/useDockSwipe.ts', 'utf8'), layer = readFileSync('src/ui/cards/CardLayer.tsx', 'utf8'), strip = readFileSync('src/ui/wallet/Strip.tsx', 'utf8');
  assert.match(dock, /also/);
  assert.match(swipe, /export function goColumn/);
  assert.match(layer, /column: plan\.sideways \? plan\.scrollDy : undefined/);
  assert.match(layer, /lift=\{plan\.scrolled \? plan\.scrollDy : undefined\}/);
  assert.doesNotMatch(strip, /data-side/);
});

test('every slide uses the column: a chart, an outline, a check or a case standing alone is the column\'s width at the left, centred, with the figure unveiled and the pill in its column', () => {
  const vp = { w: 852, h: 393, safe: { top: 0, right: 59, bottom: 21, left: 59 } };
  for (const id of ['visual', 'title', 'check', 'case'] as const) {
    const p = planLayout(vp, [{ id, slot: 'words', h: 200, visual: 'plane' }]);
    const r = p.cards[0].rect;
    assert.equal(r.w, sideColW(vp.w), id); assert.equal(r.x, 59, id);
    assert.ok(Math.abs(r.y - (vp.h - r.y - r.h)) <= 1, `${id} centred`);
    assert.ok(p.free.x >= r.x + r.w && p.free.w >= vp.w * 0.4, `${id} leaves the figure its room`);
    assert.ok(p.bar.rect.x >= r.x + r.w, `${id}: the pill stands in the figure column`);
    const tall = planLayout(vp, [{ id, slot: 'words', h: 900, visual: 'plane' }]);
    assert.deepEqual(tall.overflow, [id], `${id} too tall pages`);
  }
  const src = readFileSync('src/ui/cards/CardLayer.tsx', 'utf8');
  assert.match(src, /pz-veil\$\{plan\.sideways \? ''/, 'no veil beside the column');
});
