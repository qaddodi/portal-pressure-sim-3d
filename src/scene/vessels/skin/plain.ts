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

/**
 * The junction of the arms that stay plus the growing arms in `there` (arm indices of the welded skin): the same seam rings and cuts, the absent growers left out, meshed from the surface. `there` empty is the plain trunk; every grower is the welded skin
 * itself (null here). A skin with two growers (the azygos wall: C9 and C1b; the lower cava wall: S_PC and C9) has to be a SHAPE for each set of growers that are there: with one open the static welded skin carries the other's whole stub beside it, and no per-pixel rule can
 * move the surface a pixel lies on (Plan 16). Null when `there` is every grower, or fewer than PLAIN_MIN_ARMS arms remain (then the tubes' own cut ends carry the weld: skin-set.ts).
 */
export function partOf(plan: Pick<SkinPlan, 'junction' | 'cuts'>, there: readonly number[]): PlainPlan | null {
  const j = plan.junction;
  const keep = j.arms.map((_, i) => i).filter((i) => !j.arms[i]!.grow || there.includes(i));
  if (keep.length === j.arms.length || keep.length < PLAIN_MIN_ARMS) return null;
  const tag = there.length ? `~with${there.join('.')}` : '~plain';
  return { junction: { ...j, node: `${j.node}${tag}`, arms: keep.map((i) => j.arms[i]!), surface: true }, cuts: keep.map((i) => plan.cuts[i]!), keep };
}

/** The plain trunk of a plan, or null when the plan has no growing arm or fewer than PLAIN_MIN_ARMS arms stay (then the tubes' own cut ends carry the weld: skin-set.ts). */
export const plainOf = (plan: Pick<SkinPlan, 'junction' | 'cuts'>): PlainPlan | null => partOf(plan, []);

/** The sets of growers that stand between none and all, for a skin with more than one: one part each (the welded skin is the set of all, the plain trunk the empty one). Arm indices, in order. */
export function partSets(plan: Pick<SkinPlan, 'junction'>): number[][] {
  const g = plan.junction.arms.map((a, i) => (a.grow ? i : -1)).filter((i) => i >= 0);
  const out: number[][] = [];
  for (let m = 1; m < (1 << g.length) - 1; m++) out.push(g.filter((_, k) => m & (1 << k)));
  return out;
}
/** The key of a set of growers in a baked file and in the set's maps. */
export const partKey = (there: readonly number[]): string => there.join('.');

/** The weld's share of a growing arm: 0 while it grows (the tube's flared end is drawn), 1 once it is whole and the skin has taken over; the skin comes in from growth WELD_FROM. */
export const WELD_FROM = 0.9;
export const weldOf = (g: number): number => { const t = Math.min(1, Math.max(0, (g - WELD_FROM) / (1 - WELD_FROM))); return t * t * (3 - 2 * t); };
