// The room the scope view takes on the figure, as boxes in canvas px: the ring on the varices with its badge, and the lens with its caption while it is open. Every other writer on the figure keeps off them (the
// anatomy's station names and the callouts' pills read the same list as a blocker), and a slide's caliper across the varices stands clear of the ring while the slide wants one (`wantsRing`: it is the slide's
// choice, so the caliper never moves when a patient loads or the varices come and go). Written by the lens (ui/scope/ScopeLens.tsx) in the clock's tags phase; read when a solve runs, at rest.
import type { Box } from './geometry.ts';

let boxes: readonly Box[] = [];
let wants = false;
const key = (b: readonly Box[]) => b.map((x) => `${Math.round(x.x0)},${Math.round(x.y0)},${Math.round(x.x1)},${Math.round(x.y1)}`).join(';');

export const scopeClaims = {
  /** The boxes the ring and the open lens stand in now. */
  get boxes(): readonly Box[] { return boxes; },
  /** The slide has the ring (it stands, or will, on the varices): a caliper across the varices keeps clear of it. */
  get wantsRing(): boolean { return wants; },
  /** Written each frame by the lens; a place that has not moved a pixel changes nothing. */
  set(next: readonly Box[]): void { if (key(next) !== key(boxes)) boxes = next.slice(); },
  setWants(on: boolean): void { wants = on; },
};

/** The box of a circle, grown by `pad`. */
export const circleBox = (x: number, y: number, r: number, pad = 0): Box => ({ x0: x - r - pad, y0: y - r - pad, x1: x + r + pad, y1: y + r + pad });
/** The box round two boxes. */
export const unionBox = (a: Box, b: Box): Box => ({ x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) });

/** Where along a vessel's centreline (0..1) a caliper across it stands so that it is at least `clear` from `centre` (the picture's plane, y up): the middle when it is clear already, else the nearest stretch that is,
 *  and of two equally near the higher one (the ring stands on the varices of the lower esophagus; the tear and the stream into the stomach are below it). */
export function clearParam(at: (t: number, out: { x: number; y: number }) => void, centre: { x: number; y: number }, clear: number, from = 0.5): number {
  const p = { x: 0, y: 0 };
  const ok = (t: number) => { at(t, p); return Math.hypot(p.x - centre.x, p.y - centre.y) >= clear; };
  const up = (t: number) => { at(t, p); return p.y; };
  if (ok(from)) return from;
  for (let d = 0.01; d <= 0.5; d += 0.01) {
    const hi = Math.min(1, from + d), lo = Math.max(0, from - d), a = ok(hi), b = ok(lo);
    if (a && b) return up(hi) >= up(lo) ? hi : lo;
    if (a) return hi;
    if (b) return lo;
  }
  return from;
}
