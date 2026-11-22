// The room the corner credit (the © line, ui/shell/Credit.tsx) takes on the figure, as a box in canvas px. It is fixed chrome like the bars and the view pill, so every writer of words on the figure keeps off it:
// the Anatomy's station names, the Circuit's captions and the Lobule's names read it as a blocker (a leader never runs under it either: the solver's blockers).
// The credit places first (it hunts for a bare corner among what stands now) and writes its box once it has settled there; a hidden credit (covered, or fading to its next spot) claims nothing.
import type { Box } from './geometry.ts';

/** Air kept round the line, px (the bars' own, ui-walls.ts UI_WALL_PAD). */
export const CREDIT_PAD = 4;
let boxes: readonly Box[] = [];
const subs = new Set<() => void>();
const key = (b: readonly Box[]) => b.map((x) => `${Math.round(x.x0)},${Math.round(x.y0)},${Math.round(x.x1)},${Math.round(x.y1)}`).join(';');

export const creditClaim = {
  /** The credit's box now: empty while it is hidden. */
  get boxes(): readonly Box[] { return boxes; },
  /** Written by the credit when it has put itself (at the top-left corner x, y, w by h px), or null when it is hidden; a change tells the listeners (the words place again at rest). */
  set(at: { x: number; y: number; w: number; h: number } | null): void {
    const next = at ? [{ x0: at.x - CREDIT_PAD, y0: at.y - CREDIT_PAD, x1: at.x + at.w + CREDIT_PAD, y1: at.y + at.h + CREDIT_PAD }] : [];
    if (key(next) === key(boxes)) return;
    boxes = next;
    for (const f of subs) f();
  },
  subscribe(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; },
};
