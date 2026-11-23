// The data card's dock, ported from the 2D app (presenter.js dockTouch / dockTo, GRIP 34): on a phone or an upright iPad with both cards up, the instrument card follows a finger that pushes it up
// until only its edge (its handle) shows at the top, and follows a finger that pulls down anywhere to bring it back. Let go, it goes where it was heading: a quick flick (over 0.5 px/ms, just before
// letting go) decides by its direction, else how far it got (past half). `lvl` is how far it is docked: 0 open, 1 closed. The card stays up the whole time (it is only slid away by a CSS `translate`,
// and its words fade as it goes: 2D's dockShows), so a drag brings it back from where it is; written per frame on the one clock, transform-class properties and opacity only.

import { clock as theClock, type Clock, type FrameInfo, type Hold } from '../../clock/frame.ts';
import { easeArrive } from '../../clock/tween.ts';
import { GRIP } from '../layout/rules2d.ts';

export const DOCK_MS = 300, OPEN_MS = 380, FLICK = 0.5;
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

/** How far the card travels to its closed place: its whole height but the edge (GRIP px) that stays showing. */
export const closedPx = (h: number): number => Math.max(0, h - GRIP);
/** How much of the card's words show at a level (2D dockShows: whole until it is two thirds shut, then gone by the time it is). */
export const shows = (lvl: number): number => clamp((1 - lvl) / 0.35, 0, 1);
/** Which way the card goes to its closed place: up on a phone or an upright iPad, to the right on a phone on its side (docs/approved/landscape-phone.md). */
export type DockAxis = 'y' | 'x';
/** The card's translate at a level. */
export const translateAt = (lvl: number, px: number, axis: DockAxis = 'y'): string => (axis === 'x' ? `${(lvl * px).toFixed(2)}px 0` : `0 ${(-lvl * px).toFixed(2)}px`);
/** Where a let-go goes: closed (1) or open (0). `v` is the finger's speed in px/ms (up is negative). */
export function settleOf(lvl: number, v: number): 0 | 1 {
  if (Math.abs(v) > FLICK) return v < 0 ? 1 : 0;
  return lvl > 0.5 ? 1 : 0;
}

interface Styled { style: { setProperty(n: string, v: string, p?: string): void; removeProperty(n: string): unknown } }
interface Run { from: number; to: number; elapsed: number; ms: number; done: () => void }

export function createDock(clock: Clock = theClock) {
  let pos: Styled | null = null, inner: Styled | null = null, px = 0, axis: DockAxis = 'y', lvl = 0, run: Run | null = null, hold: Hold | null = null, off: (() => void) | null = null;
  /** Told when a glide sets off (where it goes, how long it takes): the figure's camera sets off on the same clock (2D presenter-zoom.js dockTo: `layout()` then `reframe(ms)` as the glide starts). */
  let onGlide: ((to: 0 | 1, ms: number) => void) | null = null;
  const paint = () => {
    if (!pos) return;
    pos.style.setProperty('transition', 'none', 'important');
    pos.style.setProperty('translate', translateAt(lvl, px, axis));
    // (on its side the card slides under its strip and is gone by the time it lands: only the strip stays at the screen's edge, the rest of the card is not left standing beside it)
    if (axis === 'x') pos.style.setProperty('opacity', (1 - clamp((lvl - 0.85) / 0.15, 0, 1)).toFixed(3));
    if (inner) { inner.style.setProperty('transition', 'none', 'important'); inner.style.setProperty('opacity', shows(lvl).toFixed(3)); }
  };
  const rest = () => {   // (at the open place nothing is left written: the card is as the layout has it)
    if (!pos) return;
    pos.style.removeProperty('transition'); pos.style.removeProperty('translate'); pos.style.removeProperty('opacity');
    if (inner) { inner.style.removeProperty('transition'); inner.style.removeProperty('opacity'); }
  };
  const stop = () => { hold?.release(); hold = null; off?.(); off = null; };
  function step(f: FrameInfo) {
    const r = run;
    if (!r) return;
    r.elapsed += Math.min(f.dt > 0 ? f.dt : 16, clock.hitchCap(50));
    const p = Math.min(1, r.elapsed / r.ms);
    lvl = r.from + (r.to - r.from) * easeArrive(p);
    paint();
    if (p >= 1) { run = null; stop(); land(r.to); r.done(); }
  }
  // (landed: open leaves nothing written; closed leaves the card where it is, as the layout then has it, until the layout says so)
  const land = (to: number) => { lvl = to; if (to === 0) rest(); else paint(); };
  return {
    get lvl() { return lvl; },
    get running() { return !!run; },
    /** Takes a card in hand at a level (a run in progress is taken from where it is). */
    begin(els: { pos: Styled; inner: Styled | null }, closed: number, at: number, along: DockAxis = 'y') {
      if (run) { run = null; stop(); }
      pos = els.pos; inner = els.inner; px = closed; axis = along; lvl = clamp(at, 0, 1);
      paint();
    },
    /** The finger has moved `dy` px since the drag began (down positive; on its side, `dx`, right positive). */
    move(dy: number, lvl0: number) { if (!pos || !(px > 0)) return; lvl = clamp(lvl0 + (axis === 'x' ? dy : -dy) / px, 0, 1); paint(); },   // (up, a negative dy, shuts it; to the right, on its side)
    /** Glides to 0 or 1 (at once under reduced motion), then `done`. */
    glide(to: 0 | 1, ms: number, done: () => void, reduce = false) {
      if (!pos) { done(); return; }
      if (reduce || ms <= 0 || lvl === to) { land(to); done(); return; }
      run = { from: lvl, to, elapsed: 0, ms, done };
      onGlide?.(to, ms);
      if (!off) off = clock.on('tween', step, 25);
      if (!hold) hold = clock.hold('card-dock');
    },
    set onGlide(fn: ((to: 0 | 1, ms: number) => void) | null) { onGlide = fn; },
    /** Lets go of the card (its layout took over). */
    release() { if (run) { run = null; stop(); } pos = null; inner = null; },
  };
}

export const dock = createDock();
