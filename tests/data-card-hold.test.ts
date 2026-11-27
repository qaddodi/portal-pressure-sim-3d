// A data card whose content cannot go smaller (its fit is spent: a path's words are held at 12 px, so zooming it does not shorten it) keeps its content's height and the words page instead
// (Mohammad's rule: nothing is clipped; Variceal bleed 14, stress capture c0d955e1: 360 px of content in a box of 304, on an iPhone). The planner holds it on every screen the planner knows;
// a card that is not held is planned exactly as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planLayout } from '../src/ui/layout/plan.ts';

const SCREENS = [
  { n: 'iPhone', w: 390, h: 844, safe: { top: 0, bottom: 0, left: 0, right: 0 } },
  { n: 'iPhone 47/34', w: 390, h: 844, safe: { top: 47, bottom: 34, left: 0, right: 0 } },
  { n: 'iPhone 393', w: 393, h: 852, safe: { top: 59, bottom: 34, left: 0, right: 0 } },
  { n: 'iPad up', w: 820, h: 1180, safe: { top: 24, bottom: 20, left: 0, right: 0 } },
  { n: 'iPad side', w: 1180, h: 820, safe: { top: 24, bottom: 20, left: 0, right: 0 } },
  { n: 'Mac', w: 1440, h: 900, safe: { top: 0, bottom: 0, left: 0, right: 0 } },
  { n: 'Mac small', w: 1280, h: 720, safe: { top: 0, bottom: 0, left: 0, right: 0 } },
];
const plan = (vp: (typeof SCREENS)[number], wh: number, dh: number, hold: boolean) =>
  planLayout(vp as never, [{ id: 'teach', slot: 'words', h: wh }, { id: 'ladder', slot: 'data', h: dh, want: dh, hold }] as never, 'words', 0, false);

test('a held data card is boxed at its content whenever the words can keep 40% of the room, on every screen', () => {
  for (const vp of SCREENS) {
    if (vp.w > vp.h && vp.w < 900) continue;   // (a phone on its side bleeds the instrument by design)
    for (const wh of [260, 322, 400, 520]) for (const dh of [200, 304, 360, 420]) {
      const p = plan(vp, wh, dh, true), d = p.cards.find((c) => c.slot === 'data')!, w = p.cards.find((c) => c.slot === 'words')!;
      const at = `${vp.n} words ${wh} data ${dh}: data box ${d.rect.h}, words box ${w.rect.h}, maxH ${JSON.stringify(p.maxH)}`;
      const room = p.maxH.data + p.maxH.words;
      if (dh <= 0.5 * room) assert.ok(d.rect.h >= dh - 0.5, `a held card boxed under its content: ${at}`);
      assert.ok(w.rect.h >= 0.35 * room || w.rect.h >= wh - 0.5, `the words keep their share: ${at}`);
      assert.ok(d.rect.y + d.rect.h <= w.rect.y + 0.5 || d.rect.y >= w.rect.y + w.rect.h - 0.5, `the two cards stand on each other: ${at}`);
      if (w.rect.h + 0.5 < wh) assert.ok(p.overflow.includes('teach'), `the words are held short without saying so: ${at}`);
    }
  }
});

test('the variceal bleed 14 numbers on an iPhone: 360 px of content gets a box of 360, the words page', () => {
  const vp = SCREENS[0]!, before = plan(vp, 322, 360, false), held = plan(vp, 322, 360, true);
  assert.equal(before.cards.find((c) => c.slot === 'data')!.rect.h, 304);
  assert.equal(held.cards.find((c) => c.slot === 'data')!.rect.h, 360);
  assert.ok(held.overflow.includes('teach') && !held.overflow.includes('ladder'));
});

test('a card that is not held is planned as before (hold only ever gives the data card more)', () => {
  for (const vp of SCREENS) for (const wh of [260, 322, 520]) for (const dh of [200, 360, 420]) {
    const a = plan(vp, wh, dh, false), b = planLayout(vp as never, [{ id: 'teach', slot: 'words', h: wh }, { id: 'ladder', slot: 'data', h: dh, want: dh }] as never, 'words', 0, false);
    assert.deepEqual(a.cards, b.cards);
  }
});
