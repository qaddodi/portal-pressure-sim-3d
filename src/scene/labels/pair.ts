// The paired readings of a lobule slide (Mohammad, 25 Nov, picked option A of the wedge slide's mocks): two rings on ONE sinusoid,
// a short way apart along it, each on a short vertical leader to its words. The name of the sinusoid's own pressure
// ("Sinusoids 16.7 mmHg") stands ABOVE the vessel and the slide's callout ("WHVP 16.3 mmHg") BELOW it. Both rings are the
// labels' own small ring (the station's dot) and both words carry the slide's amber. The rule is general: any lobule slide whose
// callout names a sinusoid and whose `reads` asks for the Sinusoids pressure stands the two this way, on every screen size
// (docs/approved/hvpg-lobule-labels.md). This file is the numbers the two writers share (LobuleCaptions for the name above,
// figure-cards.ts for the callout below). Pure.
import { type Box, hits, within } from './geometry.ts';
import { LS } from './type.ts';

/** The ring of both: the station dot's own radius and stroke (px), so the pair reads as two names of one kind. */
export const PAIR_RING_R = LS.RING.r;
export const PAIR_STROKE = LS.RING.stroke;
/** The leader's least length beyond the ring's stroke and the gap its end keeps from the words (the same numbers as figure-cards.ts RING_LEAD_MIN and RING_LABEL_GAP, a test pins that). */
export const PAIR_LEAD = 16;
export const PAIR_LABEL_GAP = 7;
/** From a ring's centre to the near edge of its words (px). */
export const PAIR_AIR = PAIR_RING_R + PAIR_STROKE / 2 + PAIR_LEAD + PAIR_LABEL_GAP;
/** How far apart the two rings stand along their sinusoid (lobule radii): far enough that the two rings and their leaders never touch, near enough that they read as one place. */
export const PAIR_ARC = 0.075;
/** The callout name the pair's lower end has (callout-spot.ts, figure-calls.ts). */
export const PAIR_AT = 'sinusoid:pair';

/** Where the words stand ABOVE a ring: PAIR_AIR over its centre, centred on it, slid sideways until the box is in the view and clear of every blocker; null when no slide clears it
 *  (then the name goes to the solver, which keeps its number wherever it stands). */
export function placeAbove(dot: { x: number; y: number }, size: { w: number; h: number }, view: Box, hold: readonly Box[]): Box | null {
  const y1 = dot.y - PAIR_AIR, y0 = y1 - size.h;
  for (const k of [0, 0.25, -0.25, 0.5, -0.5, 0.75, -0.75, 1, -1]) {
    const x0 = Math.min(Math.max(dot.x + k * size.w - size.w / 2, view.x0 + 4), view.x1 - size.w - 4);
    const box: Box = { x0, y0, x1: x0 + size.w, y1 };
    if (!within(box, view)) continue;
    // (the box and the leader's run down to the ring)
    const run: Box = { x0: Math.min(x0, dot.x - 1), y0, x1: Math.max(box.x1, dot.x + 1), y1: dot.y + PAIR_RING_R };
    if (hold.some((b) => hits(run, b))) continue;
    return box;
  }
  return null;
}
