// Room first: where each card goes on each kind of screen, and the room the cards leave free for the figure.
// Pure numbers in, numbers out (no DOM): the cards measure their own height and hand it in, the scene's camera takes `free`
// and frames the subject there by shifting its projection (docs/look-and-feel.md section 8).
//
// The places are the 2D app's (owner, 19 Nov 2026: iPhone, iPhone on its side, iPad and Mac "should all be the same if not better"); the numbers are in
// rules2d.ts and tests/ui-parity-2d.test.ts holds them to the 2D app's:
//   Mac, iPad on its side (wide, short): the words' card at the top left, the data card UNDER it at the same width, a gap of 0.6 margin; a pair a little too
//     tall rises into the top margin (never closer than 4 px). Where it still does not fit, and the screen is wide enough, the data card stands beside (the
//     2D app shrinks the data card's blocks; here nothing shrinks), else the words page.
//   iPhone upright, iPad upright (stack, tab): the data card on top, the figure between, the words' card at the foot, planned from measured heights
//     (phonePlan): the figure's share gives way first, then the data card comes in closed (a strip at the top; a tap opens it and shuts the words).
//   iPhone on its side: the wallet. One column centred on the screen (400 px, wider only for a slide that needs the height), the card in front at its own
//     height, the other card a 48 px strip at the foot; a swipe or a tap swaps them.

import type { DeviceClass, Rect, Viewport } from './device.ts';
import { deviceClass } from './device.ts';
import {
  layoutOf, isSideways, margin, cardWidth, pairGap, FIG_MIN, figFloorOf, phonePlan, GRIP, SHUF, WALLET_STEPS, shufCol, shufMaxH, shufTop, type Layout,
} from './rules2d.ts';

export type CardId = 'title' | 'case' | 'teach' | 'ladder' | 'check';
/** `words` is the left or top card (title, case, teaching line, quick check); `data` is the card of numbers. */
export type Slot = 'words' | 'data';

export interface Need { id: CardId; slot: Slot; /** natural height at this plan's width for it (px); 0 until measured */ h: number }
export interface Placed { id: CardId; slot: Slot; rect: Rect }
export interface Strip { id: CardId; slot: Slot; rect: Rect }
export interface Plan {
  device: DeviceClass;
  layout: Layout;
  sideways: boolean;
  cards: Placed[];
  /** The card that is not showing, as a 48 px strip (the wallet: iPhone on its side, or an iPhone upright whose data card is closed). */
  strip: Strip | null;
  /** The data card is closed to a strip because the figure and the words need the room (iPhone upright). */
  shut: boolean;
  /** The largest empty rectangle the cards leave: the figure's room. */
  free: Rect;
  /** Cards taller than the room they have; the card pages itself (never shrinks, never scrolls). */
  overflow: CardId[];
  /** Largest height a card of each slot may have here. */
  maxH: Record<Slot, number>;
  /** Where the presenter bar stands. */
  bar: BarPlace;
}

export const STRIP_H = 48;
const GAP = 16;       // room kept between a card and the figure's free rectangle
/** The presenter bar's height (44 px buttons) and the room it takes at the foot of a screen. */
export const BAR_H = 44;
const FOOT_PAD = 8;
export const footReserve = (vp: Viewport) => Math.max(vp.safe.bottom, FOOT_PAD) + BAR_H + FOOT_PAD;
/** The bar's width on a wide screen (dots, count, Back, Next, settings), right-aligned at the foot. */
export const BAR_W = 400;
/** Sideways, the bar is a column of buttons at the right edge. */
export const BAR_SIDE = 56;

export interface BarPlace { edge: 'foot' | 'right'; rect: Rect }
export function barOf(vp: Viewport): BarPlace {
  const { safe } = vp;
  if (isSideways(vp.w, vp.h)) { const x = vp.w - Math.max(safe.right, 8) - BAR_H; return { edge: 'right', rect: { x, y: safe.top + 8, w: BAR_H, h: BAR_H * 3 + 12 } }; }
  const layout = layoutOf(vp.w, vp.h);
  if (layout === 'stack' || layout === 'tab') { const x = Math.max(safe.left, 8); return { edge: 'foot', rect: { x, y: vp.h - Math.max(safe.bottom, FOOT_PAD) - BAR_H, w: vp.w - x - Math.max(safe.right, 8), h: BAR_H } }; }
  const right = vp.w - Math.max(safe.right, 24), w = Math.min(BAR_W, right - 24);
  return { edge: 'foot', rect: { x: right - w, y: vp.h - Math.max(safe.bottom, FOOT_PAD) - BAR_H, w, h: BAR_H } };
}

/** The wallet's steps that fit across this screen (a column is never under the bar's buttons). */
export function walletSteps(vp: Viewport) {
  const room = vp.w - Math.max(vp.safe.right, 8) - BAR_SIDE - Math.max(vp.safe.left, 10) - 10;
  return WALLET_STEPS.filter((s, i) => i === 0 || shufCol(s.col, vp.w) <= room);
}

