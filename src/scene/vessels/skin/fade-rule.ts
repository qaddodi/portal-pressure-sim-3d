// THE JUNCTION FADE RULE's keys (Mohammad, 20 Nov: "a vessel merging into a faded vessel fades gradually on approach, so both share the same fade at the junction"). The skin's fragment stage (shaders.ts, the alpha) eases an arm's opacity to its trunk's as the
// pixel nears the trunk's wall when the arm is marked `armCopy.w = -2`; an arm in a through run has its mate's index there, any other arm -1. Which arms are marked is decided here, once, from the junction's structure, never from a vessel's name:
//   - a hepatic vein that ends on the cava (fades.ts opensIntoCava) and the caudate lobe's veins: the rule as it was written;
//   - a GROWING arm (a collateral, or a surgical shunt: the sewn ones, seams.ts; the stents' ends stand as strong as their middle, 2D's JOIN_F_NOFADE) that opens into the side of a RECEDED trunk: the junction has a through run whose arms are drawn faded (the cava at CAVA_RECEDE, the renal veins at RECEDE). Before, only the hepatic veins carried the rule, so a shunt
//     (alpha 1) met the receded cava (0.45) or the renal vein (0.55) across the weights' contour: a solid slug with a flat end in the renal vein (the Warren shunt), a cap floating in the cava (the portocaval and mesocaval shunts), 23 Nov.
// A side arm into a trunk of its own opacity (the shunts at the confluence, the splenic vein, the superior mesenteric vein) is not marked: the ramp would be a no-op there.
import { CAVA_LIKE, RECEDE, opensIntoCava } from '../fades.ts';
import { NETWORK_BY_ID } from '../network.ts';
import { SEWN_IDS } from '../seams.ts';
import type { SkinArm } from './types.ts';

/** `armCopy.w` of an arm in no run and no ramp. */
export const ARM_RULE_NONE = -1;
/** `armCopy.w` of an arm that opens into the side of a trunk: its opacity eases to the trunk's at the wall. */
export const ARM_RULE_TRUNK = -2;

/** A vessel drawn receded (behind the plate, not directly in view): the cava and what runs with it (fades.ts CAVA_LIKE), the renal veins (RECEDE). */
export const isReceded = (id: string): boolean => CAVA_LIKE.has(id) || RECEDE[id] !== undefined;

/** A growing arm the rule is for: a collateral or a surgical shunt (a vessel that is sewn onto its host), never a stent. */
export const joinsByRule = (id: string): boolean => NETWORK_BY_ID.get(id)?.kind === 'collateral' || SEWN_IDS.includes(id);

/** The `armCopy.w` of arm `i` of a junction whose axes are `axes` (their `mate`: the arm each runs through the node with): its mate when it has one, else the rule above, else none. */
export function armRuleOf(arms: readonly Pick<SkinArm, 'vesselId' | 'end' | 'grow'>[], axes: readonly { mate?: number }[], i: number): number {
  const a = arms[i];
  if (!a) return ARM_RULE_NONE;
  const mate = axes[i]?.mate;
  if (mate !== undefined) return mate;
  if (a.end === 1 && opensIntoCava(a.vesselId)) return ARM_RULE_TRUNK;
  if (a.grow && joinsByRule(a.vesselId) && arms.some((o, k) => axes[k]?.mate !== undefined && isReceded(o.vesselId))) return ARM_RULE_TRUNK;
  return ARM_RULE_NONE;
}
