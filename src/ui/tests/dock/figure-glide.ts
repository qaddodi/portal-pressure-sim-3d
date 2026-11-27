// A Tests card that changes size takes its pictures with it, as a glide, never a snap (owner, 27 Nov, iPhone: the scope picture on the Endoscopy
// card snapped when the sheet was swiped up to make it bigger; it should grow).
// Root cause: the sheet (and the side card's divider) is laid out ONCE at its new size, at the release, and only its edge eases (pull.ts: a transform on the card). Every figure inside is sized by the
// card's height (the scope's circle, the charts' boxes, the belly's dial), so each one jumped from its old size to its new one on the release while the edge glided.
// The one rule, for every figure of every pane: measure each figure's box in the card before the change, make the change in one synchronous flush,
// measure again, and ease each figure from where it was to where it is with `translate` and `scale` alone (from its top-left corner) on the same
// clock, curve and time as the card's edge. FLIP. Pure maths here; the card and its boxes are read once per change, at rest,
// never in a frame. A figure that does not change size or place is left alone; Reduce Motion lands at once (menu/motion.ts glide).
import { flushSync } from 'react-dom';
// @ts-ignore plain JS copied from the 2D app
import { cssCurve, D_SMALL, EASE_ARRIVE } from '../copied/ease.copied.js';
import { glide, type Glide } from '../../menu/motion.ts';
import { readBox } from '../../layout-snap.ts';
import { resyncNow } from '../../layout/resync.ts';

export interface Box { x: number; y: number; w: number; h: number }
/** Where a figure stood against where it stands: a translate and a scale (from its own top-left corner) that put it back. */
export interface Flip { tx: number; ty: number; sx: number; sy: number }

/** Less than this many px of change in a corner or an edge is no change worth easing. */
export const FLIP_EPS = 0.5;

/** The transform that puts a figure now at `to` back where it stood at `from`; null when nothing moved or either box is empty. */
export function flip(from: Box, to: Box): Flip | null {
  if (!(from.w > 0 && from.h > 0 && to.w > 0 && to.h > 0)) return null;
  const f = { tx: from.x - to.x, ty: from.y - to.y, sx: from.w / to.w, sy: from.h / to.h };
  const still = Math.abs(f.tx) < FLIP_EPS && Math.abs(f.ty) < FLIP_EPS && Math.abs(from.w - to.w) < FLIP_EPS && Math.abs(from.h - to.h) < FLIP_EPS;
  return still ? null : f;
}

/** The `translate` and `scale` properties at progress k (0: where it stood, 1: where it stands). The individual properties, not `transform`: a chart that
 *  measures its box divides out an inline `scale` (charts/fit.ts scaleOf) and a style write of `translate` or `scale` never counts as a change of size (sizeStyleMoved), and they compose with any
 *  `transform` the figure's own clock system writes. */
export function flipAt(f: Flip, k: number): { translate: string; scale: string } {
  const j = 1 - k;
  return { translate: `${f.tx * j}px ${f.ty * j}px`, scale: `${1 + (f.sx - 1) * j} ${1 + (f.sy - 1) * j}` };
}
const put = (el: HTMLElement, t: { translate: string; scale: string }): void => { el.style.translate = t.translate; el.style.scale = t.scale; };

/** What a Tests pane draws its pictures in: the charts' boxes (2D `.chart-box`: profile, over time, scope, wall, doppler, HVPG, FibroScan), the Over-time beat card and the belly's dial. */
export const FIGURES = '.dock-pane.active :is(.chart-box, .pt-box, .ab-dial-box)';

/** `data-figure-glide` on a figure while it eases: a box that reads its own height from its rect (Cv.tsx) waits for it to end. */
export const MARK = 'figureGlide';
let running: { runs: Glide[]; els: HTMLElement[] } | null = null;

const clear = (els: HTMLElement[]): void => { for (const e of els) { e.style.translate = ''; e.style.scale = ''; e.style.transformOrigin = ''; delete e.dataset[MARK]; } };
/** Lets go of a glide that is still running (the next change starts from where the pictures are drawn now, which `begin` has read). */
function cancel(): void { if (!running) return; for (const r of running.runs) r.stop(); clear(running.els); running = null; }

/** Reads the card-relative box of every figure now on show, transforms of a glide still running included. */
function read(card: HTMLElement): Map<HTMLElement, Box> {
  const c = readBox(card), m = new Map<HTMLElement, Box>();
  for (const el of card.querySelectorAll<HTMLElement>(FIGURES)) { const b = readBox(el); m.set(el, { x: b.left - c.left, y: b.top - c.top, w: b.width, h: b.height }); }
  return m;
}

/** Makes `change` (it must lay the card out at its new size in this task: flushSync) and eases every figure of the card from its old box to its new one.
 *  `curve` and `ms` default to the sheet's own settle (D_SMALL, the app's arrive curve). Returns whether any figure glides. */
export function glideFigures(card: HTMLElement | null, change: () => void, o: { curve?: (u: number) => number; ms?: number } = {}): boolean {
  if (!card) { change(); return false; }
  const before = read(card);
  cancel();
  change();
  // (the charts measure themselves after the frame; here they take the new size now, so no frame shows a picture of the old size in the new box)
  flushSync(() => resyncNow());
  const after = read(card), flips: { el: HTMLElement; f: Flip }[] = [];
  for (const [el, to] of after) { const from = before.get(el); const f = from && flip(from, to); if (f) flips.push({ el, f }); }
  if (!flips.length) return false;
  const els = flips.map((x) => x.el);
  for (const { el, f } of flips) { el.style.transformOrigin = '0 0'; put(el, flipAt(f, 0)); el.dataset[MARK] = ''; }
  const curve = o.curve ?? (cssCurve(EASE_ARRIVE) as (u: number) => number);
  const slot: { runs: Glide[]; els: HTMLElement[] } = { runs: [], els };
  running = slot;
  slot.runs.push(glide({
    ms: o.ms ?? D_SMALL, curve, tag: 'tests-figure',
    apply: (k) => { for (const { el, f } of flips) put(el, flipAt(f, k)); },
    // (a size that changed while the pictures eased is taken once they are home: the boxes that skipped their measure meanwhile look again)
    done: () => { clear(els); if (running === slot) running = null; resyncNow(); },
  }));
  return true;
}
