import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planLayout, pairTop, type Need } from '../src/ui/layout/plan.ts';
import { margin, layoutOf } from '../src/ui/layout/rules2d.ts';

// Mohammad, 20 Nov (slide 6/11 of The portal circulation, Fluid Balance under the words): "i thought we always CENTER vertically both cards, upper margin = lower margin".
// 2D (presenter-ladders.js): the stacked pair, shorter than the screen, is centred top to bottom as ONE (equal room above and below, never closer than one margin to the top or the controls);
// a single card is centred the same way. Root cause: the planner started every wide pair at the top margin, so a short pair sat high with the leftover room all below it.
const S = (w: number, h: number, safe = [0, 0, 0, 0]) => ({ w, h, safe: { top: safe[0], right: safe[1], bottom: safe[2], left: safe[3] } });
const WIDE = { mac: S(1280, 800), 'mac-big': S(1440, 900), 'mac-tall': S(2000, 1247), 'ipad-landscape': S(1180, 820, [24, 0, 20, 0]) };
const pair = (words: number, data: number): Need[] => [{ id: 'teach', slot: 'words', h: words }, { id: 'ladder', slot: 'data', h: data }];
const group = (cards: { rect: { y: number; h: number } }[]) => ({ top: Math.min(...cards.map((c) => c.rect.y)), foot: Math.max(...cards.map((c) => c.rect.y + c.rect.h)) });

test('a wide pair shorter than the screen stands with the same room above and below (every size, every pair height)', () => {
  for (const [name, vp] of Object.entries(WIDE)) for (const [w, d] of [[200, 140], [260, 200], [330, 260], [180, 300], [120, 90]]) {
    const p = planLayout(vp, pair(w, d)), g = group(p.cards), above = g.top, below = vp.h - g.foot;
    assert.ok(Math.abs(above - below) <= 1, `${name} ${w}+${d}: above ${above}, below ${below}`);
    assert.ok(above >= margin(vp.w, vp.h, layoutOf(vp.w, vp.h)) - 0.5 || above >= 4, `${name}: never nearer than a margin when it fits`);
  }
});

test('one card on a wide screen (no instrument) is centred top to bottom too', () => {
  for (const [name, vp] of Object.entries(WIDE)) for (const h of [180, 320, 420]) {
    const p = planLayout(vp, [{ id: 'teach', slot: 'words', h }]), r = p.cards[0].rect;
    assert.ok(Math.abs(r.y - (vp.h - r.y - r.h)) <= 1, `${name} ${h}: ${r.y} above, ${vp.h - r.y - r.h} below`);
  }
  const p = planLayout(WIDE.mac, [{ id: 'ladder', slot: 'data', h: 300 }]), r = p.cards[0].rect;
  assert.ok(Math.abs(r.y - (800 - r.y - r.h)) <= 1, 'an instrument alone, too');
});

test('a card that grows or shrinks (a page, a chart arriving) recentres the pair: the margins stay equal at every height, so the move is one glide of the same rule', () => {
  const vp = WIDE.mac;
  let last = Infinity;
  for (let d = 120; d <= 360; d += 30) {
    const g = group(planLayout(vp, pair(240, d)).cards);
    assert.ok(Math.abs(g.top - (vp.h - g.foot)) <= 1, `data ${d}`);
    assert.ok(g.top <= last + 0.5, 'a taller pair rises, never sinks'); last = g.top;
  }
});

test('a pair too tall to centre keeps 2D\'s rule: at the top margin (rising into it a few px), never lower than the foot allows', () => {
  const vp = WIDE.mac, m = margin(vp.w, vp.h, layoutOf(vp.w, vp.h));
  const p = planLayout(vp, pair(420, 400)), g = group(p.cards);
  assert.equal(g.top, 4, 'rises into the top margin as far as 4 px (2D pairRise), the words page');
  assert.equal(pairTop(800, 790, 40, 760), 40);
  assert.equal(pairTop(800, 400, 40, 760), 200, 'the plain centre');
  assert.equal(pairTop(800, 400, 40, 500), 100, 'not past the pill\'s top (foot - total)');
});

test('the pair stays centred when the figure room is derived from it (the free rectangle never overlaps a card)', () => {
  for (const vp of Object.values(WIDE)) {
    const p = planLayout(vp, pair(260, 200));
    for (const c of p.cards) assert.ok(c.rect.x + c.rect.w <= p.free.x + 0.5 || c.rect.x >= p.free.x + p.free.w - 0.5 || c.rect.y + c.rect.h <= p.free.y + 0.5 || c.rect.y >= p.free.y + p.free.h - 0.5);
  }
});

test('an iPhone on its side: a single card is centred between the screen\'s 10 px edges; the pair is the wallet\'s (already centred by its own height)', () => {
  const vp = S(852, 393, [0, 59, 21, 59]);
  for (const h of [120, 200, 300]) {
    const r = planLayout(vp, [{ id: 'teach', slot: 'words', h }]).cards[0].rect;
    assert.ok(Math.abs(r.y - (vp.h - r.y - r.h)) <= 1, `${h}: ${r.y} above, ${vp.h - r.y - r.h} below`);
  }
  const r = planLayout(vp, [{ id: 'teach', slot: 'words', h: 390 }]).cards[0].rect;
  assert.equal(r.y, 12, 'one that fills the screen keeps the 12 px edge');
});
