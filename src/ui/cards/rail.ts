// The cards' rail: how a slide change moves the cards, ported from the 2D app's card-throw.js (same distances, times, curve, stagger and
// direction), then refined. Every card that moves (its glass-and-words box and its shadow plate) is moved here, by an inline transform
// and opacity written in the clock's tween phase: no CSS animation runs on a card, so the box and its shadow never part, and a long frame
// holds them together. A card already moving is taken from wherever it is (Next pressed mid-entrance, a swipe let go): its next move
// starts from there, never from a jump.
//
// 2D's rules kept: the old cards ride out along one rail, a card's width and a gap (24 px) away, 560 ms on cubic-bezier(.32,.72,0,1),
// gone from sight by 85 % of their way; the new cards come in from THROW_IN px to the side the talk comes from, whole by 40 % of their
// way, the second card 40 ms behind the first. Forward goes right to left, back goes left to right.
// Refined on top of 2D: a data card travels a little less far than the words (a slight parallax, so the two never move as one slab),
// a finger drags the cards the whole way with a soft stop rather than a quarter of its travel, and a swipe commits on where the card
// would come to rest from the finger's speed, so a short quick flick goes on and a slow drag let go short springs back.

import { clock as theClock, type Clock, type FrameInfo, type Hold } from '../../clock/frame.ts';
import { cubicBezier } from '../../clock/tween.ts';
import { D_SMALL } from '../a11y/motion.ts';
import { EASE_RAIL } from '../motion.ts';

/** The most one frame may count toward a move: a stalled frame holds the cards where they were and the move goes on from there, never jumps to its end (2D card-throw.js easeNow). */
export const MAX_DT = 50;
/** A card whose height changes glides to it over 2D's glideCard time (card-glide.js: D_SURFACE, 420 ms) on the arrive curve (clock/tween.ts ARRIVE_CSS). */
export const GLIDE_MS = 420;
export const RAIL_MS = 560, OUT_MS = 340, IN_MS = 520, RAIL_GAP = 24, THROW_IN = 56, THROW_OUT = 56, FIRST_MS = 640, FIRST_RISE = 14, STAGGER = 40, BACK_MS = 280, FADE_MS = 300, FADE_DELAY = 120;
/** How far a card travels, as a share of the words' distance, on the rail (and under a finger). */
export const PARALLAX = { words: 1, data: 0.82 } as const;
export const easeRail = cubicBezier(0.32, 0.72, 0, 1);
/** The curve as CSS, and when the old cards are wholly gone (their fade ends at 80 % of their move): a card the talk keeps glides to its new place then, with the new cards. */
export const RAIL_CSS = EASE_RAIL;
export const OUT_DONE = Math.round(0.8 * OUT_MS);

export type Kind = 'out' | 'in' | 'back';
export interface Pt { x: number; o: number }

/** Where a card is at k (0 to 1) of its move: out, gone by 80 % of its time; in, whole by 60 % of its time (a smooth fade on time); back, fading over the whole move. Written into `out`. */
export function throwInto(out: Pt, kind: Kind, k: number, from: Pt, to: Pt): Pt {
  k = k <= 0 ? 0 : k >= 1 ? 1 : k;
  // the slide is front-loaded (easeRail), the fade is not: it runs on time through the move's first part, so a card never pops to 0 or 1 in a frame or two
  const e = easeRail(k), u = Math.min(1, k / (kind === 'out' ? 0.8 : kind === 'in' ? 0.6 : 1)), f = u * u * (3 - 2 * u);
  out.x = from.x + (to.x - from.x) * e;
  out.o = from.o + (to.o - from.o) * f;
  return out;
}
export const throwAt = (kind: Kind, k: number, from: Pt, to: Pt): Pt => throwInto({ x: 0, o: 0 }, kind, k, from, to);

/** Which way a move goes: +1 forward (cards leave to the left, come in from the right), -1 back. */
export type Dir = 1 | -1;

/** The finger's drag: the card follows it the whole way, finger-true at first, easing to a stop at `max` px; it fades with the travel. */
export function followOf(dx: number, w: number, out: Pt = { x: 0, o: 1 }): Pt {
  const max = Math.min(140, Math.max(60, 0.3 * w));
  const a = Math.abs(dx);
  out.x = (dx < 0 ? -1 : 1) * max * (1 - Math.exp(-a / max)) || 0;
  out.o = 1 - 0.15 * Math.min(1, Math.abs(out.x) / max);   // (a card stays a card under the finger: it only dims a little)
  return out;
}

/** Where a swipe let go goes: forward, back, or nowhere. It has to be mostly sideways; the card is judged by where its speed would carry it to
 *  rest (140 ms on), and a flick back the way it came cancels it. */
