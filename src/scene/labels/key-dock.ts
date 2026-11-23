// Where the figure key stands: the 2D app's own docking (styles/app.css `.pz-fk` rules, presenter.js fitKey and lowKey), carried onto the 3D screen.
// The key is never floated and never over a vessel or a card:
//   - Mac, iPad on its side, iPhone on its side: right on top of the nav pill at the lower right, right-aligned with it, 8 px above it ("put the legend on
//     top of the zoom pill", 15 Oct). On the sideways phone, where that reaches under the centred card, it wraps to the room beside the card and stands 4 px above.
//   - iPhone upright: at the words' bottom-left, 21 px from the side, in the pill's row (at least 38 px tall), on one line beside the pill; else on two lines
//     within the row; else on a row of its own just above it (65 px from the foot).
//   - iPad upright: left of the nav pill at the card's left (15 % + 13 px), 29 px from the foot; too long for the room beside the pill, a row above it (73 px).
// Pure: node judges it on every screen.
import type { Rect, Viewport } from '../../ui/layout/device.ts';
import { barOf, sideBox, footDrop, credRow, footReserve } from '../../ui/layout/plan.ts';
import { cardPad, clamp, isSideways, layoutOf, pzh } from '../../ui/layout/rules2d.ts';
import { LABEL_NAMES } from './names.copied.ts';
import { hits, type Box } from './geometry.ts';

export interface Dock {
  box: Box;
  /** The width it wraps to (the key's own words wrapped over two lines or more), or null when it stands on one line. */
  wrap: number | null;
  /** The shortest it stands (the pill's row on a phone), px. */
  minH: number;
  /** Where it docks, for tests and the stylesheet's state. */
  at: 'over-pill' | 'beside-pill' | 'above-pill';
  /** The swatches stand as their short names (Raw, Clear, HA, Sys: 2D's fk-short) because the long ones would not fit beside the pill. */
  short: boolean;
}

const K = LABEL_NAMES.LABEL_STYLE.KEY, D = K.DOCK;
export const GAP_ABOVE_PILL = D.aboveWide;
export const GAP_ABOVE_PILL_SIDE = D.aboveSide;
export const PHONE_SIDE = D.phoneSide;
export const PHONE_MIN_H = D.phoneMinH;
export const PHONE_UP_FOOT = D.phoneUp;
export const TAB_FOOT = D.tabRow;
export const TAB_UP_FOOT = D.tabUp;
export const TAB_LEFT = { share: D.tabLeftShare, px: D.tabLeftPx } as const;
const BESIDE_GAP = 8, CARD_GAP = 6;
/** The gap between the words' card's top edge and a key standing above it: the card's name tab (about 22 px) and a breath. */
const ABOVE_CARD = 30;
/** A key wrapped over two lines is about this much taller than on one (its rows share a line gap of .1 em). */
const TWO_LINES = 2.4;   // (21 Nov: an iPhone's two-row key drew about 58 px where 1.9 x its one-line height said 45; the dots wrap under the title)

/** The key's type size, px: the 2D caption size at this screen (a phone's and a sideways phone's is the 12 px floor), times the key's share of it. */
export function keyFontPx(vp: Viewport, gradient: boolean): number {
  const layout = layoutOf(vp.w, vp.h);
  const cap = layout === 'stack' || layout === 'tab' || isSideways(vp.w, vp.h) ? K.CAP.floor : Math.max(K.CAP.floor, clamp(K.CAP.perPzh * pzh(vp.w, vp.h), K.CAP.floor, K.CAP.max));
  const t = gradient ? K.GRAD : K.TYPE;
  return Math.max(t.floor, cap * t.scale);
}

/** The custom properties the key element carries (its type, shell and scale sizes, all the 2D pill's). */
export function keyVars(vp: Viewport, gradient: boolean): Record<string, string> {
  const t = gradient ? K.GRAD : K.TYPE, em = (n: number) => `${n}em`;
  return {
    '--lb-key-fs': `${Math.round(keyFontPx(vp, gradient) * 100) / 100}px`, '--lb-key-line': String(K.TYPE.line), '--lb-key-weight': String(K.TYPE.weight),
    '--lb-key-gap': em(t.gap), '--lb-key-pad': `${em(t.padTop)} ${t.padX}px ${em(t.padBottom)}`,
    '--lb-key-bar-w': em(gradient ? K.GRAD.barW : K.BAR.w), '--lb-key-bar-h': em(gradient ? K.GRAD.barH : K.BAR.h),
    '--lb-key-sw-w': em(K.SWATCH.w), '--lb-key-sw-h': em(K.SWATCH.h), '--lb-key-sw-r': em(K.SWATCH.radius),
  };
}

