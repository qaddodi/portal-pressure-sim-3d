// A card's box is decided once, before it shows, and never changes on screen except on a real viewport change (Plan 45, Mohammad 23 Nov: "why the fuck is the card changing in height").
// CardFrame asks this reducer what to do with every measure of its words; it is pure so a node test can drive it through a whole slide's life (tests/card-box-sequences.test.ts).
//
//   show     the card is let in: its box is the last height it reported, and that is the lock
//   measure  the card measured its words again: `fresh` is the measuring effect's own first pass (a new key, width, step or viewport: judged afresh, the lock is taken again);
//            any other measure (an observer's: a reading changed its width, a chart drew, a font swapped) is only a note.
// While locked, every measure reports nothing (the box stands); a taller one is logged, so it is found and fixed at its root (audit: card-grew-live).
import type { AuditFinding } from '../debug/audit/judge.ts';

export interface BoxState { key: string | null; h: number }
export type BoxEvent = { t: 'show'; key: string } | { t: 'measure'; key: string; h: number; fresh: boolean; shown: boolean };
export interface BoxOut { state: BoxState; /** whether the card should take this height (grow, report it to the plan) */ report: boolean; /** px the box grew while locked (0 otherwise) */ grew: number }

export const BOX_START: BoxState = { key: null, h: 0 };

export function boxOf(s: BoxState, ev: BoxEvent): BoxOut {
  if (ev.t === 'show') return { state: { key: ev.key, h: s.h }, report: false, grew: 0 };
  if (!ev.shown) return { state: { key: null, h: ev.h }, report: true, grew: 0 };
  if (ev.fresh || s.key !== ev.key) return { state: { key: ev.key, h: ev.h }, report: true, grew: 0 };
  // (a measure the observer makes after the card is let in is only a note, taller or not: the box stands, a taller one is logged for the audit. 25 Nov, third report: a card is never grown on screen, and CardFrame holds the drawn height to match)
  if (ev.h <= s.h) return { state: s, report: false, grew: 0 };
  return { state: s, report: false, grew: ev.h - s.h };
}

/** What the audit reads: every card that grew by itself after it was let in since the last mark. */
export interface Grew { card: string; slide: string; px: number }
let grewLog: Grew[] = [];
export const noteGrew = (g: Grew): void => { grewLog.push(g); };
export const clearGrew = (): void => { grewLog = []; };
export const grewFindings = (): AuditFinding[] => grewLog.map((g) => ({ kind: 'card-grew-live', sev: 'fail' as const, what: `the ${g.card} card grew ${g.px} px on its own after it showed (its box is decided before it shows; the content that changed has to reserve its room)`, where: g.slide }));

/** The height a landed card is DRAWN at (25 Nov, third report: a card never grows on screen). `f` is what it was drawn with (null before it landed): the height stays what it landed with for as long as its key
 *  (its own step and the viewport) stands; a room that gets smaller or bigger is not followed (a card never changes size after it landed, in either direction). A new key takes the plan's height, and the plan is given `CATCH_UP_MS` to catch up with it
 *  (it lags the card's own measure by a render or two). Pure; tests/card-height-frames.test.ts drives it frame by frame. */
export interface Frozen { key: string; h: number; until: number }
export const CATCH_UP_MS = 250;
export function freezeOf(f: Frozen | null, key: string, rectH: number, now: number): Frozen {
  if (!f) return { key, h: rectH, until: 0 };
  if (f.key !== key) return { key, h: rectH, until: now + CATCH_UP_MS };
  if (rectH > f.h && now < f.until) return { ...f, h: rectH };
  return f;
}
