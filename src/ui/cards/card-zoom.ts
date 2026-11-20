// A card zoomed to the middle of the screen: 2D's card-zoom.js, ported (Mac and iPad on its side; Mohammad, 28 Oct: "the camera should like zoom on the
// card to display it centered large in middle of the screen", the text "shouldn't like make the text smaller"). The tapped card and the cards beside it
// glide and grow as one piece by a transform about the tapped card's middle, so its words and pictures only get larger; a veil dims the rest of the page and
// takes the tap back; the figure behind stays where it is. Nothing pauses. Same numbers as 2D: at most 2.2 times, at least 1.2 (under that the card is large
// enough already), the room round it a tenth of the shorter side between 72 and 110 px, 520 ms in on the arrive curve and 440 ms back, a zoom shut part of the
// way in goes back in the part of the time it got. Written on the one clock (tween phase) as inline `translate` and `scale` (they compose with the rail's
// transform and the height glide, which stay untouched). The tap, Esc, a slide change and a resize put it back.

import { useSyncExternalStore } from 'react';
import { clock as theClock, type Clock, type FrameInfo, type Hold } from '../../clock/frame.ts';
import { easeArrive } from '../../clock/tween.ts';

export const ZOOM_MAX = 2.2, ZOOM_MIN = 1.2, ZOOM_MS = 520, SHUT_MS = 440;
export { easeArrive };   // (2D's --ease-arrive: the one curve, clock/tween.ts)

export interface Box { left: number; top: number; width: number; height: number }
export interface Cur { dx: number; dy: number; s: number }

export const reverseMs = (full: number, curS: number, planS: number): number => Math.round(full * Math.max(0.35, Math.min(1, (curS - 1) / ((planS - 1) || 1))));
export const zoomMargin = (area: Box): number => Math.min(110, Math.max(72, 0.1 * Math.min(area.width, area.height)));
export const fitScale = (box: Box, area: Box, margin = zoomMargin(area)): number => Math.min((area.width - 2 * margin) / box.width, (area.height - 2 * margin) / box.height);

/** Where the card goes and how much it grows ({ s, dx, dy }: dx, dy from the card's middle to the area's), or null when it would grow under ZOOM_MIN. */
export function zoomPlan(card: Box, area: Box, margin = zoomMargin(area)): Cur | null {
  if (!(card.width > 0) || !(card.height > 0) || !(area.width > 0) || !(area.height > 0)) return null;
  const s = Math.min(ZOOM_MAX, fitScale(card, area, margin));
  if (!(s >= ZOOM_MIN)) return null;
  return { s, dx: area.left + area.width / 2 - (card.left + card.width / 2), dy: area.top + area.height / 2 - (card.top + card.height / 2) };
}

/** What a tap leaves alone: controls, and anything drawn to be pressed. */
export const LIVE = 'a[href], button, input, select, textarea, label, summary, [role="button"], [role="slider"], [role="tab"], [role="switch"], [role="checkbox"], [contenteditable="true"], .range-wrap, .pz-lip, [data-no-zoom]';
/** Whether a tap that came down on `target` (inside `card`) is on an empty part of the card, so it zooms it. */
export function emptyTap(target: EventTarget | null, card: Element): boolean {
  for (let n = target as Element | null; n && n !== card; n = n.parentElement) {
    if (n.matches?.(LIVE)) return false;
    if (n.nodeType === 1 && globalThis.getComputedStyle?.(n).cursor === 'pointer') return false;
  }
  return true;
}

interface Styled { style: { setProperty(n: string, v: string): void; removeProperty(n: string): unknown }; getBoundingClientRect(): Box }
interface Rider { els: Styled[]; rest: Box; focus: boolean }
interface Run { from: Cur; to: Cur; elapsed: number; ms: number; done: () => void }

