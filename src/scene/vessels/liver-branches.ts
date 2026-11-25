// (20 Nov, rebuilt: each branching vein is ONE tube from its root to the tip of its through branch, tapering gently over its whole length and fading to nothing at the tip, with no collar or cap in between;
// its second branch is a separate tube that starts inside that tube, on its centreline and as wide as it is there, and leaves its wall. So there is no join to see where the host ends and a child begins.)
// The vessels branch once more where they fade into the liver (Mohammad, 20 Nov: "have the portal veins branch one more time before fading; same for hepatic veins ... about 2 per branch
// into the Z axes"; "umbilical vein ... extend it a little then branch it into the liver"). Each host vein gets two children that leave it part-way along its end and spread apart as they
// run on into the liver, one forward and one back in depth, fading out (portal veins, the umbilical vein) or in (hepatic veins) the way the host does. They are decoration on the host's own
// course (a tributary group, like the 2D figure's fans), derived from it: no new edges, flows or numbers.
import { PLACED_BRANCHES, PLACED_PATH_2D, PLACED_SPLIT, to2D } from '../anatomy/placed-network.ts';

type P2 = readonly [number, number];
export interface BranchItem { /** the width at its start as a share of its vein's own at the join; for a vein that ends at a node (`atEnd`), the shape works it out from the vein's end width */ k: number; /** starts at the end of a vein that stays whole */ atEnd?: true; fan: boolean; when: string | null; src: string | null; out: boolean; pts: readonly P2[]; dz: readonly number[]; /** each point's depth (the approved placement: the branch's own course), in place of the host's tier */ zs?: readonly number[]; /** the width at each end as a share of its own: a branch narrows toward its tip */ taper: readonly [number, number]; /** the share of its length each end's narrowing covers: the whole of it at the tip, none at the join */ taperSpan: readonly [number, number]; /** which end (0 start, 1 end) is the join with the host: it has no cap */ join: 0 | 1 }
export interface BranchSet { host: string; when: string | null; list: readonly BranchItem[]; /** the stretch (0 to 1) of the host's lens ramp the children wear: the part they leave, so there is no step in colour at the branch point */ span: readonly [number, number] }

/** The share of its width a side branch has where it starts inside its vein, and the share of its length it widens over. It starts WHOLE (1): a half-width start (tried in 5b59c0a) made a step on the vein's outline where the branch's own
 *  begins, worse than the kink it was meant to remove (eyes, v8). */
export const JOIN_K = 1, JOIN_SPAN = 0.14;
/** Where along its vein (0 to 1, from the end the branches grow from: the portal branches' liver end, the hepatic veins' start) each branching vein splits. */
export const SPLIT_AT: Readonly<Record<string, number>> =
  // (the right portal vein and the right hepatic vein branch, by their placed branches (anatomy/placed-network.ts PLACED_BRANCHES); the left portal vein is ONE vessel that runs on into the left lobe and fades,
  //  with no fork (round 16), and the left hepatic vein starts in the lobe, so neither grows branches here)
  Object.fromEntries(Object.keys(PLACED_BRANCHES).map((id) => [id, PLACED_SPLIT[id]!.q]));
/** (None now: the left portal vein was the one end-fork, two children from its very end, which showed as a knob with two tubes laid over each other; the umbilical vein leaves its wall earlier now (starts.ts leaveVein), so it branches like every other vein, one tube and one side branch.) */
export const END_JOIN: ReadonlySet<string> = new Set<string>();
/** The width a branch narrows to at its tip, as a share of its vein's: gently, over the whole length, and it fades out before it could end. */
export const TIP = 0.5;
const smooth = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
/** The radius factor at `u` (0 root to 1 tip) of a vein that narrows to TIP over its whole length (tubes.ts factorSpan with a span of 1). */
export const taperAt = (u: number): number => 1 + (TIP - 1) * smooth(u);

