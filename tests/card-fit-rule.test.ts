// G1 of capture 3531bdfa (card box lock and fit): ONE rule for a card whose content is taller than the room it has, for every kind (words, panel, case, data), on every screen:
//   fit (the card's --pz-fit, a zoom of its contents) down to the 12 px floor, then page; a card never grows after it lands and never stands clipped; the pair stands inside the screen.
// What node can drive is pinned here over every slide of every talk: the numbers of the rule (card-fit.ts), the planner's clamp (plan.ts), and the places in the card code that apply it (source pins, as the
// neighbouring card tests do; no browser, so what the real text measures is "needs a look on device").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UI } from '../src/ui/strings.generated.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { parseLine, plainLine } from '../src/ui/text/line.ts';
import { typeFor } from '../src/ui/layout/device.ts';
import { cardPad, layoutOf } from '../src/ui/layout/rules2d.ts';
import { planLayout, widthOf, credRow } from '../src/ui/layout/plan.ts';
import { floorOf, fitToRoom, wordsFitOf, FLOOR_PX } from '../src/ui/cards/card-fit.ts';
import { sentences, pageOf } from '../src/ui/cards/pages.ts';

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const SCREENS = [
  { n: 'iPhone 390', w: 390, h: 844, safe: { top: 47, bottom: 34, left: 0, right: 0 } },
  { n: 'iPhone 390 untucked', w: 390, h: 844, safe: { top: 0, bottom: 0, left: 0, right: 0 } },
  { n: 'iPhone SE', w: 375, h: 667, safe: { top: 20, bottom: 0, left: 0, right: 0 } },
  { n: 'iPad up', w: 820, h: 1180, safe: { top: 24, bottom: 20, left: 0, right: 0 } },
  { n: 'iPad side', w: 1180, h: 820, safe: { top: 24, bottom: 20, left: 0, right: 0 } },
  { n: 'Mac', w: 1440, h: 900, safe: { top: 0, bottom: 0, left: 0, right: 0 } },
  { n: 'Mac small', w: 1280, h: 720, safe: { top: 0, bottom: 0, left: 0, right: 0 } },
];
type Vp = (typeof SCREENS)[number];

/** A conservative estimate of a teaching card's height from its character counts (as tests/ui-fit-estimate.test.ts: Inter about .54 em a character, 8% for ragged wrapping). */
function wordsEstimate(vp: Vp, title: string, line: string): number {
  const t = typeFor(vp.w, vp.h), pad = cardPad(vp.w, vp.h), inner = widthOf(vp as never) - 2 * pad.x - 2;
  const lines = (n: number, px: number, em: number) => Math.max(1, Math.ceil((n * px * em * 1.08) / inner));
  const chars = plainLine(parseLine(line), () => 11.6).length;
  const lay = layoutOf(vp.w, vp.h), foot = lay === 'stack' || lay === 'tab' ? 50 + credRow(vp as never) : 0;
  return Math.ceil(2 * pad.y + 2 + lines(title.length, t.slideTitle, 0.5) * t.slideTitle * t.slideTitleLead + 12 + lines(chars, t.body, 0.54) * t.body * t.bodyLead + foot);
}

test('the fit: never under the 12 px floor, never over 1, never a card that grows; it fits wherever the floor allows and says so where it does not', () => {
  assert.equal(floorOf(16), Math.ceil((12 / 16) * 1000) / 1000);
  assert.equal(floorOf(12), 1, 'lettering already at the floor cannot be zoomed down');
  assert.equal(floorOf(11), 1);
  assert.equal(floorOf(0), 0.5, 'no body lettering to judge by (a table): 2D\'s half');
  let fits = 0, floored = 0;
  for (const body of [12, 13, 14, 15, 16, 17, 18, 20, 24]) for (let h = 100; h <= 1400; h += 37) for (let room = 80; room <= 1100; room += 41) {
    const k = fitToRoom(h, room, body), at = `body ${body} h ${h} room ${room}`;
    assert.ok(k <= 1 && k >= floorOf(body) - 1e-9, `k ${k}: ${at}`);
    if (h <= room) assert.equal(k, 1, `fits: no zoom, ${at}`);
    // the body lettering on the screen is never under 12 px unless it was to begin with
    if (body > FLOOR_PX) assert.ok(body * k >= FLOOR_PX - 0.02, `lettering ${body * k}px: ${at}`);
    if (h > room) { if (h * k <= room + 0.5) fits++; else { floored++; assert.ok(k - floorOf(body) < 1e-9, `short of the room but not at the floor: ${at}`); } }
  }
  assert.ok(fits > 1000 && floored > 100, `${fits} fitted, ${floored} stopped at the floor`);
  // the words fit only past their last page: before it they page, they never shrink first
  assert.equal(wordsFitOf(500, 300, 16, false), 1);
  assert.ok(wordsFitOf(500, 300, 16, true) < 1);
});

