import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HVPG_DECK } from '../src/decks/hvpg.ts';
import { parseLine, plainLine } from '../src/ui/text/line.ts';
import { TYPE, type DeviceClass } from '../src/ui/layout/device.ts';
import { planLayout, widthOf, type CardId } from '../src/ui/layout/plan.ts';

// No browser: a conservative estimate of each card's height from character counts (Inter ~0.54 em a character, Source Serif ~0.50 em, plus 8% for
// ragged wrapping). A card the estimate puts over its room is one the real layout could overflow, so it needs a page break (or the test is wrong).
const lines = (text: string, px: number, width: number, em: number) => Math.max(1, Math.ceil((text.length * px * em * 1.08) / width));
const SCREENS: Record<string, { w: number; h: number; safe: [number, number, number, number]; device: DeviceClass }> = {
  mac: { w: 1280, h: 800, safe: [0, 0, 0, 0], device: 'desktop' },
  'ipad-portrait': { w: 820, h: 1180, safe: [24, 0, 20, 0], device: 'tablet-portrait' },
  'iphone-portrait': { w: 393, h: 852, safe: [59, 0, 34, 0], device: 'phone-portrait' },
  'iphone-landscape': { w: 852, h: 393, safe: [0, 59, 21, 59], device: 'phone-landscape' },
};

function estimate(id: CardId, slideIdx: number, device: DeviceClass, vp: Parameters<typeof widthOf>[2], pages = 1) {
  const t = TYPE[device];
  const padX = device.startsWith('phone') ? 20 : 26, padY = device.startsWith('phone') ? 18 : 24;
  const inner = widthOf(device, id, vp) - 2 * padX - 2;
  const s = HVPG_DECK.slides[slideIdx];
  const para = (txt: string, px = t.body, lead = t.bodyLead) => lines(txt, px, inner, 0.54) * px * lead;
  let h = 2 * padY + 2;
  if (id === 'teach') {
    const line = plainLine(parseLine(s.line), () => 11.6);
    h += t.kicker + 10 + lines(s.title, t.slideTitle, inner, 0.5) * t.slideTitle * t.slideTitleLead + 2 + (s.eq ? 10 + t.body * 1.2 + 12 : 10) + para(line);
  } else if (id === 'case') h += t.kicker + 10 + para(s.vignette!);
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
  test(`${name}: every card fits the room its plan gives it (estimated)`, () => {
    const vp = { w: sc.w, h: sc.h, safe: { top: sc.safe[0], right: sc.safe[1], bottom: sc.safe[2], left: sc.safe[3] } };
    const over: string[] = [];
    const check = (id: CardId, idx: number, withData: boolean) => {
      // a card that does not fit whole may split (CardLayer asks for one more page at a time); it must fit by the last page it can have
      let h = estimate(id, idx, sc.device, vp);
      if (id === 'title' && h > planLayout(vp, [{ id, slot: 'words', h }]).maxH.words) h = estimate(id, idx, sc.device, vp, 2);
      const other = withData ? estimate('ladder', idx, sc.device, vp) : 0;
      const plan = planLayout(vp, [{ id, slot: 'words', h }, ...(withData ? [{ id: 'ladder' as CardId, slot: 'data' as const, h: other }] : [])]);
      if (plan.overflow.length) over.push(`${id}${id === 'teach' || id === 'case' ? ':' + HVPG_DECK.slides[idx].id : ''} ${h}px > ${plan.maxH.words}px${withData ? ' (with its strip)' : ''}`);
    };
    check('title', 0, false); check('check', 0, false);
    HVPG_DECK.slides.forEach((s, i) => { if (s.vignette) check('case', i, false); check('teach', i, !!s.ladder); if (s.ladder) { const h = estimate('ladder', i, sc.device, vp); const p = planLayout(vp, [{ id: 'teach', slot: 'words', h: 100 }, { id: 'ladder', slot: 'data', h }], 'data'); if (p.overflow.length) over.push(`ladder:${s.id} ${h}px > ${p.maxH.data}px`); } });
    assert.deepEqual(over, [], `would need a page break on ${name}`);
  });
}
