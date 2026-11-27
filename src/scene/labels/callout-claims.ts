// The room the figure's callouts (a slide's marks, sites, steps, calipers and brackets: figure-cards.ts) have taken, as boxes in canvas px. Every other writer on the
// figure keeps off them: the anatomy's station names already do (their blockers); the Circuit's captions read the same list here, so a callout never lies on a caption.
// Callouts place first (they stand at a point the slide names), the captions stand round them.
import type { Box } from './geometry.ts';

let boxes: readonly Box[] = [];
let rings: readonly Box[] = [];
const subs = new Set<() => void>();
const key = (b: readonly Box[]) => b.map((x) => `${Math.round(x.x0)},${Math.round(x.y0)},${Math.round(x.x1)},${Math.round(x.y1)}`).join(';');

export const calloutClaims = {
  /** The boxes the callouts stand in now. */
  get boxes(): readonly Box[] { return boxes; },
  /**
   * The room each ring callout's ring has taken (a square round the ring): a wall for a name's BOX like every box above, but kept apart because the dots of what the ring
   * names stand INSIDE it by design (the portal tract's venule, arteriole and ductule under "Resistance"). A writer hands these to the solver as `encircled`, never as
   * `blockers`: a dot under a blocker has nothing to label and its name is hidden, which made the tract's names vanish the moment the callout's claim arrived (27 Nov).
   */
  get rings(): readonly Box[] { return rings; },
  /** Written by the callouts' solve; a change tells the listeners (the captions place again at rest). */
  set(next: readonly Box[], ringRooms: readonly Box[] = []): void {
    if (key(next) === key(boxes) && key(ringRooms) === key(rings)) return;
    boxes = next.slice(); rings = ringRooms.slice();
    for (const f of subs) f();
  },
  subscribe(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn); }; },
};
