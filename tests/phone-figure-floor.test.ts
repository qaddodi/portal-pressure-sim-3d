// Capture 49141fb9 (Variceal bleed 14, TIPS complete 4): an untucked instrument card on a phone took the figure's room and left a speck.
// The figure keeps its floor (figFloorOf) whatever the two cards measure; the instrument and the words yield, and say so as an overflow.
import test from 'node:test';
import assert from 'node:assert/strict';
import { planLayout, CARD_GAP } from '../src/ui/layout/plan.ts';
import { figFloorOf } from '../src/ui/layout/rules2d.ts';

const screens = [
  { name: 'iPhone 390x844', vp: { w: 390, h: 844, safe: { top: 47, bottom: 34, left: 0, right: 0 } } },
  { name: 'iPhone SE 375x667', vp: { w: 375, h: 667, safe: { top: 20, bottom: 0, left: 0, right: 0 } } },
  { name: 'iPhone Max 440x956', vp: { w: 440, h: 956, safe: { top: 62, bottom: 34, left: 0, right: 0 } } },
  { name: 'iPad upright 820x1180', vp: { w: 820, h: 1180, safe: { top: 24, bottom: 20, left: 0, right: 0 } } },
];
const heights = [100, 250, 400, 560, 700, 945];

for (const { name, vp } of screens) {
  test(`${name}: the figure keeps its floor and the cards never touch, whatever they measure`, () => {
    for (const wh of heights) for (const dh of heights) {
      const p = planLayout(vp as never, [{ id: 'teach', slot: 'words', h: wh }, { id: 'table', slot: 'data', h: dh }] as never);
      const w = p.cards.find((c) => c.slot === 'words')!.rect, d = p.cards.find((c) => c.slot === 'data')!.rect;
      const gap = w.y - (d.y + d.h);
      assert.ok(gap >= figFloorOf(vp.h) + CARD_GAP - 1, `words ${wh}, data ${dh}: ${gap} px between the cards, the figure's floor is ${figFloorOf(vp.h)}`);
      assert.ok(p.free.h >= figFloorOf(vp.h) - 1, `words ${wh}, data ${dh}: the figure's room is ${p.free.h} px`);
      if (d.h < dh - 1) assert.ok(p.overflow.includes('table'), `words ${wh}, data ${dh}: a card held short says so`);
      if (w.h < wh - 1) assert.ok(p.overflow.includes('teach'), `words ${wh}, data ${dh}: a words card held short says so`);
    }
  });
}

test('a pair that fits is left as measured', () => {
  const { vp } = screens[0];
  const p = planLayout(vp as never, [{ id: 'teach', slot: 'words', h: 200 }, { id: 'table', slot: 'data', h: 250 }] as never);
  assert.equal(p.cards.find((c) => c.slot === 'data')!.rect.h, 250);
  assert.equal(p.cards.find((c) => c.slot === 'words')!.rect.h, 200);
});
