// Room first: where each card goes on each kind of screen, and the room the cards leave free for the figure.
// Pure numbers in, numbers out (no DOM): the cards measure their own height and hand it in, the scene's camera takes `free`
// and frames the subject there by shifting its projection (docs/look-and-feel.md section 8).

import type { DeviceClass, Rect, Viewport } from './device.ts';
import { deviceClass } from './device.ts';

export type CardId = 'title' | 'case' | 'teach' | 'ladder' | 'check';
/** `words` is the left or top card (title, case, teaching line, quick check); `data` is the card of numbers. */
export type Slot = 'words' | 'data';

export interface Need { id: CardId; slot: Slot; /** natural height at this plan's width for it (px); 0 until measured */ h: number }
export interface Placed { id: CardId; slot: Slot; rect: Rect }
export interface Strip { id: CardId; slot: Slot; rect: Rect }
export interface Plan {
  device: DeviceClass;
  cards: Placed[];
  /** Phones: the card that is not showing, as a 48 px strip (the wallet). */
  strip: Strip | null;
  /** The largest empty rectangle the cards leave: the figure's room. */
  free: Rect;
  /** Cards taller than the room they have; the card pages itself (never shrinks, never scrolls). */
  overflow: CardId[];
  /** Largest height a card of each slot may have here. */
  maxH: Record<Slot, number>;
}

export const STRIP_H = 48;
const GAP = 16;       // room kept between a card and the figure's free rectangle
const STRIP_GAP = 10; // card to strip
/** The presenter bar's height below the top safe area (44 px buttons, 8 px above them): the figure's room starts under it. */
export const BAR = 56;

/** The width of each card on each screen (px). Heights are measured at these widths, so a width never depends on a height. */
export function widthOf(device: DeviceClass, id: CardId, vp: Viewport): number {
  switch (device) {
    case 'desktop': return id === 'title' ? 500 : id === 'ladder' ? 330 : 430;
    case 'tablet-portrait': { const w = Math.min(620, Math.max(430, Math.round(vp.w * 0.7))); return id === 'title' ? Math.min(w + 40, vp.w - 48) : w; }
    case 'phone-portrait': return vp.w - 24;
    case 'phone-landscape': return 330;
  }
}

const bottomBase = (vp: Viewport) => vp.h - Math.max(vp.safe.bottom, 12);

/** Where the cards go. `active` is the wallet's showing card (phones only: the other becomes the strip). */
export function planLayout(vp: Viewport, needs: Need[], active: Slot = 'words'): Plan {
  const device = deviceClass(vp.w, vp.h);
  const { safe } = vp;
  const words = needs.find((n) => n.slot === 'words') ?? null;
  const data = needs.find((n) => n.slot === 'data') ?? null;
  const placed: Placed[] = [];
  let strip: Strip | null = null;
  const maxH: Record<Slot, number> = { words: 0, data: 0 };
  let bounds: Rect;

  if (device === 'desktop') {
    const top = safe.top + 80;
    maxH.words = vp.h - top - safe.bottom - 24;
    maxH.data = vp.h - (safe.top + 80) - (safe.bottom + 40);
    if (words) placed.push({ id: words.id, slot: 'words', rect: { x: safe.left + 40, y: top, w: widthOf(device, words.id, vp), h: words.h } });
    if (data) { const w = widthOf(device, data.id, vp); placed.push({ id: data.id, slot: 'data', rect: { x: vp.w - safe.right - 40 - w, y: vp.h - safe.bottom - 40 - data.h, w, h: data.h } }); }
    bounds = { x: safe.left, y: safe.top + BAR, w: vp.w - safe.left - safe.right, h: vp.h - safe.top - safe.bottom - BAR - 16 };
  } else if (device === 'tablet-portrait') {
    const top = safe.top + 72;
    maxH.words = Math.round((vp.h - top - safe.bottom - 28) * 0.55);
    maxH.data = Math.round((vp.h - top - safe.bottom - 28) * 0.4);
    if (words) { const w = widthOf(device, words.id, vp); placed.push({ id: words.id, slot: 'words', rect: { x: Math.round((vp.w - w) / 2), y: top, w, h: words.h } }); }
    if (data) { const w = widthOf(device, data.id, vp); placed.push({ id: data.id, slot: 'data', rect: { x: Math.round((vp.w - w) / 2), y: vp.h - safe.bottom - 28 - data.h, w, h: data.h } }); }
    bounds = { x: safe.left, y: safe.top + BAR, w: vp.w - safe.left - safe.right, h: vp.h - safe.top - safe.bottom - BAR - 12 };
  } else if (device === 'phone-portrait') {
    // The wallet, upright: the showing card is a sheet at the foot, the other a strip under it.
    const shown = data && words ? (active === 'data' ? data : words) : (words ?? data);
    const other = data && words ? (shown === data ? words : data) : null;
    let bottom = bottomBase(vp);
    if (other) { strip = { id: other.id, slot: other.slot, rect: { x: 12, y: bottom - STRIP_H, w: vp.w - 24, h: STRIP_H } }; bottom = strip.rect.y - STRIP_GAP; }
    const topMin = safe.top + BAR;
    maxH.words = maxH.data = bottom - topMin - Math.round(vp.h * 0.22);
    if (shown) placed.push({ id: shown.id, slot: shown.slot, rect: { x: 12, y: bottom - shown.h, w: vp.w - 24, h: shown.h } });
    bounds = { x: 0, y: topMin, w: vp.w, h: bottomBase(vp) - topMin };
  } else {
    // iPhone on its side: the wallet. A 330 px column inside the safe area; the showing card centred, the other a strip at the foot.
    const shown = data && words ? (active === 'data' ? data : words) : (words ?? data);
    const other = data && words ? (shown === data ? words : data) : null;
    const x = safe.left;
    const lo = safe.top + 12;
    let hi = bottomBase(vp);
    if (other) { strip = { id: other.id, slot: other.slot, rect: { x, y: hi - STRIP_H, w: 330, h: STRIP_H } }; hi = strip.rect.y - STRIP_GAP; }
    maxH.words = maxH.data = hi - lo;
    if (shown) placed.push({ id: shown.id, slot: shown.slot, rect: { x, y: Math.round(Math.max(lo, lo + (hi - lo - shown.h) / 2)), w: 330, h: shown.h } });
    bounds = { x: safe.left, y: safe.top + BAR, w: vp.w - safe.left - safe.right, h: bottomBase(vp) - safe.top - BAR };
  }

  const blockers = placed.map((p) => p.rect).concat(strip ? [strip.rect] : []);
  const overflow = placed.filter((p) => p.rect.h > maxH[p.slot] + 0.5).map((p) => p.id);
  return { device, cards: placed, strip, free: largestFreeRect(bounds, blockers, GAP), overflow, maxH };
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