export function commitOf(dx: number, dy: number, vx: number): 'next' | 'back' | null {
  const ax = Math.abs(dx);
  if (ax < 14 || ax < 1.5 * Math.abs(dy)) return null;
  if (Math.sign(vx) === -Math.sign(dx) && Math.abs(vx) >= 0.6) return null;
  const rest = dx + vx * 140;
  if (Math.sign(rest) !== Math.sign(dx) || Math.abs(rest) < 72) return null;
  return dx < 0 ? 'next' : 'back';
}

/** The finger's speed (px/ms) over the last 100 ms of its samples [x, t]. */
export function speedOf(pts: ReadonlyArray<readonly [number, number]>): number {
  if (pts.length < 2) return 0;
  const [x1, t1] = pts[pts.length - 1]!;
  let i = pts.length - 2;
  while (i > 0 && t1 - pts[i]![1] < 100) i--;
  const [x0, t0] = pts[i]!;
  return t1 > t0 ? (x1 - x0) / (t1 - t0) : 0;
}

/** What the rail writes to: the style of an element. */
export interface Styled { style: { setProperty(n: string, v: string, p?: string): void; removeProperty(n: string): unknown; transform: string; opacity: string } }

interface Run { kind: Kind; els: Styled[]; par: number; from: Pt; to: Pt; /** ms of the clock's own time the move has had (a long frame counts at most MAX_DT, so a stall never eats a move) */ elapsed: number; delay: number; ms: number; x: number; o: number; done?: () => void; /** a gentle rise (px) the card has while it is not yet whole: the first card of a talk */ rise?: number; /** a way in that waits for every card on its way out to be gone, then sets off after this many ms */ after?: number }

