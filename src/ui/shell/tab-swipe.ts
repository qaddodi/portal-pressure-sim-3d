// One sideways swipe for every tab strip that has panes the finger can reach (owner, 23 Nov: "can swipe between tabs of menus on touch screens basically"). The Tests card's tabs (tests/dock/swipe.ts) and the main
// menu's Present / Patients (menu/swipe-tabs.ts) page with the finger; this is the same rule for a card whose tabs change by a cross-fade (Treat): a clear sideways swipe goes to the next tab on the left, the
// one before it on the right, and the tab's own change plays (the strip's gliding piece follows because the tab is chosen the way a tap chooses it). A vertical move is left alone (the list's scroll, the
// sheet's pull down), and a slider, a field or a box that scrolls sideways keeps its own drags (ownsSideways). Touch events are only sent by a touch screen, so a mouse never swipes.
// @ts-ignore plain JS copied from the 2D app
import { ownsSideways, swipeDir } from '../menu/swipe.copied.js';
import { clock } from '../../clock/frame.ts';

// @ts-ignore the copied helper types `stop` as null from its default
const owns = (el: EventTarget | null, stop: Element): boolean => !!ownsSideways(el, { stop });
const dirOf = (dx: number, dy: number, ms: number): -1 | 0 | 1 => (swipeDir(dx, dy, ms) as -1 | 0 | 1);
const MOVE = 8;

/** The tab a swipe goes to: `dir` +1 (swipe left) is the next, -1 the one before; null at either end or when the swipe is not one. */
export function neighbourTab<T>(ids: readonly T[], cur: T, dir: -1 | 0 | 1): T | null {
  const i = ids.indexOf(cur);
  if (i < 0 || !dir) return null;
  return ids[i + dir] ?? null;
}

export interface TabSwipeOpts {
  /** read at the touch: false while something else owns the card (a page over the tabs, a closed card) */
  enabled(): boolean;
  /** a swipe went to the next (+1) or the previous (-1) tab */
  step(dir: 1 | -1): void;
}

/** Wires the swipe to a card. Returns the remover. */
export function attachTabSwipe(el: HTMLElement, o: TabSwipeOpts): () => void {
  let s: { x: number; y: number; t: number; claimed: boolean } | null = null;
  const onStart = (e: TouchEvent) => {
    s = e.touches.length === 1 && o.enabled() && !owns(e.target, el)
      ? { x: e.touches[0]!.clientX, y: e.touches[0]!.clientY, t: clock.now(), claimed: false }
      : null;
  };
  const onMove = (e: TouchEvent) => {
    const g = s, t = e.touches[0];
    if (!g || !t) return;
    if (e.touches.length !== 1) { s = null; return; }
    const dx = t.clientX - g.x, dy = t.clientY - g.y;
    if (!g.claimed) {
      if (Math.hypot(dx, dy) < MOVE) return;
      if (Math.abs(dx) < Math.abs(dy) * 1.2) { s = null; return; }   // (vertical: the scroll or the pull down, never ours)
      g.claimed = true;
    }
    if (e.cancelable) e.preventDefault();   // (the browser must not scroll or pan under a sideways swipe)
  };
  const onEnd = (e: TouchEvent) => {
    const g = s; s = null;
    const t = e.changedTouches[0];
    if (!g?.claimed || !t) return;
    const d = dirOf(t.clientX - g.x, t.clientY - g.y, clock.now() - g.t);
    if (d) o.step(d);
  };
  const onCancel = () => { s = null; };
  el.addEventListener('touchstart', onStart, { passive: true });
  el.addEventListener('touchmove', onMove, { passive: false });
  el.addEventListener('touchend', onEnd, { passive: true });
  el.addEventListener('touchcancel', onCancel, { passive: true });
  return () => {
    el.removeEventListener('touchstart', onStart); el.removeEventListener('touchmove', onMove);
    el.removeEventListener('touchend', onEnd); el.removeEventListener('touchcancel', onCancel);
  };
}
