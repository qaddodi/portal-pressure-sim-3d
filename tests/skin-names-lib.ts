// How the skin tests name a skin. The built skins are keyed by their node, and a cluster of junctions down one vein is ONE skin whose key joins them (`IVCI+IVC_M+IVC_C+IVC_P`,
// `LPV_U+LPV_X`, `SV_S+SVD`: cuts.ts mergedNode). The junction table (engine topology.js JUNCTIONS) decides which nodes exist and which cluster, so a test never types a skin's key: it asks for
// the skin a node is part of, or the skin a vessel's growing end is an arm of, and the answer follows the table when a row moves.
import type { SkinMesh } from '../src/scene/vessels/skin/types.ts';

/** The nodes a built skin is made of: its key split at the merges. */
export const membersOf = (key: string): string[] => key.split('+');

/** The key of the built skin `node` is part of (a skin of its own, or a member of a merged one), or undefined when the node has no skin. */
export function skinKey(keys: readonly string[], node: string): string | undefined { return keys.find((k) => membersOf(k).includes(node)); }

/** The skins (by key) that carry the growing end `vesselId:end` as an arm. */
export function skinKeysWithArm<T extends { node: string; mesh: SkinMesh }>(skins: readonly T[], vesselId: string, end?: 0 | 1): string[] {
  return skins.filter((s) => s.mesh.junction.arms.some((a) => a.vesselId === vesselId && (end === undefined || a.end === end))).map((s) => s.node);
}

// ---- the parts of a skin with growing arms (plain.ts partSpecs): named by the growers that are there, by arm index, and an `L` when the divided vein's start leaves ---------------------------------------------------------------
interface ArmLike { vesselId: string; grow?: boolean; leaves?: string }

/** The key of the part of a skin that holds the growers `ids` (vessel ids, in any order) and, with `leave`, is built without the divided vein's start: arm indices of the growers joined by dots, then `L`. */
export function partKeyOf(arms: readonly ArmLike[], ids: readonly string[], leave = false): string {
  const idx = arms.map((a, i) => (a.grow && ids.includes(a.vesselId) ? i : -1)).filter((i) => i >= 0);
  return `${idx.join('.')}${leave ? 'L' : ''}`;
}

/** The vessel ids a part draws: every permanent arm, the growers in `ids`, and without the arm a grower there cuts (the divided vein's start) when `leave`. */
export function partIdsOf(arms: readonly ArmLike[], ids: readonly string[], leave = false): string[] {
  return arms.filter((a) => (a.grow ? ids.includes(a.vesselId) : !(leave && a.leaves && ids.includes(a.leaves)))).map((a) => a.vesselId);
}

/** Every part key a skin has, worked out from its arms by the rule alone (plain.ts partSpecs: the proper sets of growers, and each set holding the shunt of a divided vein once more with `L`), sorted. */
export function expectedPartKeys(arms: readonly ArmLike[]): string[] {
  const g = arms.map((a, i) => (a.grow ? i : -1)).filter((i) => i >= 0), out: string[] = [];
  for (let m = 1; m < 1 << g.length; m++) {
    const there = g.filter((_, k) => m & (1 << k)), key = there.join('.');
    if (there.length < g.length) out.push(key);
    if (arms.some((a) => a.leaves && there.some((i) => arms[i]!.vesselId === a.leaves))) out.push(`${key}L`);
  }
  return out.sort();
}