/** How many widths a card may take on this screen: a pair on its side has the wallet's steps; words alone have their own 340 px first, then the wallet's columns; every other screen has one. */
export function stepsFor(vp: Viewport, pair: boolean): number {
  if (!isSideways(vp.w, vp.h)) return 1;
  return pair ? walletSteps(vp).length : 1 + new Set(walletSteps(vp).map((s) => s.col)).size;
}

/** The width of every card on this screen (px): one width for both cards, as in the 2D app. `step` is the wallet's step (iPhone on its side): a slide whose words
 *  need more height takes a wider column (fewer lines of the same type), never a smaller type. */
export function widthOf(vp: Viewport, pair = false, step = 0): number {
  const layout = layoutOf(vp.w, vp.h);
  if (isSideways(vp.w, vp.h)) {
    const st = walletSteps(vp);
    if (pair) return Math.round(shufCol(st[Math.min(step, st.length - 1)].col, vp.w));
    if (step > 0) { const cols = [...new Set(st.map((s) => s.col))]; return Math.round(shufCol(cols[Math.min(step - 1, cols.length - 1)], vp.w)); }
  }
  return Math.round(cardWidth(vp.w, vp.h, layout));
}

/** Where the cards go. `active` is the wallet's showing card (iPhone: the other becomes the strip). `step` is the wallet's step on its side. */
export function planLayout(vp: Viewport, needs: Need[], active: Slot = 'words', step = 0): Plan {
  const device = deviceClass(vp.w, vp.h);
  const layout = layoutOf(vp.w, vp.h);
  const sideways = isSideways(vp.w, vp.h);
  const { safe } = vp;
  const words = needs.find((n) => n.slot === 'words') ?? null;
  const data = needs.find((n) => n.slot === 'data') ?? null;
  const placed: Placed[] = [];
  const bar = barOf(vp);
  let strip: Strip | null = null, shut = false;
  const maxH: Record<Slot, number> = { words: 0, data: 0 };
  let bounds: Rect;
  const extra: Rect[] = [];

  if (sideways) {
    const steps = walletSteps(vp);
    const st = steps[Math.min(step, steps.length - 1)];
    const w = widthOf(vp, !!(words && data), step);
    const lo = Math.max(safe.left, 10), hi = vp.w - Math.max(safe.right, 8) - BAR_SIDE - w;
    const x = Math.round(Math.max(lo, Math.min((vp.w - w) / 2, hi)));
    if (words && data) {
      const shown = active === 'data' ? data : words, other = shown === data ? words : data;
      maxH.words = maxH.data = shufMaxH(vp.h, st.room);
      const h = shown.h;
      placed.push({ id: shown.id, slot: shown.slot, rect: { x, y: Math.round(shufTop(vp.h, h, SHUF.edge)), w, h } });
      strip = { id: other.id, slot: other.slot, rect: { x, y: vp.h - STRIP_H, w, h: STRIP_H } };
    } else if (words || data) {
      const only = (words ?? data)!;
      maxH.words = maxH.data = vp.h - 20;
      placed.push({ id: only.id, slot: only.slot, rect: { x, y: 10, w, h: only.h } });
    }
    bounds = { x: safe.left, y: safe.top, w: vp.w - safe.left - safe.right - BAR_SIDE, h: vp.h - safe.top - safe.bottom };
    extra.push(bar.rect);
  } else if (layout === 'stack' || layout === 'tab') {
    const w = widthOf(vp), x = layout === 'tab' ? Math.round((vp.w - w) / 2) : Math.max(8, safe.left);
    const foot = footReserve(vp);
    const dtop = safe.top + 8;
    const bottom = vp.h - foot;
    const room = vp.h - foot - 16;
    const wh = words?.h ?? 0, dh = data?.h ?? 0;
    const dmax = Math.round(0.42 * vp.h);
    const plan = phonePlan({ room, dtop, data: dh, dmax, lip: 0, regular: wh, mine: Math.round(0.62 * vp.h), grip: GRIP, figMin: FIG_MIN(vp.h), figFloor: figFloorOf(vp.h), gone: !data, hasData: !!data });
    shut = plan.shut && !!data && !!words;
    if (!shut) {
      maxH.words = Math.round(plan.cap);
      maxH.data = dmax;
      if (data) placed.push({ id: data.id, slot: 'data', rect: { x, y: dtop, w, h: dh } });
      if (words) placed.push({ id: words.id, slot: 'words', rect: { x, y: Math.round(bottom - wh), w, h: wh } });
    } else {
      const shown = active === 'data' ? data! : words!, other = shown === data ? words! : data!;
      maxH.words = Math.round(plan.cap);
      maxH.data = Math.round(room - dtop - STRIP_H - 8);
      if (shown === data) { placed.push({ id: data.id, slot: 'data', rect: { x, y: dtop, w, h: dh } }); strip = { id: other.id, slot: 'words', rect: { x, y: bottom - STRIP_H, w, h: STRIP_H } }; }
      else { placed.push({ id: words!.id, slot: 'words', rect: { x, y: Math.round(bottom - wh), w, h: wh } }); strip = { id: other.id, slot: 'data', rect: { x, y: dtop, w, h: STRIP_H } }; }
    }
    bounds = { x: safe.left, y: safe.top, w: vp.w - safe.left - safe.right, h: bottom - safe.top };
  } else {
    // Mac, iPad on its side: words top left, the data card under it at the same width.
    const cm = margin(vp.w, vp.h, layout);
    const w = widthOf(vp);
    const x = Math.max(cm, safe.left);
    const top0 = Math.max(cm, safe.top + 8);
    const limit = vp.h - Math.max(cm, footReserve(vp) - FOOT_PAD);
    const gap = pairGap(vp.w, vp.h, layout);
    const wh = words?.h ?? 0, dh = data?.h ?? 0;
    const overBar = x + w > bar.rect.x - 12;   // the column reaches the bar: the pair ends above it
    const foot = overBar ? bar.rect.y - 8 : limit;
    const total = wh + (data ? gap + dh : 0);
    const rise = Math.max(0, Math.min(top0 + total - foot, top0 - 4));
    const beside = !!data && !!words && top0 + total - rise > foot + 0.5 && x + 2 * w + gap <= vp.w - Math.max(safe.right, cm);
    if (beside) {
      maxH.words = maxH.data = Math.round(foot - top0);
      placed.push({ id: words!.id, slot: 'words', rect: { x, y: top0, w, h: wh } });
      placed.push({ id: data!.id, slot: 'data', rect: { x: x + w + gap, y: top0, w, h: dh } });
    } else {
      const y0 = top0 - rise;
      maxH.words = Math.round(foot - y0 - (data ? gap + dh : 0));
      maxH.data = Math.round(foot - y0 - (words ? gap + wh : 0));
      if (words) placed.push({ id: words.id, slot: 'words', rect: { x, y: Math.round(y0), w, h: wh } });
      if (data) placed.push({ id: data.id, slot: 'data', rect: { x, y: Math.round(y0 + wh + (words ? gap : 0)), w, h: dh } });
    }
    bounds = { x: safe.left, y: safe.top + 8, w: vp.w - safe.left - safe.right, h: vp.h - safe.top - footReserve(vp) - 8 };
    if (overBar) extra.push(bar.rect);
  }

  const blockers = placed.map((p) => p.rect).concat(strip ? [strip.rect] : [], extra);
  const overflow = placed.filter((p) => p.rect.h > maxH[p.slot] + 0.5).map((p) => p.id);
  return { device, layout, sideways, cards: placed, strip, shut, free: largestFreeRect(bounds, blockers, GAP), overflow, maxH, bar };
}