export interface DockIn {
  vp: Viewport;
  /** The words' card, when one stands. */
  words: Rect | null;
  /** The key's size on one line (measured, not wrapped), px. */
  natural: { w: number; h: number };
  /** Its size as drawn now when it is wrapped (the layer reports it), else null. */
  wrapped?: { w: number; h: number } | null;
  /** The key's size on one line with its swatches' short names (a key with none: null). The 2D app tries these before a row of its own (presenter.js fitKey). */
  short?: { w: number; h: number } | null;
}

export function dockKey(i: DockIn): Dock {
  const { vp, natural } = i, { safe } = vp, layout = layoutOf(vp.w, vp.h), bar = barOf(vp).rect;
  const sized = (w: number, h: number, wrap: number | null) => (wrap !== null && i.wrapped && Math.abs(i.wrapped.w - w) < 40 ? i.wrapped : { w, h });
  if (layout === 'stack' || layout === 'tab') {
    const tab = layout === 'tab';
    const left = tab ? (i.words ? i.words.x : vp.w * TAB_LEFT.share) + TAB_LEFT.px : safe.left + PHONE_SIDE;
    const foot = tab ? TAB_FOOT : PHONE_SIDE, minH = tab ? 0 : PHONE_MIN_H;
    const room = bar.x - left - BESIDE_GAP, full = vp.w - 2 * left;
    const place = (w: number, h: number, bottom: number, wrap: number | null, at: Dock['at'], short = false): Dock => {
      const s = sized(w, h, wrap), hh = Math.max(s.h, minH);
      return { box: { x0: left, y0: vp.h - bottom - hh, x1: left + s.w, y1: vp.h - bottom }, wrap, minH, at, short };
    };
    const drop = tab ? 0 : footDrop(vp), rowBottom = foot + safe.bottom - drop + (tab ? 0 : credRow(vp));   // (the phone's credit row stands under the pill's row)
    // The card's words end this far above the card's foot (deck-ui.css: the pad, 50 px for the pill and, on a tall phone, the credit's row): the key beside the pill never stands taller than what is left of that above its own foot,
    // estimated from the key on one line alone (the drawn size never changes the answer). Root of "the legend covers the card's last line" (iPhone, 21 Nov): the key's height was never held to the room the card keeps clear.
    const avail = cardPad(vp.w, vp.h).y + 50 + (tab ? 0 : credRow(vp)) - (rowBottom - (tab ? Math.max(safe.bottom, 0) + 8 : footReserve(vp)));
    const fits = (h: number) => Math.max(h, minH) <= avail + 0.5;
    if (natural.w <= room && fits(natural.h)) return place(natural.w, natural.h, rowBottom, null, 'beside-pill');
    if (!tab && natural.w <= 2 * room && room > 0 && natural.h * TWO_LINES <= D.pillH + 1.5 && fits(natural.h * TWO_LINES)) return place(room, natural.h * TWO_LINES, rowBottom, room, 'beside-pill');
    // the same with the swatches' short names (2D: "can use abbreviations", 20 Oct): before a row of its own, which took a whole line from the words and left the room beside the pill empty
    const sh = i.short;
    if (!tab && sh && sh.w < natural.w) {
      if (sh.w <= room && fits(sh.h)) return place(sh.w, sh.h, rowBottom, null, 'beside-pill', true);
      if (sh.w <= 2 * room && room > 0 && sh.h * TWO_LINES <= D.pillH + 1.5 && fits(sh.h * TWO_LINES)) return place(room, sh.h * TWO_LINES, rowBottom, room, 'beside-pill', true);
    }
    // too long for the pill's row: a row of its own ABOVE the words' card (2D: "somewhere else above the card if it doesn't fit"), clear of the card's name tab; never over the card's words
    const up = i.words ? vp.h - i.words.y + ABOVE_CARD : (tab ? TAB_UP_FOOT : PHONE_UP_FOOT) + safe.bottom - drop;
    return natural.w <= full ? place(natural.w, natural.h, up, null, 'above-pill') : place(full, natural.h * Math.ceil(natural.w / full), up, full, 'above-pill');
  }
  // wide screens and a phone on its side: on top of the pill, right-aligned with it
  const right = bar.x + bar.w, side = isSideways(vp.w, vp.h);
  const make = (w: number, h: number, gap: number, wrap: number | null): Dock => {
    const s = sized(w, h, wrap);
    return { box: { x0: right - s.w, y0: bar.y - gap - s.h, x1: right, y1: bar.y - gap }, wrap, minH: 0, at: 'over-pill', short: false };
  };
  const one = make(natural.w, natural.h, GAP_ABOVE_PILL, null);
  if (side) {
    // a phone on its side: the card column (the words and, under them, the instrument) stands at the left whatever slide it is, so the key never reaches into it (landscape-phone.md)
    const colR = sideBox(vp).colR, room = Math.floor(right - colR - BESIDE_GAP);
    if (one.box.x0 < colR + BESIDE_GAP && room > 0) return make(Math.min(natural.w, room), natural.h * Math.ceil(natural.w / room), GAP_ABOVE_PILL_SIDE, room);
  }
  return one;
}
