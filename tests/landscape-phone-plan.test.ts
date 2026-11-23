// Landscape phone (Mohammad, 23 Nov: "Mock 1 yes", then "A + 1"): the story card and the instrument card stand in side columns on opposite sides, the figure between them; a swipe right tucks
// the instrument to a 30 px strip ("PRESSURES · HVPG 6.1"), a swipe left brings it back; the copyright stands in the words' card foot. Approved sheet: docs/approved/landscape-phone.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planLayout, type Need } from '../src/ui/layout/plan.ts';
import { isSideways, sideColW } from '../src/ui/layout/rules2d.ts';

const VPS = [
  { n: 'iPhone 17 Pro Max side', w: 932, h: 430, safe: { top: 0, right: 52, bottom: 21, left: 52 } },
  { n: 'iPhone 15 side', w: 852, h: 393, safe: { top: 0, right: 59, bottom: 21, left: 59 } },
  { n: 'iPhone 13 side', w: 844, h: 390, safe: { top: 0, right: 47, bottom: 21, left: 47 } },
  { n: 'iPhone SE side', w: 667, h: 375, safe: { top: 0, right: 0, bottom: 0, left: 0 } },
];
const needs: Need[] = [{ id: 'teach', slot: 'words', h: 260 }, { id: 'ladder', slot: 'data', h: 220 }];
const hit = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

for (const s of VPS) {
  test(`${s.n}: words left, instrument right, one column width, figure between, nothing on the pill`, () => {
    const vp = { w: s.w, h: s.h, safe: s.safe };
    assert.ok(isSideways(s.w, s.h));
    const p = planLayout(vp, needs);
    const [w, d] = [p.cards[0].rect, p.cards[1].rect];
    assert.equal(p.cards[0].id, 'teach'); assert.equal(p.cards[1].id, 'ladder');
    assert.equal(w.w, sideColW(s.w)); assert.equal(d.w, w.w);
    assert.ok(w.w >= 220 && w.w <= 260);
    assert.equal(w.x, Math.max(s.safe.left, 10)); assert.equal(d.x + d.w, s.w - Math.max(s.safe.right, 10));
    assert.equal(w.y, d.y); assert.equal(w.h, d.h);
    assert.ok(w.y + w.h <= s.h - s.safe.bottom + 0.5, 'above the home bar');
    assert.ok(p.free.x >= w.x + w.w && p.free.x + p.free.w <= d.x, 'the figure column is between the cards');
    assert.ok(p.free.w >= s.w * 0.25, `the figure keeps ${p.free.w}`);
    assert.ok(!hit(p.bar.rect, w) && !hit(p.bar.rect, d), 'the pill stands in the figure column');
    assert.deepEqual(p.overflow, []);
  });

  test(`${s.n}: tucked, the instrument is a 30 px strip at the edge and the pill and figure take its room`, () => {
    const vp = { w: s.w, h: s.h, safe: s.safe };
    const open = planLayout(vp, needs), t = planLayout(vp, needs, 'words', 0, true);
    assert.equal(t.docked, true); assert.equal(t.cards.length, 1);
    assert.equal(t.strip!.rect.w, 30);
    assert.ok(t.strip!.rect.x >= open.free.x + open.free.w, 'the strip stands beyond the figure column');
    assert.ok(t.strip!.rect.x + t.strip!.rect.w <= s.w - 10 + 0.5, 'on screen');
    assert.equal(t.tuckDx, t.strip!.rect.x - open.cards[1].rect.x);
    assert.ok(t.free.w > open.free.w + 100, 'the figure is wider');
    assert.ok(t.bar.rect.x > open.bar.rect.x, 'the pill follows the figure column to the right');
    assert.equal(t.sidePill, 'tucked'); assert.equal(open.sidePill, 'open');
  });
}

test('a slide with one card keeps it centred, with the pill beside it; no strip and nothing to tuck', () => {
  const vp = { w: 852, h: 393, safe: { top: 0, right: 59, bottom: 21, left: 59 } };
  const p = planLayout(vp, [needs[0]], 'words', 0, true);
  assert.equal(p.docked, false); assert.equal(p.strip, null); assert.equal(p.cards.length, 1);
  assert.ok(p.sidePill === 'alone' || p.sidePill === 'panel');
});

test('the swipe and the strip: x axis in dock.ts, the strip names the instrument, Strip.tsx is a swap only upright', () => {
  const dock = readFileSync('src/ui/cards/dock.ts', 'utf8'), strip = readFileSync('src/ui/wallet/Strip.tsx', 'utf8'), layer = readFileSync('src/ui/cards/CardLayer.tsx', 'utf8');
  assert.match(dock, /DockAxis/);
  assert.match(strip, /data-side/);
  assert.match(layer, /axis: ?plan\.sideways|axis.*'x'/);
});