export function createRail(clock: Clock = theClock) {
  const runs = new Map<Styled, Run>();   // keyed by the group's first element
  const log: string[] = [];   // (which moves ran, newest last: window.__rail.log in the page, for a measurement)
  let hold: Hold | null = null, off: (() => void) | null = null;
  const pos: Pt = { x: 0, o: 0 };

  // (A card moved here has NO CSS transition on transform or opacity while it moves: the lifted 2D rules give `.pz-shade.pz-card` a 420 ms transition after a 120 ms
  // delay, and a transition restarted by every frame's write never gets going: the card stood still and then faded at its place. 2D's card-throw.js writes
  // `transition: none` first for the same reason.)
  const put = (els: Styled[], x: number, o: number, par: number, rise = 0) => {
    const tx = `translateX(${(x * par).toFixed(2)}px)${rise ? ` translateY(${((1 - o) * rise).toFixed(2)}px)` : ''}`, op = o <= 0 ? '0' : o >= 1 ? '1' : o.toFixed(3);
    for (const el of els) { el.style.setProperty('transition', 'none', 'important'); el.style.setProperty('transform', tx); el.style.setProperty('opacity', op); }
  };
  const clear = (els: Styled[]) => { for (const el of els) { el.style.removeProperty('transform'); el.style.removeProperty('opacity'); el.style.removeProperty('transition'); } };
  const here = (els: Styled[], par = 1): Pt => {
    const r = runs.get(els[0]!);
    if (r) return { x: r.x, o: r.o };
    const st = els[0]!.style, m = /translateX\((-?[\d.]+)px\)/.exec(st.transform || ''), o = parseFloat(st.opacity);
    return { x: m ? +m[1]! / par : 0, o: Number.isFinite(o) ? o : 1 };
  };
  function land(r: Run) {
    runs.delete(r.els[0]!);
    if (r.kind === 'out') put(r.els, r.to.x, r.to.o, r.par, r.rise); else clear(r.els);
    try { r.done?.(); } finally { if (!runs.size) sleep(); }
  }
  const anyOut = () => { for (const r of runs.values()) if (r.kind === 'out') return true; return false; };
  function step(f: FrameInfo) {
    // the new cards go in only when the old are wholly out (2D waits for throwsOut()): no card ever lies over another
    if (!anyOut()) for (const r of runs.values()) if (r.after != null) { r.delay = r.after; r.elapsed = 0; r.after = undefined; }
    const dt = Math.min(f.dt > 0 ? f.dt : 16, clock.hitchCap(MAX_DT));
    for (const r of [...runs.values()]) {
      if (r.after != null) continue;
      r.elapsed += dt;
      const k = r.ms > 0 ? (r.elapsed - r.delay) / r.ms : 1;
      if (k < 0) continue;   // (a staggered card waits where it starts)
      throwInto(pos, r.kind, k, r.from, r.to);
      r.x = pos.x; r.o = pos.o;
      if (k >= 1 || (r.kind === 'out' && pos.o <= 0.001)) land(r); else put(r.els, pos.x, pos.o, r.par, r.rise);
    }
  }
  function wake() {
    if (!off) off = clock.on('tween', step, 20);
    if (!hold) hold = clock.hold('card-rail');
  }
  function sleep() { hold?.release(); hold = null; off?.(); off = null; }
  function start(els: Styled[], kind: Kind, from: Pt, to: Pt, ms: number, delay: number, par: number, done?: () => void, rise = 0) {
    const key = els[0]!;
    runs.delete(key);
    put(els, from.x, from.o, par, rise);   // (at once, in the task that starts it: no frame shows the card's own place first)
    log.push(`${kind} ${Math.round(from.x * par)}->${Math.round(to.x * par)}px ${ms}ms delay ${delay}${anyOut() && kind === 'in' ? ' (after the old cards)' : ''}`); if (log.length > 40) log.shift();
    runs.set(key, { kind, els, par, from, to, elapsed: 0, delay, ms, x: from.x, o: from.o, done, rise, after: kind === 'in' && anyOut() ? delay : undefined });
    wake();
  }

  return {
    /** Brings a card in from the side the talk comes from (dir 1: from the right), after `delay` ms. `fade`: no slide, only the fade (the first card, reduced motion). */
    enter(els: Styled[], o: { dir: Dir; delay?: number; par?: number; reduce?: boolean; fresh?: boolean; done?: () => void }) {
      const was = runs.get(els[0]!), par = o.par ?? 1;
      if (was && was.kind !== 'out') { was.done = o.done ?? was.done; return; }   // (already coming in: left alone, never restarted from nothing)
      if (o.reduce) { start(els, 'back', was ? here(els, par) : { x: 0, o: 0 }, { x: 0, o: 1 }, D_SMALL, 0, par, o.done); return; }
      // the first cards of a talk are not thrown in from a side: they fade into view where they stand, rising a little (the data card 40 ms behind)
      if (o.fresh && !was) { start(els, 'back', { x: 0, o: 0 }, { x: 0, o: 1 }, FIRST_MS, o.delay ?? 0, par, o.done, FIRST_RISE); return; }
      // (a card's travel is the same on screen whatever its parallax: its offsets are divided by it)
      const at = was ? here(els, par) : { x: (o.dir * THROW_IN) / par, o: 0 };
      start(els, 'in', at, { x: 0, o: 1 }, IN_MS, was ? 0 : o.delay ?? 0, par, o.done);
    },
    /** Sends a card out the way the talk goes, from where it stands (a finger's place included); `done` when it is out of sight. */
    leave(els: Styled[], o: { dir: Dir; dist?: number; par?: number; reduce?: boolean; done?: () => void }) {
      const par = o.par ?? 1, from = here(els, par);
      if (o.reduce) { start(els, 'out', from, { x: from.x, o: 0 }, D_SMALL, 0, 1, o.done); return; }
      // A finger's place is carried ON the way it was going: a card dragged 120 px left goes on left, never back toward a fixed end (that put its end at 56 px, so a card the finger had taken further
      // went left, then drifted right as it faded: Mohammad, 20 Nov, "it goes to the left then bounces right before disappearing"). From its own place, or a drag the other way, it is the usual 56 px.
      const by = (-o.dir * THROW_OUT) / par;
      start(els, 'out', from, { x: Math.sign(from.x) === Math.sign(by) ? from.x + by : by, o: 0 }, OUT_MS, 0, par, o.done);
    },
    /** A card let go short of a swipe eases back to its place from where the finger left it. */
    back(els: Styled[], x: number, o: number, par = 1) { start(els, 'back', { x, o }, { x: 0, o: 1 }, BACK_MS, 0, par); },
    /** A finger holds the card at (x, o) (already scaled by the caller's parallax: the rail applies `par`). */
    drag(els: Styled[], x: number, o: number, par = 1) {
      runs.delete(els[0]!);
      if (!runs.size) sleep();
      put(els, x, o, par);
    },
    /** Where the card's inline move stands now. */
    at: here,
    moving: (els: Styled[]) => runs.has(els[0]!),
    /** Lets go of a card (it is gone, or at rest): its inline values go. */
    forget(els: Styled[]) { runs.delete(els[0]!); if (!runs.size) sleep(); },
    log,
    /** Steps the runs by hand (a test's frame). */
    step,
    get busy() { return runs.size; },
  };
}

export const rail = createRail();
if (typeof window !== 'undefined') (window as unknown as { __rail?: { log: string[] } }).__rail = { log: rail.log };
