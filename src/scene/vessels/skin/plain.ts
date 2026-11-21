// The PLAIN trunk of a junction with growing arms (skin-set.ts). A welded skin is one static shape with its growing arms at full size; while one of them is still growing (its end is the tube's own sunk and flared profile, shunt-ends.ts)
// the permanent arms still need their junction, so a second static skin is built for them alone: the same seam rings, the arms that stay, nothing else. The two draw complementary pixels of one screen pattern while the weld goes
// (skin-object.ts setWeld), so no pixel is two skins and neither is ever morphed into the other.
import type { SkinPlan } from './cuts.ts';
import type { SkinCut, SkinJunction } from './types.ts';

/** The fewest permanent arms that make a junction of their own (MIN_ARMS in inventory.ts): with two the tubes simply run on. */
export const PLAIN_MIN_ARMS = 3;

export interface PlainPlan {
  /** the junction of the arms that stay, meshed from the surface (their seam rings are the welded skin's, so no hull covers them) */
  junction: SkinJunction;
  /** their cuts, the welded skin's own */
  cuts: SkinCut[];
  /** each kept arm's index in the welded skin's arm list */
  keep: number[];
}

/** The plain trunk of a plan, or null when the plan has no growing arm or fewer than PLAIN_MIN_ARMS arms stay (then the tubes' own cut ends carry the weld: skin-set.ts). */
export function plainOf(plan: Pick<SkinPlan, 'junction' | 'cuts'>): PlainPlan | null {
  const j = plan.junction;
  const keep = j.arms.map((_, i) => i).filter((i) => !j.arms[i]!.grow);
  if (keep.length === j.arms.length || keep.length < PLAIN_MIN_ARMS) return null;
  return { junction: { ...j, node: `${j.node}~plain`, arms: keep.map((i) => j.arms[i]!), surface: true, still: true }, cuts: keep.map((i) => plan.cuts[i]!), keep };
}

/** The weld's share of a growing arm: 0 while it grows (the tube's flared end is drawn), 1 once it is whole and the skin has taken over; the skin comes in from growth WELD_FROM. */
export const WELD_FROM = 0.9;
export const weldOf = (g: number): number => { const t = Math.min(1, Math.max(0, (g - WELD_FROM) / (1 - WELD_FROM))); return t * t * (3 - 2 * t); };