test('every teaching slide on every screen: a pair taller than its room is clamped inside the screen, never drawn taller than its content, and the plan names every card it holds short', async () => {
  let slides = 0, paired = 0, held = 0, fitsAfterPaging = 0, needsLook: string[] = [];
  for (const { id } of UI.decks) {
    const d = (await loadBuiltin(id))!;
    for (const [i, s] of d.slides.entries()) {
      if (!s.line) continue;
      slides++;
      for (const vp of SCREENS) {
        const wh = wordsEstimate(vp, s.title, s.line);
        for (const dh of [150, 320, 520]) {
          const p = planLayout(vp as never, [{ id: 'teach', slot: 'words', h: wh }, { id: 'ladder', slot: 'data', h: dh }] as never, 'words', 0, false);
          const w = p.cards.find((c) => c.slot === 'words')!.rect, c = p.cards.find((c) => c.slot === 'data')!.rect, at = `${id}.${i + 1} ${vp.n} words ${wh} data ${dh}`;
          paired++;
          assert.ok(w.h <= wh && c.h <= dh, `a card drawn taller than its content: ${at}`);
          if (w.h < wh) { held++; assert.ok(p.overflow.includes('teach'), `words held short with no word of it: ${at}`); }
          if (c.h < dh) { assert.ok(p.overflow.includes('ladder') || p.short, `instrument held short with no word of it: ${at}`); }
          // inside the screen, whatever the heights (a phone on its side bleeds the instrument off the foot by design)
          if (!p.sideways) for (const r of [w, c]) assert.ok(r.y >= 0 && r.y + r.h <= vp.h + 0.5, `a card past the screen: ${at} ${JSON.stringify(r)}`);
          // the two cards never stand on each other (a stack: the instrument over the words; a wide screen: the words over the instrument)
          if (!p.sideways) assert.ok(p.layout === 'stack' || p.layout === 'tab' ? c.y + c.h <= w.y + 0.5 : w.y + w.h <= c.y + 0.5, `cards over each other: ${at}`);
          // the rule: fit, then page. A words card held short pages by whole sentences until a page fits its room; where none does, the fit takes it to the floor; what is left is a look decision
          if (w.h < wh) {
            const list = sentences(s.line);
            let ok = false;
            for (let n = 1; n <= Math.max(1, list.length) && !ok; n++) {
              const tallest = Math.max(...Array.from({ length: Math.min(n, list.length) }, (_, k) => wordsEstimate(vp, s.title, pageOf(list, n, k).join(' '))));
              ok = tallest <= p.maxH.words + 0.5;
            }
            if (ok) fitsAfterPaging++;
            else { const k = fitToRoom(wh / Math.max(1, list.length), p.maxH.words, typeFor(vp.w, vp.h).body); if (!(wh / Math.max(1, list.length) * k <= p.maxH.words)) needsLook.push(`${id}.${i + 1} ${vp.n}`); }
          }
        }
      }
    }
  }
  assert.ok(slides > 300 && paired > 5000, `slides ${slides}, pairs ${paired}`);
  assert.ok(held > 0 && fitsAfterPaging > 0);
  // (informational: the estimate is conservative; a slide the rule cannot bring into its room even paged to one sentence and fitted is a look decision, listed in the report, never built as paging UI that does not exist)
  assert.ok(needsLook.length < paired * 0.05, `${needsLook.length} slide x screen cases the rule cannot fit`);
});

