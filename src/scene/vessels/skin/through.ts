// A junction's THROUGH RUN (Mohammad, 20 Nov: "this is a very very wobbly junction, smooth it out": the SVC above the atrium, where the azygos arch joins). Two arms that leave the node in OPPOSITE directions are one vessel running through it
// (the trunk above and below a side vein), and a fillet belongs only in the crotch where the side vein joins, never round the trunk itself. The smooth-min of the spec (4.3) blends every pair, and at a point equally near both halves of a run it
// adds `k h (1 - h)` = k / 4 of material on the OUTSIDE of the wall, a ring of bulge round the trunk (measured 0.0042 on a trunk of radius 0.025: a lump a sixth as wide as the vessel), and the two halves' different calibres (SVC 0.0209 above, 0.025
// below) met in a step. So:
//   1. the two halves are the same vessel to the union: a plain minimum between them (no blend), and each side's blend with the REST is taken of the pair as one arm (sdf.ts `Capsule.mate`);
//   2. the run is ONE capsule from each far point through the two SEAM rings: each half's axis, instead of ending at the node along its own heading, goes straight on to the other half's seam. The two halves were drawn by different courses that
//      do not meet on one line (SVC: the vein above leans 5 degrees and is a fifth of a radius off the trunk's axis at the node), and the union of their capsules at the node was a jog, a bump on one wall; the straight run between the seams is not.
//      Its radius goes from one seam's to the other's by distance, one even taper, no step.
//   3. the side vein's capsule starts where its axis enters the trunk (just inside the near wall), not at the node: its rounded end at the node's centre, or wherever the art left its end ring, reaches across the trunk to the FAR wall, inside the
//      blend, and the blend pulls a bulge out of that wall opposite the side vein (a lump 0.15 radius on the SVC). Started at the near wall its end cap is a whole trunk width from the far wall, so the fillet is made in the crotch, where the
//      side vein joins, and the far wall is the trunk's own.
// Pure: points and numbers. The mesh (sdf.ts) and the fragment stage's outline (shaders.ts armCopy.w) both read the pairing from here, so they cannot disagree.
import type { ArmAxis } from './skin-object.ts';
import { sdArm, type Capsule } from './sdf.ts';

/** Two arms are a through run when their outward directions at the node are within this many degrees of opposite. */
export const THROUGH_DEG = 35;
const THROUGH_COS = -Math.cos((THROUGH_DEG * Math.PI) / 180);
/** The most a run the NETWORK declares (RUN_ONS: two vessels that run on into each other at a node, inventory.ts `declaredRuns`) may be off straight and still be one vessel through the skin. The angle that is measured is only the seam-to-far chord of each half, which moves
 *  with where the seam rings are cut (a DIPS leaving the portal fork 0.22 further out turned the right portal vein's chord by 4 degrees, from 34 to 39 off straight, and the portal trunk stopped running into it: the fork became a three-way hub, a ball), so
 *  for a declared pair it is a sanity limit, not the rule: past it the two are a real bend (a branch) whatever the network says. */
export const DECLARED_THROUGH_DEG = 60;
const DECLARED_COS = -Math.cos((DECLARED_THROUGH_DEG * Math.PI) / 180);

const sub = (a: readonly number[], b: readonly number[]): number[] => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const len = (v: readonly number[]): number => Math.hypot(v[0]!, v[1]!, v[2]!);
/** The unit direction an arm leaves the node in: from where its straight line through the seam starts toward its far point. */
function outward(a: ArmAxis): number[] {
  const d = sub(a.pts[3], a.pts[1]), l = len(d) || 1;
  return [d[0]! / l, d[1]! / l, d[2]! / l];
}

/** For each arm the index of the arm it runs through the node with, or -1: the pairs the network declares as one vessel (`declared`, arm index pairs, within DECLARED_THROUGH_DEG of straight) first, then the rest by angle (within THROUGH_DEG of opposite), the most nearly
 *  opposite first in each, each arm in at most one pair. */
