// Where a floating menu sits beside its button: 2D util.js placeAt (the one placer, for the popover, the main menu and the Why card) and the placing step of util.js popover (`put`: a
// settings-style menu below its button takes the room down to the bar or the stage's foot, and opens above a button that is low on the screen), ported line for line. Written once as a
// menu opens and on a resize: `translate` from the window's corner (left and top are never written, so nothing is laid out), clear of the notch (env() is 0 elsewhere).
import { clamp } from '../tests/copied/num.copied.js';

/** The bottom of what is visible: above the on-screen keyboard on iOS, where innerHeight does not shrink (util.js visibleBottom). */
/** A px custom property as a number (0 when it is unset or not px): --safe-b and --safe-t resolve env() there, --top-safe is the room's own top (room.ts layoutVars). */
function cssPx(name: string, el: Element | null): number {
  if (!el || typeof getComputedStyle !== 'function') return 0;
  const v = parseFloat(getComputedStyle(el).getPropertyValue(name));
  return Number.isFinite(v) ? v : 0;
}

/** The highest a floating menu or card may reach: under the notch and under the top bar (the room's own `--top-safe`, notch included), and never above the margin. Nothing floats over the top UI. */
export function stageTop(margin = 8, doc: Document = document): number {
  const app = doc.querySelector('.app') ?? doc.documentElement;
  return Math.max(margin, cssPx('--top-safe', app), cssPx('--safe-t', doc.documentElement) + margin);
}

export const visibleBottom = (): number => {
  const v = typeof window !== 'undefined' ? window.visualViewport : null;
  if (!v) return innerHeight;
  const { offsetTop: top, height } = v;
  return Math.min(innerHeight, top + height);
};

/** The lowest a floating menu or card may reach (util.js stageBottom): the free stage's foot, above the bottom bar, for a menu that opens from the top bars; the visible bottom for one that
 *  opens from the dock itself. (2D reads its free-stage record; here the dock's own top is the stage's foot.) */
export function stageBottom(anchor: Element | null, doc: Document = document): number {
  const vb = visibleBottom() - cssPx('--safe-b', doc.documentElement);
  if (anchor?.closest?.('.vdock, .thumb-bar')) return vb;
  const dock = doc.getElementById('vdock');
  const d = dock && dock.getClientRects().length ? dock.getBoundingClientRect() : null;
  return d && d.height ? Math.min(vb, d.top) : vb;
}

export interface PlaceOpts {
  side?: 'below' | 'above'; align?: 'start' | 'center' | 'end'; gap?: number; margin?: number; edge?: number | null; flip?: boolean;
  /** the lowest the menu may reach, when it is not the stage's foot (a bar under it); the highest is always stageTop() */
  bottom?: number;
}

export interface FitIn { aTop: number; aBottom: number; h: number; side: 'below' | 'above'; gap: number; top: number; bottom: number; flip: boolean }
export interface Fit { side: 'below' | 'above'; y: number; maxH: number }

/**
 * The one rule for where a floating menu stands (pure numbers, tests/menu-room.test.ts): it opens on the side asked for; where its natural height h does not fit the room on that side it opens on the
 * other side if it fits there; if it fits on neither it takes the side with more room and is cut to that room (the box scrolls inside, max-height). Its box always lies between `top` (under the
 * notch and the top bar) and `bottom` (above the bar or the foot of the screen), so it never covers the top UI and never runs past the bottom. flip=false keeps the side and only cuts it.
 */
export function fitRoom({ aTop, aBottom, h, side, gap, top, bottom, flip }: FitIn): Fit {
  const room = { below: Math.max(0, bottom - (aBottom + gap)), above: Math.max(0, aTop - gap - top) };
  let s = side;
  const other = side === 'below' ? 'above' : 'below';
  if (flip && h > room[side]) s = h <= room[other] || room[other] > room[side] ? other : side;
  const maxH = Math.min(h, room[s]);
  return { side: s, maxH, y: s === 'below' ? aBottom + gap : aTop - gap - maxH };
}