test('a wide screen\'s pair stays inside the screen when both cards are tall, and the instrument keeps what the words leave (never under 40% of the room)', () => {
  for (const vp of SCREENS.filter((v) => layoutOf(v.w, v.h) !== 'stack' && layoutOf(v.w, v.h) !== 'tab')) for (const wh of [200, 400, 700, 1000]) for (const dh of [200, 400, 700, 1000]) {
    const p = planLayout(vp as never, [{ id: 'teach', slot: 'words', h: wh }, { id: 'ladder', slot: 'data', h: dh }] as never, 'words', 0, false);
    const w = p.cards.find((c) => c.slot === 'words')!.rect, c = p.cards.find((c) => c.slot === 'data')!.rect, at = `${vp.n} ${wh}/${dh}`;
    assert.ok(w.y >= 0 && c.y + c.h <= vp.h - Math.max(0, vp.safe.bottom) + 0.5, `${at}: the pair ends at ${c.y + c.h} on a ${vp.h} screen`);
    assert.ok(w.y + w.h <= c.y + 0.5, `${at}: overlap`);
    if (wh + dh > vp.h) assert.ok(p.overflow.length > 0, `${at}: a pair taller than the screen is named`);
  }
  // 07.10 of the capture: 376 + 337 on a 1440x900 screen fits whole, centred, and nothing is held
  const p = planLayout(SCREENS[5] as never, [{ id: 'teach', slot: 'words', h: 376 }, { id: 'ladder', slot: 'data', h: 337 }] as never, 'words', 0, false);
  assert.deepEqual(p.overflow, []);
  const ys = p.cards.map((c) => c.rect);
  assert.ok(ys[0]!.y > 40 && ys[1]!.y + ys[1]!.h < 860, 'centred, clear of the foot');
});

test('the card code applies the rule to every kind: the panel fits to the box it landed with, the case judges again when its fonts are in, the words fit past their last page, the legend never pins over rows', () => {
  const frame = src('src/ui/cards/CardFrame.tsx'), layer = src('src/ui/cards/CardLayer.tsx'), cs = src('src/ui/cards/CaseCard.tsx'), css = src('src/ui/deck-ui.css');
  // panel (title, table, chart panels): after landing, the observer's pass fits to min(screen room, landed box); the quick check, which opens by design, to the screen's
  assert.match(frame, /const landed = !full && gate\.current && box\.current\.key === lockKey && box\.current\.h > 0 && !GROWS_BY_DESIGN\.has\(entry\.id\) \? box\.current\.h : Infinity;/);
  assert.match(frame, /const room = Math\.min\(screenRoom, landed\);/);
  // (the fit's floor is the panel's own smallest lettering for a table, the teaching line's otherwise; a paged table does not zoom: tests/table-paging.test.ts)
  assert.match(frame, /const floor = visual === 'table' && paged \? 1 : floorOf\(Number\.isFinite\(smallest\) \? smallest : /);
  // case: the ease is judged again once the fonts are in
  assert.match(cs, /document\.fonts\.ready\.then\(\(\) => setFonts\(true\)\)/);
  assert.match(cs, /\[slide\.id, text, vp\.w, vp\.h, fonts\]/);
  // words: the last resort sits after the last page; paging comes first
  assert.match(layer, /const wfitBusy = tooTall && !alone && !tightens && !!view && pages >= capOf\(view\) && wfitK === undefined;/);
  assert.match(layer, /wordsFitOf\(wordsHit\?\.h \?\? 0, plan\.maxH\.words, px\('words', '\.pz-line, p'\), true\)/);
  assert.ok(layer.indexOf('if (wfitBusy) {') < layer.indexOf('if (tooTall && pages < cap)'), 'the fit step is judged before a page is asked for, and only on the last page (wfitBusy needs pages >= cap)');
  assert.match(layer, /const growing = ladBusy \|\| fitBusy \|\| wfitBusy \|\|/, 'cards wait for the fit: none lands half-negotiated');
  // a words card or an instrument that grew past its lock is replaced by a fresh card at its final size, never grown (a panel is not: the same words would be the same height)
  assert.match(layer, /onOutgrown=\{alone \? undefined : outgrown\}/);
  assert.match(css, /\.deck-ui \.pz-table \.pz-foot \{ position: static; \}/);
});
