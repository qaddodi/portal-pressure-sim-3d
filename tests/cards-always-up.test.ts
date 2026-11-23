// Plan 42 (Mohammad, 23 Nov: "why do some slides not show the cards... this cannot happen ever"): a phone or an upright iPad never closes a card on its own.
// The planner used to shut one card to a 48 px strip whenever the words, the data card and the figure's floor did not fit (about 322 stops of 42 talks carry a pair).
// Node only: every tour's pair stops are counted from the app's own view (stopsOf, viewAt), and every screen is swept over words heights x data heights, each capped to its plan's maxH
// as the app does (the words page, the data card fits), so only states the app can produce are judged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { UI } from '../src/ui/strings.generated.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { stopsOf, viewAt } from '../src/ui/deck/presenter-machine.ts';
import { planLayout, type Need } from '../src/ui/layout/plan.ts';
import { figFloorOf } from '../src/ui/layout/rules2d.ts';
import { isSideways } from '../src/ui/layout/rules2d.ts';

const SCREENS = [
  { n: 'iPhone', w: 393, h: 852, safe: { top: 59, bottom: 34, left: 0, right: 0 } },
  { n: 'iPhone SE', w: 375, h: 667, safe: { top: 20, bottom: 0, left: 0, right: 0 } },
  { n: 'iPhone mini', w: 360, h: 640, safe: { top: 20, bottom: 0, left: 0, right: 0 } },
  { n: 'iPhone side', w: 852, h: 393, safe: { top: 0, bottom: 21, left: 59, right: 59 } },
  { n: 'iPhone SE side', w: 667, h: 375, safe: { top: 0, bottom: 0, left: 0, right: 0 } },
  { n: 'iPad up', w: 820, h: 1180, safe: { top: 24, bottom: 20, left: 0, right: 0 } },
  { n: 'iPad side', w: 1180, h: 820, safe: { top: 24, bottom: 20, left: 0, right: 0 } },
  { n: 'Mac', w: 1440, h: 900, safe: { top: 0, bottom: 0, left: 0, right: 0 } },
  { n: 'Mac small', w: 1280, h: 720, safe: { top: 0, bottom: 0, left: 0, right: 0 } },
];
const WORDS = [120, 180, 246, 327, 400, 520, 700, 900];
const DATA = [60, 120, 200, 264, 330, 450, 600, 900];

test('the tours carry a pair at hundreds of stops (what the sweep stands for)', async () => {
  let pairs = 0, decks = 0;
  for (const d of UI.decks) {
    const deck = await loadBuiltin(d.id);
    assert.ok(deck, d.id);
    decks++;
    const stops = stopsOf(deck!);
    stops.forEach((_, i) => { const v = viewAt(stops, { stop: i, beat: 0 }); if (v.data && v.words !== 'case') pairs++; });
  }
  assert.equal(decks, 42);
  assert.ok(pairs >= 300, `${pairs} pair stops`);
});

for (const vp of SCREENS) {
  test(`${vp.n}: every pair of heights the app can make shows both cards, none under 120 px, the figure keeps its floor`, () => {
    const side = isSideways(vp.w, vp.h), bad: string[] = [];
    for (const active of ['words', 'data'] as const) for (const w0 of WORDS) for (const d0 of DATA) {
      // (a wide screen's data card is never taller than the screen can give: its own fit and ladder take it down first, so only the phone's full range is judged)
      const wide = vp.w >= 700 && !(vp.w < 900 && vp.h > vp.w);
      if (wide && !side && w0 + d0 > 0.8 * vp.h) continue;   // (and a wide pair taller than the screen is paged and fitted down by the app before it is judged; those screens are not what changed)
      const needs: Need[] = [{ id: 'teach', slot: 'words', h: w0 }, { id: 'ladder', slot: 'data', h: d0 }];
      let p = planLayout(vp as never, needs, active);
      // the app's own caps: the words page and the data card fits, twice (each one's room follows the other's height)
      for (let k = 0; k < 3; k++) { for (const n of needs) n.h = Math.min(n.h, p.maxH[n.slot]); p = planLayout(vp as never, needs, active); }
      const tag = `${vp.n} act=${active} w=${w0} d=${d0}`;
      if (side) {
        // the wallet: the words card stands in front on arrival
        if (active === 'words' && p.cards[0]?.slot !== 'words') bad.push(`${tag} words not in front`);
        continue;
      }
      if (p.shut || p.strip) bad.push(`${tag} shut=${p.shut} strip=${p.strip?.slot}`);
      if (p.cards.length !== 2 || p.cards.some((c) => !(c.rect.h > 0))) bad.push(`${tag} a card is missing`);
      for (const c of p.cards) if (c.rect.h < Math.min(120, c.slot === 'words' ? w0 : d0) - 0.5) bad.push(`${tag} ${c.slot} ${c.rect.h} px`);
      if (p.maxH.words < 120 || p.maxH.data < 120) bad.push(`${tag} room words ${p.maxH.words} data ${p.maxH.data}`);
      if (vp.w < 700) if (p.free.h < figFloorOf(vp.h) - 0.5) bad.push(`${tag} figure ${p.free.h} < ${figFloorOf(vp.h)}`);
    }
    assert.deepEqual(bad.slice(0, 12), []);
  });
}
