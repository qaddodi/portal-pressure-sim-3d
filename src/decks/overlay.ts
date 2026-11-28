// What the 3D app adds to a slide, in ONE place. A deck is copied from the 2D app word for word and never edited (the scripts' --check fails on any difference), so everything the 3D app
// adds to a slide sits here, keyed by "deck/slide", and is merged onto the slide's own fields when the deck loads (`withOverlay`, called by source.ts for every deck, whoever wrote it).
// A slide then carries its 3D additions as ordinary fields (`frame`, `also`, `scores`, `split`, `interact`), and nothing downstream looks a deck or a slide up by name: a deck you author
// yourself writes the same fields and gets the same behaviour. Word amendments (a line that disagrees with its own card) are the AMEND functions below, applied in the same pass.
//
// Rules held by tests/deck-overlay.test.ts: every key names a slide that exists; every field is one of OVERLAY_FIELDS; applying the overlay twice changes nothing; a deck that is loaded
// any other way has no overlay fields at all unless its author wrote them.
import type { CopiedDeck, CopiedSlide } from './hp/types.ts';
import { FRAME_FIXES, type FrameFix } from './overlay/frames.ts';
import { SCORES, type SlideScores } from './overlay/scores.ts';
import type { SplitSlide } from './split-slides.ts';
import type { Interact } from './interact.ts';
import { amendAscites } from './ag/ascites-amend.ts';
import { amendAlbumin } from './ag/albumin-amend.ts';
import { amendControls } from './overlay/controls.ts';
import { amendLadder } from './overlay/ladder.ts';
import { amendInstruments } from './overlay/instruments.ts';
import { amendLobule } from './overlay/lobule.ts';

/** The 3D fields a slide may carry beyond the 2D deck's own. */
export interface SlideOverlay {
  /** a second level tab beside the slide's `site` (a level id) */
  also?: string;
  /** the camera policy of a slide framed on its subject (overlay/frames.ts) */
  frame?: FrameFix;
  /** the liver-function card under the criteria */
  scores?: SlideScores;
  /** the split orbit: the healthy liver on the left, this slide's patient on the right */
  split?: SplitSlide;
  /** a question the room answers before the model reveals (decks/interact.ts) */
  interact?: Interact;
}
export const OVERLAY_FIELDS = ['also', 'frame', 'scores', 'split', 'interact'] as const satisfies readonly (keyof SlideOverlay)[];

/** Slides about two levels at once: the second level's tab beside the first (the 2D deck names one level per slide). Prehepatic 13: carvedilol is the cirrhosis beta-blocker (Baveno VIII), so the
 *  sinusoidal pressure problem carries a prehepatic clot (owner, 25 Nov). */
const ALSO: Readonly<Record<string, string>> = { 'prehepatic/carv': 'pre' };

// The split orbit's slides (empty since 24 Nov: Mohammad took it off HVPG slide 7, which stays in the lobule, and slide 11, "not a good use of Split View").
// Add a line `'deck/slide': { label, against }`.
const SPLIT: Readonly<Record<string, SplitSlide>> = {};

/** Questions inside the talk, by slide (decks/interact.ts). No clinical wording lives here until the owner has approved it. */
const INTERACT: Readonly<Record<string, Interact>> = {};

const put = <K extends keyof SlideOverlay>(out: Record<string, SlideOverlay>, field: K, table: Readonly<Record<string, SlideOverlay[K]>>): void => {
  for (const [key, v] of Object.entries(table)) (out[key] ??= {})[field] = v;
};
/** Every 3D addition, by "deck/slide". */
export const OVERLAY: Readonly<Record<string, SlideOverlay>> = (() => {
  const out: Record<string, SlideOverlay> = {};
  put(out, 'also', ALSO); put(out, 'frame', FRAME_FIXES); put(out, 'scores', SCORES); put(out, 'split', SPLIT); put(out, 'interact', INTERACT);
  return out;
})();

/** Word amendments by deck: the copy stays the 2D deck character for character; these make a slide agree with itself, anchored on its words (a test fails when a re-copy moves an anchor). */
const AMEND: Readonly<Record<string, (c: CopiedDeck) => CopiedDeck>> = { ascites: amendAscites, albumin: amendAlbumin };

/** The deck with the 3D additions merged onto its slides (a copy; the loaded module is never changed). A key that names a slide the deck does not have is an error, so a re-copy that drops
 *  or renames a slide cannot leave an addition pointing at nothing. */
