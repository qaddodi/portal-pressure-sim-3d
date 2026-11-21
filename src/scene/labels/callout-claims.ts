// The room the figure's callouts (a slide's marks, sites, steps, calipers and brackets: figure-cards.ts) have taken, as boxes in canvas px. Every other writer on the
// figure keeps off them: the anatomy's station names already do (their blockers); the Circuit's captions read the same list here, so a callout never lies on a caption.
// Callouts place first (they stand at a point the slide names), the captions stand round them.
import type { Box } from './geometry.ts';

let boxes: readonly Box[] = [];
const subs = new Set<() => void>();
const key = (b: readonly Box[]) => b.map((x) => `${Math.round(x.x0)},${Math.round(x.y0)},${Math.round(x.x1)},${Math.round(x.y1)}`).join(';');

export const calloutClaims = {
  /** The boxes the callouts stand in now. */
  get boxes(): readonly Box[] { return boxes; },
  /** Written by the callouts' solve; a change tells the listeners (the captions place again at rest). */
  set(next: readonly Box[]): void { if (key(next) === key(boxes)) return; boxes = next.slice(); for (const f of subs) f(); },
  subscribe(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; },
};