export function createCardZoom(clock: Clock = theClock) {
  let st: { riders: Rider[]; plan: Cur; cur: Cur; cx: number; cy: number; run: Run | null; closing: Promise<void> | null; veil: { classList: { add(c: string): void; remove(c: string): void } } | null; mark: { dataset: Record<string, string | undefined> } | null } | null = null;
  let hold: Hold | null = null, off: (() => void) | null = null;
  const lerp = (r: Run, e: number): Cur => ({ dx: r.from.dx + (r.to.dx - r.from.dx) * e, dy: r.from.dy + (r.to.dy - r.from.dy) * e, s: r.from.s + (r.to.s - r.from.s) * e });
  const paint = () => {
    if (!st) return;
    const c = st.cur, rest = c.s === 1 && c.dx === 0 && c.dy === 0;
    for (const r of st.riders) for (const el of r.els) {
      if (rest) { el.style.removeProperty('translate'); el.style.removeProperty('scale'); }
      else { el.style.setProperty('translate', `${c.dx.toFixed(2)}px ${c.dy.toFixed(2)}px`); el.style.setProperty('scale', c.s.toFixed(4)); }
    }
  };
  function step(f: FrameInfo) {
    const m = st?.run;
    if (!st || !m) return;
    m.elapsed += Math.min(f.dt > 0 ? f.dt : 16, 50);   // (a stalled frame counts at most 50 ms: the glide goes on from where it was, never jumps)
    const p = Math.min(1, Math.max(0, m.elapsed / m.ms));
    st.cur = lerp(m, easeArrive(p));
    paint();
    if (p >= 1) { st.run = null; sleep(); m.done(); }
  }
  const wake = () => { if (!off) off = clock.on('tween', step, 30); if (!hold) hold = clock.hold('card-zoom'); };
  const sleep = () => { hold?.release(); hold = null; off?.(); off = null; };
  function drive(to: Cur, ms: number): Promise<void> {
    return new Promise((done) => {
      if (!st) { done(); return; }
      st.run?.done();
      if (!(ms > 0)) { st.cur = { ...to }; st.run = null; paint(); sleep(); done(); return; }
      st.run = { from: { ...st.cur }, to, ms, elapsed: 0, done };
      wake();
    });
  }
  function end() {
    if (!st) return;
    const s = st; st = null;
    s.run?.done(); sleep();
    for (const r of s.riders) for (const el of r.els) { el.style.removeProperty('translate'); el.style.removeProperty('scale'); el.style.removeProperty('transform-origin'); }
    s.veil?.classList.remove('on');
    if (s.mark) delete s.mark.dataset.cardZoom;
  }
  return {
    get on() { return !!st; },
    get up() { return !!st && !st.closing; },
    get scale() { return st ? st.cur.s : 1; },
    /** Zooms `focus` (a card's elements) to the middle, `others` riding with it. Returns false when the card would not grow enough. */
    open(o: { focus: Styled[]; others: Styled[][]; area: Box; reduce?: boolean; veil?: { classList: { add(c: string): void; remove(c: string): void } } | null; mark?: { dataset: Record<string, string | undefined> } | null }): boolean {
      if (st) return false;
      const box = o.focus[0]!.getBoundingClientRect();
      const plan = zoomPlan(box, o.area);
      if (!plan) return false;
      const cx = box.left + box.width / 2, cy = box.top + box.height / 2;
      const riders: Rider[] = [{ els: o.focus, rest: box, focus: true }, ...o.others.map((els) => ({ els, rest: els[0]!.getBoundingClientRect(), focus: false }))];
      st = { riders, plan, cur: { dx: 0, dy: 0, s: 1 }, cx, cy, run: null, closing: null, veil: o.veil ?? null, mark: o.mark ?? null };
      for (const r of riders) for (const el of r.els) el.style.setProperty('transform-origin', `${(cx - r.rest.left).toFixed(2)}px ${(cy - r.rest.top).toFixed(2)}px`);
      if (st.mark) st.mark.dataset.cardZoom = '';
      st.veil?.classList.add('on');
      void drive(plan, o.reduce ? 0 : ZOOM_MS);
      return true;
    },
    /** Glides back (at once with `instant`). Resolves when the cards are where they were. */
    close(o: { instant?: boolean; reduce?: boolean } = {}): Promise<void> {
      if (!st) return Promise.resolve();
      if (st.closing) return st.closing;
      const s = st;
      s.veil?.classList.remove('on');
      if (o.instant || o.reduce) { end(); return Promise.resolve(); }
      const ms = reverseMs(SHUT_MS, s.cur.s, s.plan.s);
      s.closing = Promise.race([drive({ dx: 0, dy: 0, s: 1 }, ms), new Promise<void>((r) => setTimeout(r, ms + 200))]).then(() => { if (st === s) end(); });
      return s.closing;
    },
    /** Everything put back at once (a slide or a resize comes first). */
    reset() { if (st) { st.veil?.classList.remove('on'); end(); } },
  };
}

/** Whether a card zoom is up or on its way (body[data-card-zoom], which `open` writes and `end` takes off): the corner button's aria-expanded and its swapped icon follow it. */
export function useCardZoomOn(): boolean {
  return useSyncExternalStore(
    (notify) => { if (typeof MutationObserver !== 'function') return () => {}; const mo = new MutationObserver(notify); mo.observe(document.body, { attributes: true, attributeFilter: ['data-card-zoom'] }); return () => mo.disconnect(); },
    () => typeof document !== 'undefined' && document.body.dataset.cardZoom !== undefined,
    () => false,
  );
}

/** The talk's one card zoom. */
export const cardZoom = createCardZoom();