/** The width over height of the figure's box (the whole body plate is taller than wide): a free rectangle is judged by the tallest figure it holds. */
export const FIGURE_ASPECT = 0.62;

/** The free rectangle inside `bounds` that touches no blocker (each grown by `gap`) and holds the tallest figure of `aspect` (width over height); a wide
 *  sliver under a card holds less than the column between two cards. Few blockers, so every grid rectangle is tried. */
export function largestFreeRect(bounds: Rect, blockers: Rect[], gap = 0, aspect = FIGURE_ASPECT): Rect {
  const bx1 = bounds.x + bounds.w, by1 = bounds.y + bounds.h;
  const grown = blockers.map((r) => ({ x0: r.x - gap, y0: r.y - gap, x1: r.x + r.w + gap, y1: r.y + r.h + gap }));
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const xs = [...new Set([bounds.x, bx1, ...grown.flatMap((g) => [g.x0, g.x1])].map((v) => clamp(v, bounds.x, bx1)))].sort((a, b) => a - b);
  const ys = [...new Set([bounds.y, by1, ...grown.flatMap((g) => [g.y0, g.y1])].map((v) => clamp(v, bounds.y, by1)))].sort((a, b) => a - b);
  let best: Rect = { x: bounds.x, y: bounds.y, w: 0, h: 0 }, score = -1, area = -1;
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) for (let k = 0; k < ys.length; k++) for (let l = k + 1; l < ys.length; l++) {
    const x0 = xs[i], x1 = xs[j], y0 = ys[k], y1 = ys[l];
    if (grown.some((g) => g.x0 < x1 && g.x1 > x0 && g.y0 < y1 && g.y1 > y0)) continue;
    const w = x1 - x0, h = y1 - y0, a = w * h, sc = Math.min(h, w / aspect);
    if (sc > score + 0.5 || (Math.abs(sc - score) <= 0.5 && a > area)) { score = sc; area = a; best = { x: x0, y: y0, w, h }; }
  }
  return best;
}
