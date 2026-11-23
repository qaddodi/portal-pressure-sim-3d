// A card's box is decided once, before it shows, and never changes on screen except on a real viewport change (Plan 45, Mohammad 23 Nov: "why the fuck is the card changing in height").
// CardFrame asks this reducer what to do with every measure of its words; it is pure so a node test can drive it through a whole slide's life (tests/card-box-sequences.test.ts).
//
//   show     the card is let in: its box is the last height it reported, and that is the lock
//   measure  the card measured its words again: `fresh` is the measuring effect's own first pass (a new key, width, step or viewport: judged afresh, the lock is taken again);
//            any other measure (an observer's: a reading changed its width, a chart drew, a font swapped) is only a note.
// While locked, a shorter or equal measure reports nothing (the box stands); a taller one is let through (never clip) and logged, so it is found and fixed at its root (audit: card-grew-live).
import type { AuditFinding } from '../debug/audit/judge.ts';

export interface BoxState { key: string | null; h: number }
export type BoxEvent = { t: 'show'; key: string } | { t: 'measure'; key: string; h: number; fresh: boolean; shown: boolean };
export interface BoxOut { state: BoxState; /** whether the card should take this height (grow, report it to the plan) */ report: boolean; /** px the box grew while locked (0 otherwise) */ grew: number }

export const BOX_START: BoxState = { key: null, h: 0 };

export function boxOf(s: BoxState, ev: BoxEvent): BoxOut {
  if (ev.t === 'show') return { state: { key: ev.key, h: s.h }, report: false, grew: 0 };
  if (!ev.shown) return { state: { key: null, h: ev.h }, report: true, grew: 0 };
  if (ev.fresh || s.key !== ev.key) return { state: { key: ev.key, h: ev.h }, report: true, grew: 0 };
  if (ev.h <= s.h) return { state: s, report: false, grew: 0 };
  return { state: { key: s.key, h: ev.h }, report: true, grew: ev.h - s.h };
}

/** What the audit reads: every card that grew by itself after it was let in since the last mark. */
export interface Grew { card: string; slide: string; px: number }
let grewLog: Grew[] = [];
export const noteGrew = (g: Grew): void => { grewLog.push(g); };
export const clearGrew = (): void => { grewLog = []; };
export const grewFindings = (): AuditFinding[] => grewLog.map((g) => ({ kind: 'card-grew-live', sev: 'fail' as const, what: `the ${g.card} card grew ${g.px} px on its own after it showed (its box is decided before it shows; the content that changed has to reserve its room)`, where: g.slide }));