export function withOverlay(c0: CopiedDeck, cut = true): CopiedDeck {
  const c1 = AMEND[c0.id] ? AMEND[c0.id]!(c0) : c0;
  // (the controls' changes, for every deck: decks/overlay/controls.ts)
  // (and the pressure ladder in place of side-by-side station tiles: decks/overlay/ladder.ts; then a tiles-only card's instrument, by slide: decks/overlay/instruments.ts;
  // then the lobule strip on the slides that cross the lobule: decks/overlay/lobule.ts)
  const c = amendLobule(amendInstruments(amendLadder(amendControls(c1))));
  const mine = Object.entries(OVERLAY).filter(([k]) => k.startsWith(`${c.id}/`));
  if (!mine.length) return cut ? amendSplitPages(c) : c;
  const ids = new Set(c.slides.map((s) => s.id));
  for (const [k] of mine) if (!ids.has(k.slice(c.id.length + 1))) throw new Error(`the 3D overlay has an entry for "${k}", and deck "${c.id}" has no such slide`);
  const by = new Map(mine.map(([k, v]) => [k.slice(c.id.length + 1), v] as const));
  // (and last, a slide whose words do not fit its card becomes more slides: overlay.ts)
  const laid = { ...c, slides: c.slides.map((s): CopiedSlide => (by.has(s.id) ? { ...s, ...by.get(s.id) } : s)) };
  return cut ? amendSplitPages(laid) : laid;
}

// ---- a slide cut into several (was overlay.ts; kept in this file so the boot entry gains no file, tests/boot-entry.test.ts) -----------------------------------------
// A slide whose words do not fit its card is cut into more slides, never into pages (Mohammad, 28 Nov: no "1 of 2", no card that changes size on a turn; "make it a whole new slide with a new
// card"). The copied 2D deck stays as it is; this is laid on when the deck loads (decks/overlay.ts withOverlay, last), by "deck/slide": the slide becomes `n` slides in a row, the first keeping
// its id and the others `<id>-2`, `<id>-3`. They stand on the same figure and keep the same instrument card (the card layer keeps a data card whose instrument is the same, ui/cards/keep.ts).
//
// The words are shared out by whole sentences, evenly, earlier slides taking the extra one: exactly what the page turn showed (ui/cards/pages.ts), so no word is added, dropped or reworded.
// What a page showed where, the slide shows where:
//   first slide   the patient (preset, params, action, days, relax, ramp, sameAs), the time-lapse, a procedure and its words ahead of the result, the equation, the case and the question
//   last slide    the foot of the card: caveat, cite, the buttons (compare, what-if) with each button's words for this slide, the level rail, the causes, the two guidelines side by side
//   every slide   the figure, the cards' instruments and tiles, the title, the notes
// A summary table (a `visual` slide) keeps its words on every slide and shares out its ROWS: `table.window` is the rows a slide shows
// (the columns, heads and every row's numbers stay the whole table's).

/** How many slides a slide becomes, by "deck/slide" (the number of pages it paged into on the screens the walk measured, 28 Nov: iPhone 390x844, iPad 1180x820, Mac 1440x900). */
export const SPLIT_PAGES: Readonly<Record<string, number>> = {
  'albumin/path': 2, 'ascites/path-asc': 2, 'carvedilol/ascites': 2, 'choose-treatment/a4-grid': 2, 'day/breath': 2, 'gastric-varices/brto': 2, 'gastric-varices/summary': 3,
  'hyperdynamic/forward': 2, 'kidney/pressure': 2, 'kidney/carv': 2, 'kidney/terli': 2, 'landmark-trials/predesci-arms': 2, 'landmark-trials/transfusion-arms': 2,
  'masld/bmi': 2, 'ncph/path-psvdscore': 2, 'prehepatic/path-pvtdur': 2, 'prehepatic/path-pvtgrid': 2, 'prehepatic/carv': 2, 'stiffness/ssm': 2, 'ten-years/he-answer': 2,
  'ten-years/path-ladder-end': 2, 'tips-complete/waist': 2, 'tips-complete/reduce': 2, 'tips-complete/jet': 2, 'treatment/prop': 2, 'treatment/carv': 2, 'treatment/terli': 2,
  'two-inflows/path-pvtgrid': 2, 'variceal-bleed/path': 2, 'variceal-bleed/path2': 2, 'variceal-bleed/bridge': 2,
};

/** How many slides a talk has more than the 2D deck: every slide that became several adds the rest (the menu's count). */
export const splitExtra = (deckId: string, table: Readonly<Record<string, number>> = SPLIT_PAGES): number =>
  Object.entries(table).reduce((a, [k, n]) => a + (k.startsWith(`${deckId}/`) ? n - 1 : 0), 0);

/** The id of slide `i` (0-based) of a slide that became several. */
export const partId = (id: string, i: number): string => (i === 0 ? id : `${id}-${i + 1}`);

