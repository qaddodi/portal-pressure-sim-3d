import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HVPG_DECK } from '../src/decks/hvpg.ts';
import { parseLine, plainLine } from '../src/ui/text/line.ts';
import { typeFor } from '../src/ui/layout/device.ts';
import { planLayout, widthOf, stepsFor, type CardId } from '../src/ui/layout/plan.ts';
import { cardPad, isSideways } from '../src/ui/layout/rules2d.ts';
import { sentences, pageOf } from '../src/ui/cards/pages.ts';

// No browser: a conservative estimate of each card's height from character counts (Inter ~0.54 em a character, Source Serif ~0.50 em, plus 8% for
// ragged wrapping). A card the estimate puts over its room is one the real layout could overflow, so it needs a page break (or the test is wrong).
const lines = (text: string, px: number, width: number, em: number) => Math.max(1, Math.ceil((text.length * px * em * 1.08) / width));
const SCREENS: Record<string, { w: number; h: number; safe: [number, number, number, number] }> = {
  mac: { w: 1280, h: 800, safe: [0, 0, 0, 0] },
  'ipad-portrait': { w: 820, h: 1180, safe: [24, 0, 20, 0] },
  'iphone-portrait': { w: 393, h: 852, safe: [59, 0, 34, 0] },
  'iphone-landscape': { w: 852, h: 393, safe: [0, 59, 21, 59] },
};

type Vp = Parameters<typeof widthOf>[0];
/** The estimate of one card at a width: `page` of `pages` for a card that splits by sentence. */
function estimate(id: CardId, slideIdx: number, vp: Vp, pair: boolean, step: number, pages = 1) {
  const t = typeFor(vp.w, vp.h);
  const pad = cardPad(vp.w, vp.h);
  const inner = widthOf(vp, pair, step) - 2 * pad.x - 2;
  const s = HVPG_DECK.slides[slideIdx];
  const para = (txt: string, px = t.body, lead = t.bodyLead) => lines(txt, px, inner, 0.54) * px * lead;
  // the longest page of a card split into `pages` (by sentence, evenly: pages.ts)
  const longest = (markup: string, plain: (m: string) => string) => { const list = sentences(markup); return Math.max(...Array.from({ length: Math.min(pages, list.length) }, (_, p) => plain(pageOf(list, pages, p).join(' ')).length)); };
  let h = 2 * pad.y + 2;
  if (id === 'teach') {
    const plain = (m: string) => plainLine(parseLine(m), () => 11.6);
    const chars = longest(s.line, plain);
    h += t.kicker + 10 + lines(s.title, t.slideTitle, inner, 0.5) * t.slideTitle * t.slideTitleLead + 2 + (s.eq ? 10 + t.body * 1.2 + 12 : 10) + lines('x'.repeat(chars), t.body, inner, 0.54) * t.body * t.bodyLead;
  } else if (id === 'case') h += t.kicker + 10 + lines('x'.repeat(longest(s.vignette!, (m) => m)), t.body, inner, 0.54) * t.body * t.bodyLead;
  else if (id === 'ladder') h += 14 + 10 + (s.ladder!.rows.length * (t.data * 1.3 + 7)) + (s.ladder!.result ? 12 + 10 + 30 : 0);
  else if (id === 'check') {
    const worst = HVPG_DECK.checks.map(([q, a]) => para(q) + para(a) + 10 + 10);
    h += t.kicker + 10 + t.slideTitle * 1.3 + 12 + t.kicker + 6 + Math.max(...worst) + 14 + 44;
  } else if (id === 'title') {
    const head = t.kicker + 28 + lines(HVPG_DECK.title, t.deckTitle, inner, 0.5) * t.deckTitle * t.deckTitleLead + para(HVPG_DECK.summary);
    const objectives = t.kicker + 10 + HVPG_DECK.objectives.reduce((n, o) => n + para(o, t.body, t.bodyLead) + 8, 0);
    h += pages === 1 ? head + 24 + objectives + 24 + 44 : Math.max(head + 24 + 44, objectives + 14 + 24 + 44);
  }
  return Math.ceil(h);
}

for (const [name, sc] of Object.entries(SCREENS)) {
  test(`${name}: every card fits the room its plan gives it (estimated), by a wider wallet column or one more page, never a smaller type`, () => {
    const vp = { w: sc.w, h: sc.h, safe: { top: sc.safe[0], right: sc.safe[1], bottom: sc.safe[2], left: sc.safe[3] } };
    const sideways = isSideways(vp.w, vp.h);
    const over: string[] = [];
    // a card fits when some wallet step (sideways pair) and some page count (it splits by sentence) holds it, as CardLayer widens and splits
    const fits = (id: CardId, idx: number, withData: boolean) => {
      const steps = stepsFor(vp, withData);
      const maxPages = id === 'title' ? 2 : id === 'teach' ? sentences(HVPG_DECK.slides[idx].line).length : id === 'case' ? sentences(HVPG_DECK.slides[idx].vignette!).length : 1;
      let last = '';
      for (let step = 0; step < steps; step++) {
        for (let pages = 1; pages <= maxPages; pages++) {
          const h = estimate(id, idx, vp, withData, step, pages);
          const other = withData ? estimate('ladder', idx, vp, true, step) : 0;
          const plan = planLayout(vp, [{ id, slot: 'words', h }, ...(withData ? [{ id: 'ladder' as CardId, slot: 'data' as const, h: other }] : [])], 'words', step);
          if (!plan.overflow.length) return;
          last = `${h}px > ${plan.maxH.words}px (step ${step}, ${pages} page${pages > 1 ? 's' : ''}${plan.shut ? ', data card closed' : ''})`;
        }
      }
      over.push(`${id}${id === 'teach' || id === 'case' ? ':' + HVPG_DECK.slides[idx].id : ''} ${last}${withData ? ' with its data card' : ''}`);
    };
    fits('title', 0, false); fits('check', 0, false);
    HVPG_DECK.slides.forEach((s, i) => { if (s.vignette) fits('case', i, false); fits('teach', i, !!s.ladder); });
    assert.deepEqual(over, [], `would need a smaller type or a page break the layer cannot make on ${name}`);
  });
}
