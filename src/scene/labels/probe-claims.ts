// The room the Doppler probe takes on the figure once it has settled (owner, 23 Nov 2026: "labels should be clear of it if possible"): its body, its line of sight and the sample gate, as boxes in stage px. The
// label solver and the figure's cards read the list as blockers, so the names and callouts that are placed AFTER the probe stands go around it, and the ones that stood there first ease to a clear spot at the next
// rest (the labels' own STAY and ease; none jumps). The probe itself never moves for them (devices/probes/doppler-probe.ts picks its place once). Boxes are grown outward to an 8 px grid, so the view's gentle
// drift (the tilt) does not change them every frame and ask the solver again. Pure data and arithmetic: node judges it.
import type { Box } from './geometry.ts';

/** The grid the claimed boxes snap outward to, px. */
export const CLAIM_GRID = 8;
/** The most boxes a probe claims (its body, the stretches of its line of sight, the gate). */
export const CLAIM_CAP = 12;
/** How far a box may wander (px) and still be the same box, widened rather than replaced. */
export const CLAIM_STAY = 16;

let boxes: readonly Box[] = [];
const key = (b: readonly Box[]): string => b.map((x) => `${x.x0},${x.y0},${x.x1},${x.y1}`).join(';');

export const probeClaims = {
  /** The boxes the settled probe stands in now (empty while it is not placed or is leaving). */
  get boxes(): readonly Box[] { return boxes; },
  /** Written each frame by the probe layer; a place that has not moved past the grid changes nothing. */
  set(next: readonly Box[]): void {
    if (key(next) === key(boxes)) return;
    // (a box of the same probe that has only wandered a little keeps the room it had and widens to take in the new: the view's drift asks the solver a couple of times, not at every grid line it crosses;
    //  a box that has moved on, or a different count of them, is taken as it is)
    const near = next.length === boxes.length && next.every((n, i) => { const o = boxes[i]!; return Math.abs(n.x0 - o.x0) <= CLAIM_STAY && Math.abs(n.y0 - o.y0) <= CLAIM_STAY && Math.abs(n.x1 - o.x1) <= CLAIM_STAY && Math.abs(n.y1 - o.y1) <= CLAIM_STAY; });
    const out = near ? next.map((n, i) => { const o = boxes[i]!; return { x0: Math.min(n.x0, o.x0), y0: Math.min(n.y0, o.y0), x1: Math.max(n.x1, o.x1), y1: Math.max(n.y1, o.y1) }; }) : next.map((b) => ({ ...b }));
    if (near && key(out) === key(boxes)) return;
    boxes = out;
  },
};

/** A box grown by `pad`, then outward to the grid, appended to `out` (up to the cap). */
export function addClaim(out: Box[], x0: number, y0: number, x1: number, y1: number, pad: number): void {
  if (out.length >= CLAIM_CAP) return;
  const g = CLAIM_GRID;
  out.push({ x0: Math.floor((Math.min(x0, x1) - pad) / g) * g, y0: Math.floor((Math.min(y0, y1) - pad) / g) * g, x1: Math.ceil((Math.max(x0, x1) + pad) / g) * g, y1: Math.ceil((Math.max(y0, y1) + pad) / g) * g });
}

/** Boxes along a stroke from (x0, y0) to (x1, y1): one every `step` px, each `pad` px around its stretch, so a slanting line is not claimed as its whole corner. */
export function addStroke(out: Box[], x0: number, y0: number, x1: number, y1: number, pad: number, step = 30): void {
  const n = Math.max(1, Math.min(CLAIM_CAP, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / step)));
  for (let i = 0; i < n; i++) addClaim(out, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, x0 + ((x1 - x0) * (i + 1)) / n, y0 + ((y1 - y0) * (i + 1)) / n, pad);
}