/**
 * Puts el by translate from the window's corner and returns the top it took. side: 'below' | 'above' the button; align: 'start' | 'center' | 'end'; gap: px between the two; margin: the least
 * clearance from the window's edges; edge: a line to sit on or under instead of the button's own top (the tab row's); flip: opens on the other side where there is no room (false: kept on its side).
 * Whatever the side, the box is cut to the room between the top bar and the bottom (fitRoom) and scrolls inside, so no menu or card covers the top UI or leaves the screen. Its entrance is opacity
 * alone (scale-settle) or a sheet's slide, so no transform-origin is set.
 */
export function placeAt(el: HTMLElement, anchor: HTMLElement, { side = 'below', align = 'start', gap = 8, margin = 8, edge = null, flip = true, bottom }: PlaceOpts = {}): number {
  const r = anchor.getBoundingClientRect();
  // (Layout size, not the rectangle: an entrance may be moving the box. The last cut is lifted first, so the height read is the menu's own.)
  el.style.maxHeight = '';
  const w = el.offsetWidth, hh = el.offsetHeight, cw = document.documentElement.clientWidth || innerWidth;
  const x = align === 'end' ? r.right - w : align === 'center' ? r.left + r.width / 2 - w / 2 : r.left;
  const fit = fitRoom({ aTop: edge ?? r.top, aBottom: r.bottom, h: hh, side, gap, top: stageTop(margin), bottom: (bottom ?? stageBottom(anchor)) - margin, flip });
  if (fit.maxH < hh) el.style.maxHeight = `${Math.floor(fit.maxH)}px`;
  const leftCss = `clamp(calc(${margin}px + var(--safe-l)), ${x}px, calc(${cw - w - margin}px - var(--safe-r)))`;
  el.style.translate = `${leftCss} ${fit.y}px`;
  return fit.y;
}

/** util.js popover `put`: a menu (not a sheet) by its button, through the one placer. A `.app-menu` below its button uses the room down to the bar under it or the stage's foot; one from the
 *  thumb dock's tab row rests above the whole dock. Whichever side it opens on, it is cut to the room between the top bar and that edge. It comes in with a 4 px rise from its button's side. */
export function placePopover(el: HTMLElement, anchor: HTMLElement, { align = 'start', place = 'below' }: { align?: 'start' | 'center' | 'end'; place?: 'below' | 'above' } = {}): number {
  const r = anchor.getBoundingClientRect(), w0 = el.offsetWidth;
  const x = align === 'end' ? r.right - w0 : align === 'center' ? r.left + r.width / 2 - w0 / 2 : r.left;
  // A bar under the menu where the two meet horizontally is the foot it may reach (the thumb dock's own tab row is the edge below).
  let barTop: number | null = null;
  if (place === 'below' && el.classList.contains('app-menu')) {
    const dock = document.getElementById('vdock'), d = dock && dock.getClientRects().length ? dock.getBoundingClientRect() : null, xl = clamp(x, 8, innerWidth - w0 - 8);
    if (d && d.height && d.left < xl + w0 && d.right > xl && d.top < visibleBottom()) barTop = d.top;
  }
  // A menu from the thumb dock's tab row rests above the whole dock (the play bar and timeline stay up under it), like the cards and the phone's sheets.
  const bar = anchor.closest('.thumb-bar'), dockEl = bar && bar.closest('.vdock'), tabTop = bar ? (dockEl || bar).getBoundingClientRect().top : null;
  const top = placeAt(el, anchor, { side: place === 'above' || bar ? 'above' : 'below', align, edge: bar ? tabTop : null, bottom: barTop ?? undefined });
  // (It comes in with a 4 px rise from its button's side: down from a button above it, up from one below it.)
  el.style.setProperty('--pop-y', top < r.top ? '4px' : '-4px');
  // Ending just above the bar, the menu's shadow stops at the bar's top edge, so the bar itself stays as it was (the clip itself is CSS, `.menu.app-menu`; only the gap it reads is written).
  const below = top >= r.bottom, gap = barTop == null || !below ? null : barTop - (top + el.offsetHeight);
  el.style.setProperty('--bar-clip', gap == null ? '' : `${(-Math.max(0, gap)).toFixed(2)}px`);
  return top;
}
