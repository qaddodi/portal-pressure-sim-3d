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
