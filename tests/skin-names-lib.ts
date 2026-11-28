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

// ---- the growing arms of every node, from the network alone ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------
import { NETWORK } from '../src/scene/vessels/network.ts';
import { GROWER_KINDS, isGrower, permanentEndsByNode } from '../src/scene/vessels/skin/inventory.ts';
import { braidRootEnds } from '../src/scene/vessels/skin/braid-arm.ts';
import { MAX_ARMS } from '../src/scene/vessels/skin/inventory.ts';
import { SKIN_GROWERS } from '../src/scene/vessels/skin/types.ts';

/** The growing arms (`vessel:end`) each node's skin is planned with, worked out from the network's own vessels and nothing typed: every one-tube collateral and shunt (and a braid's bundle roots) ends on the node its `from` or `to` names, and those names
 *  follow the engine's junction table (a take-off is a node of its own: IVC_P, IVC_M, SV_S, LPV_U...). A node is a junction for them when two to six permanent vessels end on it; the widest `SKIN_GROWERS` stay (and no more than the six arms a skin has). */
export function growersByNode(): Record<string, string[]> {
  const perm = permanentEndsByNode(NETWORK), at = new Map<string, { v: (typeof NETWORK)[number]; end: 0 | 1; i: number }[]>();
  NETWORK.forEach((v, i) => {
    if (v.feeder || v.id.includes('~F') || !GROWER_KINDS.has(v.kind)) return;
    for (const end of isGrower(v) ? ([0, 1] as const) : braidRootEnds(v)) { const node = end ? v.to : v.from; at.set(node, [...(at.get(node) ?? []), { v, end, i }]); }
  });
  const out: Record<string, string[]> = {};
  for (const [node, ends] of at) {
    const n = perm.get(node)?.length ?? 0;
    if (n < 2 || n > MAX_ARMS) continue;
    const keep = ends.sort((a, b) => b.v.radius - a.v.radius || a.i - b.i).slice(0, Math.max(0, Math.min(SKIN_GROWERS, MAX_ARMS - n)));
    if (keep.length) out[node] = keep.map((e) => `${e.v.id}:${e.end}`);
  }
  return out;
}
