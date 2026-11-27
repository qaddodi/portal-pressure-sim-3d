// How a panel's tab strip fits its width: the one measured rule every panel head uses (menu unification, stage 1: reports/menu-unification.md 3.2 "Head").
// Pure: no DOM, so node tests load it. PanelHead measures the widths and asks here; nothing else decides where a strip stands or how far its names step down.
//
// 1. Where the strip stands (tabRow). The tabs sit in the head row, between the title (and its quiet meta) and the X, when they fit there; else they drop to a row of
//    their own under the head. A strip whose panel lets its title step aside while the tabs are in the row (Tests: the open tab names the instrument) has no lead.
//    Icon tabs can always make room down to an icon each, so they stay in the row until even that would not fit; text tabs never shrink ("text never shrinks"), so
//    they stay in the row only while every name is whole beside the title.
// 2. How far the names step down (fitTabs, the 2D dock.js fitTabs, first written for Tests): a wide strip shows every full name; under 780 px the short names
//    (.compact); under 520 the name under its icon (.narrow); under 420 (a phone's sheet, beside the close button) only the open tab keeps its name (.tight), and
//    where even that would be cut the open tab is an icon too (.bare, "never a cut name"). The open tab's name is measured by its letters (a 12 px, 600-weight name
//    is about 7.2 px a letter). Text tabs take no step: their row is chosen so their names are whole.

export interface TabFit { compact: boolean; narrow: boolean; tight: boolean; bare: boolean }
export type TabVariant = 'text' | 'icon';

/** No step taken: every name whole. */
export const FIT_WHOLE: TabFit = Object.freeze({ compact: false, narrow: false, tight: false, bare: false });

const ICON_ONLY = 26, LETTER = 7.2, ICON_AND_GAPS = 16 + 16 + 5;
/** The gap between two tabs of a strip and the strip's own padding (app-07-floating.css .instr-tabs: gap 2px, padding 3px). */
const TAB_GAP = 2, STRIP_PAD = 6;

export function fitTabs(w: number, tabs: number, openName: string): TabFit {
  const compact = w < 780, narrow = w < 520, tight = w < 420;
  let bare = false;
  if (tight) {
    const need = (tabs - 1) * ICON_ONLY + ICON_AND_GAPS + openName.length * LETTER + 5 + 2 * (tabs - 1) + 6;
    bare = need > w;
  }
  return { compact, narrow, tight, bare };
}

/** The least an icon strip of n tabs takes: an icon each, the gaps and the strip's padding. */
export const iconLeast = (n: number): number => n * ICON_ONLY + TAB_GAP * (n - 1) + STRIP_PAD;

/** What a text strip needs with every name whole: its tabs share the strip evenly (flex 1 1 0), so each is as wide as the widest name it holds plus its padding. */
export const textNeed = (names: readonly number[], pad = 16): number =>
  names.length ? names.length * (Math.max(...names) + pad) + TAB_GAP * (names.length - 1) + STRIP_PAD : 0;

export interface TabRowIn {
  /** the head row's inner width (the card's width less the head's own padding) */
  head: number;
  /** what the X takes in the row, its gap included (0 where it stands outside the row, as a phone's centred head has it) */
  close: number;
  /** what the title and its meta take in the row, their gap included (0 when the title steps aside for the tabs) */
  lead: number;
  variant: TabVariant;
  /** how many tabs */
  n: number;
  /** the open tab's name as the strip shows it (an icon strip's tight step keeps it whole) */
  open: string;
  /** a text strip's width with every name whole (textNeed) */
  need?: number;
}
export interface TabRow { inHead: boolean; fit: TabFit }

/** The one rule: where the strip stands, and the step its names take there. */
export function tabRow(m: TabRowIn): TabRow {
  const room = Math.max(0, m.head - m.close - m.lead);
  if (m.variant === 'text') {
    const inHead = (m.need ?? Infinity) <= room;
    return { inHead, fit: FIT_WHOLE };
  }
  const inHead = iconLeast(m.n) <= room;
  // (under the head the strip has the row to itself: the head's inner width)
  return { inHead, fit: fitTabs(inHead ? room : m.head, m.n, m.open) };
}

export const sameFit = (a: TabFit, b: TabFit): boolean => a.compact === b.compact && a.narrow === b.narrow && a.tight === b.tight && a.bare === b.bare;
