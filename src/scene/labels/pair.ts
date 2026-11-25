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
/** The callout names of the pair's two ends (callout-spot.ts, figure-calls.ts): the lower, the slide's callout,
 *  and the upper, the Sinusoids station's ring (named so the callout keeps its words off it). */
export const PAIR_AT = 'sinusoid:pair';
export const PAIR_SIN_AT = 'sinusoid:pair-sin';
/** The room a pair's ring takes from every other writer: the ring and its stroke with a little air, never the whole circle
 *  the words' gap makes (that square covered the other ring's words, and the name above was left out, 25 Nov). */
export const PAIR_CLAIM_R = PAIR_RING_R + PAIR_STROKE + 3;
export const ringDisc = (x: number, y: number): Box => ({ x0: x - PAIR_CLAIM_R, y0: y - PAIR_CLAIM_R, x1: x + PAIR_CLAIM_R, y1: y + PAIR_CLAIM_R });

/** Where the words stand ABOVE a ring: PAIR_AIR over its centre, centred on it, slid sideways until the box is in the view and clear of every blocker; null when no slide clears it
 *  (then the name goes to the solver, which keeps its number wherever it stands). */
export function placeAbove(dot: { x: number; y: number }, size: { w: number; h: number }, view: Box, hold: readonly Box[]): Box | null {
  const y1 = dot.y - PAIR_AIR, y0 = y1 - size.h;
  for (const k of [0, 0.25, -0.25, 0.5, -0.5, 0.75, -0.75, 1, -1]) {
    const x0 = Math.min(Math.max(dot.x + k * size.w - size.w / 2, view.x0 + 4), view.x1 - size.w - 4);
    const box: Box = { x0, y0, x1: x0 + size.w, y1 };
    if (!within(box, view)) continue;
    // (the words, and the leader's thin strip down to the ring: never a box as wide as the words, which would take the pair's other ring in)
    const strip: Box = { x0: dot.x - 1, y0: y1, x1: dot.x + 1, y1: dot.y + PAIR_RING_R };
    if (hold.some((b) => hits(box, b) || hits(strip, b))) continue;
    return box;
  }
  return null;
}

/** What the Sinusoids name does beside its pair: stands above its ring (`box`, with the room it takes, `claim`, for the other names
 *  to keep off), or null where no clear place above exists and the solver must place it. */
export function pinAbove(dot: { x: number; y: number }, size: { w: number; h: number }, view: Box, hold: readonly Box[]): { box: Box; claim: Box } | null {
  const box = placeAbove(dot, size, view, hold);
  return box ? { box, claim: { x0: Math.min(box.x0, dot.x - 1), y0: box.y0, x1: Math.max(box.x1, dot.x + 1), y1: dot.y + 4 } } : null;
}
