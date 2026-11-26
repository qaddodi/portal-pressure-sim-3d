// The instrument card's box fits its content, on every screen the planner knows and for every height a card can measure (Mohammad's capture 2274649a, 26 Nov: the audit read instrument cards as shorter than their content).
// The sizing rule is one: a data card stands at the height it measured (its drawn content, card-boxes.ts), held down only to the room the plan has for it, and when it is held down the plan says so (`overflow`)
// so the layer fits or pages it instead of clipping it. This pins that rule for every size at once. What the capture showed was the audit's own reading (hidden chart table, clipped fluid), pinned in tests/capture-card-boxes.test.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planLayout } from '../src/ui/layout/plan.ts';

const SCREENS = [
  { n: 'iPhone', w: 390, h: 844, safe: { top: 47, bottom: 34, left: 0, right: 0 } },
  { n: 'iPhone 393', w: 393, h: 852, safe: { top: 59, bottom: 34, left: 0, right: 0 } },
  { n: 'iPhone SE', w: 375, h: 667, safe: { top: 20, bottom: 0, left: 0, right: 0 } },
  { n: 'iPhone side', w: 852, h: 393, safe: { top: 0, bottom: 21, left: 59, right: 59 } },
  { n: 'iPad up', w: 820, h: 1180, safe: { top: 24, bottom: 20, left: 0, right: 0 } },
  { n: 'iPad side', w: 1180, h: 820, safe: { top: 24, bottom: 20, left: 0, right: 0 } },
  { n: 'Mac', w: 1440, h: 900, safe: { top: 0, bottom: 0, left: 0, right: 0 } },
  { n: 'Mac small', w: 1280, h: 720, safe: { top: 0, bottom: 0, left: 0, right: 0 } },
];

test('a data card is never given a box shorter than its content without the plan saying it is held (overflow), on every screen', () => {
  for (const vp of SCREENS) for (const dh of [80, 120, 146, 189, 213, 250, 318, 400, 600]) for (const wh of [150, 249, 330, 520]) {
    const needs = [{ id: 'teach', slot: 'words', h: wh }, { id: 'ladder', slot: 'data', h: dh }] as never;
    const p = planLayout(vp as never, needs, 'words', 0, false);
    const d = p.cards.find((c) => c.slot === 'data');
    if (!d) continue;
    const at = `${vp.n}: data ${dh}, words ${wh}, box ${d.rect.h}, room ${p.maxH.data}`;
    if (p.sideways) continue;   // (a phone on its side bleeds the instrument off the foot by design)
    if (d.rect.h + 0.5 < dh) assert.ok(p.overflow.includes(d.id) || p.short, `a card boxed under its content with no word of it: ${at}`);
    else assert.ok(d.rect.h <= dh + 0.5, `a card boxed taller than its content: ${at}`);
  }
});

test('a data card alone in its room is its content\'s height, never the room\'s (the box is fitted to the content)', () => {
  for (const vp of SCREENS) {
    if (vp.w > vp.h && vp.w < 900) continue;
    const p = planLayout(vp as never, [{ id: 'ladder', slot: 'data', h: 150 }, { id: 'teach', slot: 'words', h: 200 }] as never, 'words', 0, false);
    const d = p.cards.find((c) => c.slot === 'data')!;
    assert.equal(d.rect.h, 150, `${vp.n}: ${d.rect.h}`);
  }
});