export interface BranchItem { /** the width at its start as a share of its vein's own at the join; for a vein that ends at a node (`atEnd`), the shape works it out from the vein's end width */ k: number; /** starts at the end of a vein that stays whole */ atEnd?: true; fan: boolean; when: string | null; src: string | null; out: boolean; pts: readonly P2[]; dz: readonly number[]; taper: readonly [number, number]; /** the share of its length each end's narrowing covers: the whole of it at the tip, none at the join */ taperSpan: readonly [number, number]; /** which end (0 start, 1 end) is inside the vein it leaves: it has no cap */ join: 0 | 1 }
export interface BranchSet { host: string; when: string | null; list: readonly BranchItem[]; /** the stretch (0 to 1) of the host's lens ramp the branch wears: the part it leaves, so there is no step in colour at the branch point */ span: readonly [number, number] }

export const LIVER_BRANCH_HOSTS = { out: ['PVH_R_2', 'PVH_L_1'], in: ['RHV_IVC_1', 'LHV_IVC'], umb: [] as readonly string[] } as const;
const isOut = (id: string): boolean => (LIVER_BRANCH_HOSTS.out as readonly string[]).includes(id);
/** The end (0 or 1) at which vein `id` runs into the liver's tissue and ends there, narrowed and faded (a portal branch's end, a hepatic vein's start), whether or not it branches: that end is a tip, so the bed beyond it is
 *  no branch on its wall. Null for every other vessel. (The left portal vein stopped branching in round 16 but still ends in the left lobe this way: shape.ts LIVER_TAPER, fades.ts PLACED_LIVER_FADE.) */
export const liverTipEnd = (id: string): 0 | 1 | null => (isOut(id) ? 1 : (LIVER_BRANCH_HOSTS.in as readonly string[]).includes(id) ? 0 : null);

export interface Tree {
  /** the vein in flow order, whole: its own course up to the split, then its through branch to the tip */
  through: P2[];
  /** the side branch in flow order (null for a vein with none) and its depth */
  side: { pts: P2[]; dz: number[]; zs?: number[] } | null;
  /** where the split is along `through`, 0 to 1 from the root (the portal veins' start, the hepatic veins' IVC end), by length */
  q: number;
}
const TREE_CACHE = new Map<string, Tree>();
/** The approved placement's tree: the host's placed course runs on to its through branch's tip (placed-network.ts), and its side branch is the placed one, with its own depth. Flow order, as treeOf gives it. */
function placedTree(id: string): Tree {
  const hit = TREE_CACHE.get(id); if (hit) return hit;
  const sp = PLACED_SPLIT[id]!, side = to2D(sp.side);
  const t: Tree = { through: PLACED_PATH_2D[id]!.map((p): P2 => [p[0], p[1]]) as P2[], side: { pts: side.pts, dz: side.pts.map(() => 0), zs: side.z }, q: sp.q };
  TREE_CACHE.set(id, t);
  return t;
}
/** The whole tree of a branching vein, in flow order. */
export function treeOf(id: string): Tree | null {
  if (SPLIT_AT[id] == null) return null;
  return placedTree(id);
}
/** Where the split is along the drawn vein, 0 to 1 from its root end by length, as the vein runs (flow order): the tip end of the course is 1 for a portal branch and 0 for a hepatic vein. */
export const splitShare = (id: string): number | null => { const t = treeOf(id); return t ? (isOut(id) ? t.q : 1 - t.q) : null; };

const item = (c: { pts: P2[]; dz: number[]; zs?: number[] }, k: number, out: boolean): BranchItem => ({
  k, fan: true, when: null, src: null, out: false, pts: c.pts, dz: c.dz, ...(c.zs ? { zs: c.zs } : {}),
  // (the end inside the vein is narrower than the branch and widens over its first stretch: a flat cut as wide as the branch would stand out of the vein's wall as a square corner, a ledge, where the branch leaves it)
  taper: out ? [JOIN_K, TIP / k] : [TIP / k, JOIN_K], taperSpan: out ? [JOIN_SPAN, 1] : [1, JOIN_SPAN], join: out ? 0 : 1,
});

function build(): readonly BranchSet[] {
  const sets: BranchSet[] = [];
  for (const id of Object.keys(SPLIT_AT)) {
    const t = treeOf(id)!;
    if (!t.side) continue;
    const out = isOut(id), k = taperAt(t.q);   // (the side branch starts as wide as the vein is where it leaves)
    sets.push({ host: id, when: null, span: out ? [t.q, 1] : [0, 1 - t.q], list: [item(t.side, k, out)] });
  }
  return sets;
}
export const LIVER_BRANCHES: readonly BranchSet[] = build();
