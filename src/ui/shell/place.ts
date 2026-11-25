// Where a floating menu sits beside its button: 2D util.js placeAt (the one placer, for the popover, the main menu and the Why card) and the placing step of util.js popover (`put`: a
// settings-style menu below its button takes the room down to the bar or the stage's foot, and opens above a button that is low on the screen), ported line for line. Written once as a
// menu opens and on a resize: `translate` from the window's corner (left and top are never written, so nothing is laid out), clear of the notch (env() is 0 elsewhere).
import { clamp } from '../tests/copied/num.copied.js';

/** The bottom of what is visible: above the on-screen keyboard on iOS, where innerHeight does not shrink (util.js visibleBottom). */
export const visibleBottom = (): number => {
  const v = typeof window !== 'undefined' ? window.visualViewport : null;
  if (!v) return innerHeight;
  const { offsetTop: top, height } = v;
  return Math.min(innerHeight, top + height);
};

/** The lowest a floating menu or card may reach (util.js stageBottom): the free stage's foot, above the bottom bar, for a menu that opens from the top bars; the visible bottom for one that
 *  opens from the dock itself. (2D reads its free-stage record; here the dock's own top is the stage's foot.) */
export function stageBottom(anchor: Element | null, doc: Document = document): number {
  const vb = visibleBottom();
  if (anchor?.closest?.('.vdock, .thumb-bar')) return vb;
  const dock = doc.getElementById('vdock');
  const d = dock && dock.getClientRects().length ? dock.getBoundingClientRect() : null;
  return d && d.height ? Math.min(vb, d.top) : vb;
}

export interface PlaceOpts { side?: 'below' | 'above'; align?: 'start' | 'center' | 'end'; gap?: number; margin?: number; edge?: number | null; flip?: boolean }

/**
 * Puts el by translate from the window's corner and returns the top it took. side: 'below' | 'above' the button; align: 'start' | 'center' | 'end'; gap: px between the two; margin: the least
 * clearance from the window's edges; edge: a line to sit on or under instead of the button's own top (the tab row's); flip: opens on the other side, and keeps clear of the bottom, where
 * there is no room (false: placed where asked, only its left held in). Its entrance is opacity alone (scale-settle) or a sheet's slide, so no transform-origin is set.
 */
export function placeAt(el: HTMLElement, anchor: HTMLElement, { side = 'below', align = 'start', gap = 8, margin = 8, edge = null, flip = true }: PlaceOpts = {}): number {
  const r = anchor.getBoundingClientRect();
  // (Layout size, not the rectangle: an entrance may be moving the box.)
  const w = el.offsetWidth, hh = el.offsetHeight, vb = stageBottom(anchor), cw = document.documentElement.clientWidth || innerWidth;
  const x = align === 'end' ? r.right - w : align === 'center' ? r.left + r.width / 2 - w / 2 : r.left;
  const top0 = edge ?? r.top;
  let y = side === 'above' ? top0 - hh - gap : r.bottom + gap;
  if (flip) {
    if (y + hh > vb - margin) y = Math.max(margin, top0 - hh - gap);
    y = clamp(y, margin, vb - hh - margin);
  }
  const leftCss = `clamp(calc(${margin}px + var(--safe-l)), ${x}px, calc(${cw - w - margin}px - var(--safe-r)))`;
  el.style.translate = `${leftCss} ${y}px`;
  return y;
}

/** util.js popover `put`: a menu (not a sheet) by its button. A `.app-menu` below its button uses all the room down to the bar or the stage's foot (and at least 160 px), so it ends whole where it
 *  fits, and opens above a button low on the screen at its full height; one from the thumb dock's tab row rests 8 px above the whole dock. It comes in with a 4 px rise from its button's side. */
export function placePopover(el: HTMLElement, anchor: HTMLElement, { align = 'start', place = 'below' }: { align?: 'start' | 'center' | 'end'; place?: 'below' | 'above' } = {}): number {
  const r = anchor.getBoundingClientRect(), w0 = el.offsetWidth;
  const x = align === 'end' ? r.right - w0 : align === 'center' ? r.left + r.width / 2 - w0 / 2 : r.left;
  // A scrolling menu below its button may use all the room down to the 8 px margin, so it ends whole where it fits; never over the bottom bar where the two meet.
  let barTop: number | null = null, at = place;
  if (place === 'below' && el.classList.contains('app-menu')) {
    const dock = document.getElementById('vdock'), d = dock && dock.getClientRects().length ? dock.getBoundingClientRect() : null, xl = clamp(x, 8, innerWidth - w0 - 8);
    if (d && d.height && d.left < xl + w0 && d.right > xl && d.top < visibleBottom()) barTop = d.top;
    // A button low on the screen (the deck nav pill's gear on a Mac or iPad) opens it above, at its full height: below it the room was the 160 px floor.
    const below = (barTop ?? stageBottom(anchor)) - r.bottom - 16;
    if (below < el.scrollHeight && r.top - 16 > below) { at = 'above'; barTop = null; el.style.maxHeight = `${r.top - 16}px`; }
    else el.style.maxHeight = `${Math.max(160, below)}px`;
  }
  // A menu from the thumb dock's tab row rests 8 px above the whole dock (the play bar and timeline stay up under it), like the cards and the phone's sheets.
  const bar = anchor.closest('.thumb-bar'), dockEl = bar && bar.closest('.vdock'), tabTop = bar ? (dockEl || bar).getBoundingClientRect().top : null;
  if (bar && /auto|scroll/.test(getComputedStyle(el).overflowY)) el.style.maxHeight = `${Math.max(160, (tabTop as number) - 16)}px`;
  const top = placeAt(el, anchor, { side: at === 'above' || bar ? 'above' : 'below', align, edge: bar ? tabTop : null });
  // (It comes in with a 4 px rise from its button's side: down from a button above it, up from one below it.)
  el.style.setProperty('--pop-y', top < r.top ? '4px' : '-4px');
  // Ending just above the bar, the menu's shadow stops at the bar's top edge, so the bar itself stays as it was (the clip itself is CSS, `.menu.app-menu`; only the gap it reads is written).
  const gap = barTop == null ? 0 : barTop - (top + el.offsetHeight);
  el.style.setProperty('--bar-clip', barTop == null ? '' : `${(-Math.max(0, gap)).toFixed(2)}px`);
  return top;
}