/** `skip[i]`: arm i never runs through (a growing arm, a collateral or a shunt, comes and goes: it is a branch, whatever way it leaves). */
export function throughMates(axes: readonly ArmAxis[], skip: readonly boolean[] = [], declared: readonly (readonly [number, number])[] = []): number[] {
  const mate = axes.map(() => -1), dir = axes.map(outward);
  const pairs: { i: number; j: number; dot: number; decl: boolean }[] = [];
  const isDecl = (i: number, j: number): boolean => declared.some(([a, b]) => (a === i && b === j) || (a === j && b === i));
  for (let i = 0; i < axes.length; i++) for (let j = i + 1; j < axes.length; j++) {
    if (skip[i] || skip[j]) continue;
    const dot = dir[i]![0]! * dir[j]![0]! + dir[i]![1]! * dir[j]![1]! + dir[i]![2]! * dir[j]![2]!, decl = isDecl(i, j);
    if (dot < (decl ? DECLARED_COS : THROUGH_COS)) pairs.push({ i, j, dot, decl });
  }
  pairs.sort((a, b) => (a.decl === b.decl ? a.dot - b.dot : a.decl ? -1 : 1));
  for (const p of pairs) if (mate[p.i] < 0 && mate[p.j] < 0) { mate[p.i] = p.j; mate[p.j] = p.i; }
  return mate;
}

/** How far back from its seam, in its own radii, a run half's heading point sits. */
export const BACK_R = 1;

/** A side vein's capsule starts where its axis is this share of its own radius inside the trunk's surface: just inside the near wall, so the fillet is made against the wall and the end cap stays a trunk width from the far one. */
export const ENTER_DEPTH_R = 0.25;
/** The march along a side vein's axis toward the node, in shares of its radius per step, and how far past its old start (in its radii) it may go before the search gives up and the arm is left as it was. */
export const ENTER_STEP_R = 0.125;
export const ENTER_REACH_R = 3;

/** The axes with the through runs welded: each run's two arms carry `mate` and are one straight capsule from seam to seam (2 above). A side vein (an arm in no run, not a growing one, at a node that has a run) starts where it enters the trunk
 *  (3 above); arms at a node with no run are returned as they are. */
export function weldThrough(axes: readonly ArmAxis[], skip: readonly boolean[] = [], declared: readonly (readonly [number, number])[] = []): ArmAxis[] {
  const mate = throughMates(axes, skip, declared);
  // the run: each half's capsule goes from the other half's seam (a straight run between the two seams, radius tapering between them) out through its own seam to its far point
  const runs: ArmAxis[] = axes.map((a, i) => {
    const m = mate[i]!;
    if (m < 0) return a;
    const b = axes[m]!;
    // (the second point stays on the tube's own heading line a little back from its seam, so the flow marks' arc, taken along seam -> second point, runs the tube's own way at the ring and the marks line up there; the bridge from the other seam to it
    //  bends by the heading's few degrees at most)
    const S = a.pts[2], B = b.pts[2], h = sub(a.pts[1], S), hl = len(h) || 1, gap = len(sub(B, S)) || 1, d = Math.min(hl, BACK_R * a.radii[2]);
    const P1: [number, number, number] = [S[0] + (h[0]! / hl) * d, S[1] + (h[1]! / hl) * d, S[2] + (h[2]! / hl) * d];
    const r1 = a.radii[2] + (b.radii[2] - a.radii[2]) * Math.min(1, d / gap);
    return { ...a, mate: m, pts: [B, P1, S, a.pts[3]], radii: [b.radii[2], r1, a.radii[2], a.radii[3]] };
  });
  const caps: Capsule[] = runs.filter((a) => a.mate !== undefined).map((a) => ({ n: 4, pts: Float64Array.from(a.pts.flat()), r: Float64Array.from(a.radii) }));
  if (!caps.length) return runs;
  const runSd = (P: readonly number[]): number => Math.min(...caps.map((c) => sdArm(c, P[0]!, P[1]!, P[2]!)));
  return runs.map((a, i) => {
    if (mate[i]! >= 0 || skip[i]) return a;   // (a run's half; a growing arm keeps its own shape: it has its own morph)
    const S = a.pts[2], d0 = len(sub(a.pts[1], S));
    if (d0 <= 0) return a;
    const o = sub(a.pts[1], S).map((x) => x / d0), rb = a.radii[0], reach = d0 + ENTER_REACH_R * rb, step = ENTER_STEP_R * rb;
    for (let t = 0; t <= reach; t += step) {
      const P: [number, number, number] = [S[0] + o[0]! * t, S[1] + o[1]! * t, S[2] + o[2]! * t];
      if (runSd(P) <= -ENTER_DEPTH_R * rb) return { ...a, pts: [P, P, a.pts[2], a.pts[3]] };
    }
    return a;
  });
}
