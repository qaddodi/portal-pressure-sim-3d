import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lazyDecks, loadBuiltin, builtinDeck } from '../src/decks/registry.ts';
import { parseLine, plainLine } from '../src/ui/text/line.ts';
import { typeFor } from '../src/ui/layout/device.ts';
import { planLayout, widthOf, stepsFor, credRow, CRED_ROW, type CardId } from '../src/ui/layout/plan.ts';
import { cardPad } from '../src/ui/layout/rules2d.ts';
import { sentences, pageOf } from '../src/ui/cards/pages.ts';

// Capture af1c51a0: an upright iPad's words card now carries the © in a foot row (CRED_ROW under the pill), so every words card is CRED_ROW taller. No browser: the same conservative character-count estimate
// as ui-fit-estimate.test.ts (that one holds the HVPG talk), here for EVERY slide of EVERY talk on the iPad, with the row and without it.
const lines = (text: string, px: number, width: number, em: number) => Math.max(1, Math.ceil((text.length * px * em * 1.08) / width));
const vp = { w: 820, h: 1180, safe: { top: 24, right: 0, bottom: 20, left: 0 } };
const t = typeFor(vp.w, vp.h), pad = cardPad(vp.w, vp.h);
type S = { id: string; title: string; line: string; eq?: unknown; ladder?: unknown; tool?: unknown; table?: unknown; visual?: string };
const plain = (m: string) => plainLine(parseLine(m), () => 11.6);

function words(s: S, step: number, pages: number, trim: boolean, row: number): number {
  const inner = widthOf(vp, !!(s.ladder || s.tool || s.table), step) - 2 * pad.x - 2;
  const list = sentences(s.line);
  const chars = Math.max(...Array.from({ length: Math.min(pages, list.length) }, (_, p) => plain(pageOf(list, pages, p).join(' ')).length));
  const ts = trim ? t.slideTitleTrim : t.slideTitle;
  return Math.ceil(2 * pad.y + 2 + (pages > 1 ? t.kicker + 10 : 0) + lines(s.title, ts, inner, 0.5) * ts * t.slideTitleLead + 2 + (s.eq ? 10 + t.body * 1.2 + 12 : 10) + lines('x'.repeat(chars), t.body, inner, 0.54) * t.body * t.bodyLead + 50 + row);
}
/** The fewest pages a slide's words card needs (at some wallet step), or 0 when none fits. */
function pagesNeeded(s: S, row: number): number {
  const withData = !!(s.ladder || s.tool || s.table);
  const maxPages = Math.max(1, sentences(s.line).length);
  const steps = stepsFor(vp, withData);
  for (let pages = 1; pages <= maxPages; pages++) {
    for (let step = 0; step < steps + 1; step++) {
      const nS = steps, trim = step >= nS, w = Math.min(step, nS - 1);
      const h = words(s, w, pages, trim, row);
      const needs = [{ id: 'teach' as CardId, slot: 'words' as const, h }, ...(withData ? [{ id: 'ladder' as CardId, slot: 'data' as const, h: 240 }] : [])];
      if (!planLayout(vp, needs, 'words', w).overflow.length) return pages;
    }
  }
  return 0;
}

test('every slide of every talk on an upright iPad: the words card with its © row fits, splitting by sentence where it must, never a smaller type', async () => {
  assert.equal(credRow(vp), CRED_ROW);
  const ids = ['hvpg', ...lazyDecks().map((d) => d.id)];
  const misfit: string[] = [], extra: string[] = [];
  let slides = 0, never = 0;
  for (const id of ids) {
    const deck = id === 'hvpg' ? builtinDeck(id) : await loadBuiltin(id);
    for (const s of (deck?.slides ?? []) as unknown as S[]) {
      if (!s.line) continue;   // (a slide with no teaching line has no words card)
      slides++;
      const withRow = pagesNeeded(s, CRED_ROW), without = pagesNeeded(s, 0);
      if (withRow === 0 && without === 0) never++;
      if (withRow === 0 && without !== 0) misfit.push(`${id}:${s.id} fits without the row (${without} page), not with it`);
      else if (withRow > without && without !== 0) extra.push(`${id}:${s.id} ${without} to ${withRow} pages`);
    }
  }
  console.log(`# iPad credit row: ${slides} slides, ${extra.length} gain a page, ${never} fit neither way (estimate only)`);
  assert.ok(slides > 300, `every slide was looked at (${slides})`);
  assert.deepEqual(misfit, [], 'a slide the row would push past what a page break can hold');
  // (the row costs a page on very few slides: named so a later growth shows)
  assert.ok(extra.length <= Math.ceil(slides * 0.03), `slides that gain a page for the row: ${extra.length} of ${slides}: ${extra.join('; ')}`);
});