const FIRST = ['eq', 'eqLegend', 'vignette', 'caseQ', 'question', 'preset', 'presetDays', 'params', 'action', 'days', 'relax', 'sameAs', 'ramp', 'lapse', 'procedure', 'lineAhead'] as const;
const LAST = ['caveat', 'cite', 'controls', 'compare', 'whatIf', 'sides', 'rail', 'causes', 'causesHead'] as const;

type Loose = Record<string, any>;   // eslint-disable-line @typescript-eslint/no-explicit-any
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
const share = (text: string, n: number, i: number): string => pageOf(sentences(text), n, i).join(' ');

/** One compare button's words on the last slide: its own words, or the words of the slide it names, by the share the last slide holds (the slide's own button keeps the slide's words). */
function lastWords(o: Loose, ref: (id: string) => CopiedSlide | undefined, n: number): Loose {
  if (o.own) return o;
  const from = typeof o.line === 'string' ? o.line : typeof o.slide === 'string' ? ref(o.slide)?.line : undefined;
  if (typeof from !== 'string') return o;
  const all = sentences(from);
  // (a button with fewer sentences than the slide has slides says all of them on the last one: no slide is left with no words)
  return { ...o, line: all.length < n ? from : share(from, n, n - 1) };
}

/** The deck with its slides cut where SPLIT_PAGES says (a copy; the loaded module is never changed). A key that names a slide the deck does not have is an error. */
export function amendSplitPages(c: CopiedDeck, table: Readonly<Record<string, number>> = SPLIT_PAGES): CopiedDeck {
  const mine = Object.entries(table).filter(([k]) => k.startsWith(`${c.id}/`));
  if (!mine.length) return c;
  const ids = new Set(c.slides.map((s) => s.id));
  for (const [k] of mine) if (!ids.has(k.slice(c.id.length + 1))) throw new Error(`the split table has an entry for "${k}", and deck "${c.id}" has no such slide`);
  const by = new Map(mine.map(([k, n]) => [k.slice(c.id.length + 1), n] as const));
  // (laying it on twice changes nothing: a slide whose second part is already there is left as it is)
  for (const [id] of [...by]) if (ids.has(partId(id, 1))) by.delete(id);
  const ref = (id: string) => c.slides.find((s) => s.id === id);
  const slides: CopiedSlide[] = [];
  for (const s of c.slides) {
    const n = by.get(s.id);
    if (!n || n < 2) { slides.push(s); continue; }
    const rows = s.visual === 'table' && Array.isArray((s as Loose).of) ? ((s as Loose).of as unknown[]).length : 0;
    for (let i = 0; i < n; i++) {
      const p = clone(s) as Loose;
      p.id = partId(s.id, i);
      for (const k of FIRST) if (i > 0) delete p[k];
      if (i < n - 1) for (const k of LAST) delete p[k];
      if (rows) {
        // (a summary table: the words stand on every slide, the rows are shared out)
        const w = pageSpan(rows, n, i);
        p.window = [w.from, w.to];
      } else {
        if (typeof s.line === 'string') p.line = share(s.line, n, i);
        // (the words ahead of a procedure's result stand on the slide that plays it, shared out the same way: ui/deck/step-words.ts)
        if (typeof s.lineAhead === 'string' && i === 0) p.lineAhead = share(s.lineAhead, n, 0);
        if (i === n - 1 && p.controls?.compare?.opts) p.controls.compare.opts = p.controls.compare.opts.map((o: Loose) => lastWords(o, ref, n));
      }
      slides.push(p as CopiedSlide);
    }
  }
  return { ...c, slides };
}

/** Sentences of a line's markup: a full stop, ? or ! then a capital, a { or a [ starts the next one. */
export function sentences(line: string): string[] {
  return line.split(/(?<=[.!?])\s+(?=[A-Z{\[])/).map((s) => s.trim()).filter(Boolean);
}

/** Where page `page` (0-based) of `n` pages starts and ends in a list of `len` whole items: shared out evenly, earlier pages taking the extra one. */
export function pageSpan(len: number, n: number, page: number): { from: number; to: number } {
  const pages = Math.max(1, Math.min(n, len));
  const per = Math.floor(len / pages), extra = len % pages;
  const from = page * per + Math.min(page, extra);
  return { from, to: from + per + (page < extra ? 1 : 0) };
}

/** Page `page` (0-based) of `n` pages: the sentences (or a table's rows) shared out evenly, earlier pages taking the extra one. */
export function pageOf<T>(list: readonly T[], n: number, page: number): T[] {
  const { from, to } = pageSpan(list.length, n, page);
  return list.slice(from, to);
}
