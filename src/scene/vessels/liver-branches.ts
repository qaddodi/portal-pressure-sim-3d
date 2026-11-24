// (20 Nov, rebuilt: each branching vein is ONE tube from its root to the tip of its through branch, tapering gently over its whole length and fading to nothing at the tip, with no collar or cap in between;
// its second branch is a separate tube that starts inside that tube, on its centreline and as wide as it is there, and leaves its wall. So there is no join to see where the host ends and a child begins.)
// The vessels branch once more where they fade into the liver (Mohammad, 20 Nov: "have the portal veins branch one more time before fading; same for hepatic veins ... about 2 per branch
// into the Z axes"; "umbilical vein ... extend it a little then branch it into the liver"). Each host vein gets two children that leave it part-way along its end and spread apart as they
// run on into the liver, one forward and one back in depth, fading out (portal veins, the umbilical vein) or in (hepatic veins) the way the host does. They are decoration on the host's own
// course (a tributary group, like the 2D figure's fans), derived from it: no new edges, flows or numbers.
import { EDGE_PATH_2D } from '../anatomy/source.ts';
import { len3 } from '../frame2d.ts';

type P2 = readonly [number, number];
export interface BranchItem { /** the width at its start as a share of its vein's own at the join; for a vein that ends at a node (`atEnd`), the shape works it out from the vein's end width */ k: number; /** starts at the end of a vein that stays whole */ atEnd?: true; fan: boolean; when: string | null; src: string | null; out: boolean; pts: readonly P2[]; dz: readonly number[]; /** the width at each end as a share of its own: a branch narrows toward its tip */ taper: readonly [number, number]; /** the share of its length each end's narrowing covers: the whole of it at the tip, none at the join */ taperSpan: readonly [number, number]; /** which end (0 start, 1 end) is the join with the host: it has no cap */ join: 0 | 1 }
export interface BranchSet { host: string; when: string | null; list: readonly BranchItem[]; /** the stretch (0 to 1) of the host's lens ramp the children wear: the part they leave, so there is no step in colour at the branch point */ span: readonly [number, number] }

const N = 64, Z_FWD = 0.1;
/** The share of its width a side branch has where it starts inside its vein, and the share of its length it widens over. It starts WHOLE (1): a half-width start (tried in 5b59c0a) made a step on the vein's outline where the branch's own
 *  begins, worse than the kink it was meant to remove (eyes, v8). */
export const JOIN_K = 1, JOIN_SPAN = 0.14;
/** A branch begins this far behind the vein it leaves, rising to its own depth over its first third, so the vein's wall covers the branch's start and its outline is not drawn across the vein (a crease where it joins). */
const Z_TUCK = 0.02;
const tuck = (u: number): number => -Z_TUCK * (1 - smooth(u / 0.35));
/** How fast a side branch parts from its vein (the power of its distance along the run): straight, so it leaves at an angle and is clear of the vein within a few radii, not after a long sliver lying on it. */
const SIDE_P = 1.0;
/** The steepest a side branch may run in depth, as rise per unit of lateral run (about 24 degrees). A tube is shaded by its normals: one that dives at the camera (the old ramp rose 0.1 over 0.03 sideways, 75 degrees) shows its
 *  whole width in the shade tone, a dark rounded patch laid over the vein it leaves and two strands that do not match (Mohammad, 20 Nov; eyes crops of 4089d1a). Root cause of the dark overlap at every fork. */
export const SIDE_SLOPE = 0.45;
/** The depth of a side branch at lateral distance `w` (2D units) from its vein's line: a little behind the vein where it starts (its wall covers the branch, so no outline is drawn across the vein), then rising at a fixed
 *  gentle slope toward `z`, which it approaches and never passes. It is level with the vein by the time it has cleared it (two radii out), so while the two overlap the branch is always behind. */
export const tuckedDepth = (w: number, z: number): number => -Z_TUCK + z * (1 - Math.exp(-SIDE_SLOPE * len3(w) / z));
/** Where along its vein (0 to 1, from the end the branches grow from: the portal branches' liver end, the hepatic veins' start) each branching vein splits. */
export const SPLIT_AT: Readonly<Record<string, number>> = { PVH_R_2: 0.35, PVH_L_1: 0.55, RHV_IVC_1: 0.72, LHV_IVC: 0.62 };
/** (None now: the left portal vein was the one end-fork, two children from its very end, which showed as a knob with two tubes laid over each other; the umbilical vein leaves its wall earlier now (starts.ts leaveVein), so it branches like every other vein, one tube and one side branch.) */
export const END_JOIN: ReadonlySet<string> = new Set<string>();
/** How far each vein runs on past its 2D end, as a share of its length, into the liver (the through branch). */
const EXT: Readonly<Record<string, number>> = { PVH_R_2: 0.55, PVH_L_1: 0.55, RHV_IVC_1: 0.4, LHV_IVC: 0.4 };
/** How far the through branch and the side branch spread from the vein's own line, as a share of the run: [through, side]. The left hepatic vein has only its through branch, bent downward into the left lobe (never up to the capsule). */
const SPREAD: Readonly<Record<string, readonly [number, number | null]>> = { PVH_R_2: [0, 0.5], PVH_L_1: [0, 0.5], RHV_IVC_1: [0, 0.55], LHV_IVC: [0.54, null] };
/** A side branch drawn as a hand-set curve instead of a straight spread: from where it leaves the vein, `along` units on the way the vein runs into the liver and `down` units toward the lower edge of the figure (2D y grows down), as a cubic through
 *  four control points [along, down] and `z` toward the viewer at its far end (Mohammad, 20 Nov: the right hepatic vein's upper branch "below, kinda like the red marking I made, and make it go towards us a little in z"). It leaves the vein's underside
 *  heading on along the vein, then bends away downward. */
export const SIDE_SHAPE: Readonly<Record<string, { ctrl: readonly (readonly [number, number])[]; z: number }>> = {
  RHV_IVC_1: { ctrl: [[0, 0], [12, 6], [30, 28], [46, 82]], z: 0.16 },
  // (the right portal vein's second branch, the same way (Mohammad, 21 Nov, his sketch: the upper branch crossed out, the other drawn below the through branch): it leaves the underside and bends down into the liver)
  PVH_R_2: { ctrl: [[0, 0], [12, 6], [30, 28], [46, 72]], z: 0.16 },
};
/** The width a branch narrows to at its tip, as a share of its vein's: gently, over the whole length, and it fades out before it could end. */
export const TIP = 0.5;
const smooth = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
/** The radius factor at `u` (0 root to 1 tip) of a vein that narrows to TIP over its whole length (tubes.ts factorSpan with a span of 1). */
export const taperAt = (u: number): number => 1 + (TIP - 1) * smooth(u);

export interface BranchItem { /** the width at its start as a share of its vein's own at the join; for a vein that ends at a node (`atEnd`), the shape works it out from the vein's end width */ k: number; /** starts at the end of a vein that stays whole */ atEnd?: true; fan: boolean; when: string | null; src: string | null; out: boolean; pts: readonly P2[]; dz: readonly number[]; taper: readonly [number, number]; /** the share of its length each end's narrowing covers: the whole of it at the tip, none at the join */ taperSpan: readonly [number, number]; /** which end (0 start, 1 end) is inside the vein it leaves: it has no cap */ join: 0 | 1 }
export interface BranchSet { host: string; when: string | null; list: readonly BranchItem[]; /** the stretch (0 to 1) of the host's lens ramp the branch wears: the part it leaves, so there is no step in colour at the branch point */ span: readonly [number, number] }

function resample(p: readonly P2[], n: number): P2[] {
  const s = [0]; for (let i = 1; i < p.length; i++) s.push(s[i - 1]! + Math.hypot(p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1]));
  const L = s[s.length - 1]! || 1, out: P2[] = []; let j = 1;
  for (let i = 0; i < n; i++) {
    const d = (L * i) / (n - 1); while (j < p.length - 1 && s[j]! < d) j++;
    const u = (d - s[j - 1]!) / ((s[j]! - s[j - 1]!) || 1);
    out.push([p[j - 1]![0] + (p[j]![0] - p[j - 1]![0]) * u, p[j - 1]![1] + (p[j]![1] - p[j - 1]![1]) * u]);
  }
  return out;
}
const lenOf = (p: readonly P2[]): number => { let l = 0; for (let i = 1; i < p.length; i++) l += Math.hypot(p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1]); return l; };

export const LIVER_BRANCH_HOSTS = { out: ['PVH_R_2', 'PVH_L_1'], in: ['RHV_IVC_1', 'LHV_IVC'], umb: [] as readonly string[] } as const;
const isOut = (id: string): boolean => (LIVER_BRANCH_HOSTS.out as readonly string[]).includes(id);

export interface Tree {
  /** the vein in flow order, whole: its own course up to the split, then its through branch to the tip */
  through: P2[];
  /** the side branch in flow order (null for a vein with none) and its depth */
  side: { pts: P2[]; dz: number[] } | null;
  /** where the split is along `through`, 0 to 1 from the root (the portal veins' start, the hepatic veins' IVC end), by length */
  q: number;
}
/** The through branch and the side branch of the vein `id` carried on from `prefix`'s first part: `host` (the vein's 2D course, flow order) gives the line they follow. */
function grow(id: string, host: readonly P2[], prefix: readonly P2[] | null): Tree {
  const out = isOut(id), root = out ? [...host] : [...host].reverse();   // (root first: the end the branches grow from last)
  const n = root.length, at = SPLIT_AT[id]!, i0 = Math.min(n - 2, Math.round(at * (n - 1))), m = Math.min(6, n - 1);
  const dx = root[n - 1]![0] - root[n - 1 - m]![0], dy = root[n - 1]![1] - root[n - 1 - m]![1], dl = Math.hypot(dx, dy) || 1;
  const base: P2[] = root.slice(i0), e = EXT[id]! * lenOf(root);
  for (let t = 3; t <= e; t += 3) base.push([root[n - 1]![0] + (dx / dl) * t, root[n - 1]![1] + (dy / dl) * t]);
  const b = resample(base, N), s = [0]; for (let i = 1; i < N; i++) s.push(s[i - 1]! + Math.hypot(b[i]![0] - b[i - 1]![0], b[i]![1] - b[i - 1]![1]));
  const L = s[N - 1]! || 1, [sa, sb] = SPREAD[id]!;
  const off = (spread: number, z: number, p = 1.4): { pts: P2[]; dz: number[] } => {
    const pts: P2[] = [], dz: number[] = [];
    for (let i = 0; i < N; i++) {
      const a = b[Math.max(0, i - 1)]!, c = b[Math.min(N - 1, i + 1)]!, tx = c[0] - a[0], ty = c[1] - a[1], tl = Math.hypot(tx, ty) || 1, u = s[i]! / L, w = spread * L * Math.pow(u, p);
      pts.push([b[i]![0] - (ty / tl) * w, b[i]![1] + (tx / tl) * w]); dz.push(z > 0 ? tuckedDepth(Math.abs(w), z) : 0);
    }
    return { pts, dz };
  };
  const shaped = SIDE_SHAPE[id];
  const hand = (): { pts: P2[]; dz: number[] } => {
    // (the frame at the split: e1 the way the vein runs on, e2 the normal that points down the figure)
    const e1x = (b[N - 1]![0] - b[0]![0]), e1y = (b[N - 1]![1] - b[0]![1]), l1 = Math.hypot(e1x, e1y) || 1, ux = e1x / l1, uy = e1y / l1;
    const sgn = ux > 0 ? 1 : -1, nx = -uy * sgn, ny = ux * sgn;   // (a normal with ny >= 0: down the figure)
    const [c0, c1, c2, c3] = shaped!.ctrl;
    const pts: P2[] = [], dz: number[] = [];
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1), m = 1 - t, k0 = m * m * m, k1 = 3 * m * m * t, k2 = 3 * m * t * t, k3 = t * t * t;
      const al = k0 * c0![0] + k1 * c1![0] + k2 * c2![0] + k3 * c3![0], dn = k0 * c0![1] + k1 * c1![1] + k2 * c2![1] + k3 * c3![1];
      pts.push([b[0]![0] + ux * al + nx * dn, b[0]![1] + uy * al + ny * dn]); dz.push(tuckedDepth(dn, shaped!.z));
    }
    return { pts, dz };
  };
  const a = off(sa, 0), sd = shaped ? hand() : sb == null ? null : off(sb, Z_FWD, SIDE_P);
  const lead = prefix ? [...prefix].slice(0, i0 + 1) : root.slice(0, i0 + 1);   // (the root end as drawn, smoothed into its joins; the split is past those)
  const through = resample([...lead, ...a.pts.slice(1)], N);
  return { through, side: sd, q: lenOf(lead) / lenOf([...lead, ...a.pts.slice(1)]) };
}
const TREE_CACHE = new Map<string, Tree>();
/** The whole tree of a branching vein (its course in root-first order is reversed back to flow order here). */
export function treeOf(id: string, prefix: readonly P2[] | null = null): Tree | null {
  if (SPLIT_AT[id] == null) return null;
  const key = prefix ? '' : id; const hit = key ? TREE_CACHE.get(key) : undefined; if (hit) return hit;
  const t = grow(id, EDGE_PATH_2D[id]!, prefix ? (isOut(id) ? prefix : [...prefix].reverse()) : null);
  const flow: Tree = isOut(id) ? t : { through: [...t.through].reverse(), side: t.side ? { pts: [...t.side.pts].reverse(), dz: [...t.side.dz].reverse() } : null, q: t.q };
  if (key) TREE_CACHE.set(key, flow);
  return flow;
}
/** `path` (2D points, flow order) as the vein is drawn: for a vein that branches, its own course up to the split and its through branch on to the tip (one tube); `path` itself for the rest. */
export function trimHost(id: string, path: readonly P2[]): readonly P2[] {
  if (SPLIT_AT[id] == null || path.length < 3) return path;
  return treeOf(id, path)!.through;
}
/** Where the split is along the drawn vein, 0 to 1 from its root end by length, as the vein runs (flow order): the tip end of the course is 1 for a portal branch and 0 for a hepatic vein. */
export const splitShare = (id: string): number | null => { const t = treeOf(id); return t ? (isOut(id) ? t.q : 1 - t.q) : null; };

const item = (c: { pts: P2[]; dz: number[] }, k: number, out: boolean): BranchItem => ({
  k, fan: true, when: null, src: null, out: false, pts: c.pts, dz: c.dz,
  // (the end inside the vein is narrower than the branch and widens over its first stretch: a flat cut as wide as the branch would stand out of the vein's wall as a square corner, a ledge, where the branch leaves it)
  taper: out ? [JOIN_K, TIP / k] : [TIP / k, JOIN_K], taperSpan: out ? [JOIN_SPAN, 1] : [1, JOIN_SPAN], join: out ? 0 : 1,
});

/** Two children of the whole course `host` (flow order): they leave it at `at` of its length, follow it, run on past its end by `ext` and spread to ±`spread` of that run, one forward in depth and one back. */
function endChildren(host: readonly P2[], at: number, ext: number, spread: number): { pts: P2[]; dz: number[] }[] {
  const n = host.length, i0 = Math.min(n - 2, Math.round(at * (n - 1))), m = Math.min(6, n - 1);
  const dx = host[n - 1]![0] - host[n - 1 - m]![0], dy = host[n - 1]![1] - host[n - 1 - m]![1], dl = Math.hypot(dx, dy) || 1;
  const base: P2[] = host.slice(i0), e = ext * lenOf(host);
  for (let t = 3; t <= e; t += 3) base.push([host[n - 1]![0] + (dx / dl) * t, host[n - 1]![1] + (dy / dl) * t]);
  const b = resample(base, N), s = [0]; for (let i = 1; i < N; i++) s.push(s[i - 1]! + Math.hypot(b[i]![0] - b[i - 1]![0], b[i]![1] - b[i - 1]![1]));
  const L = s[N - 1]! || 1, sp = spread * L;
  return ([1, -1] as const).map((sgn) => {
    const pts: P2[] = [], dz: number[] = [];
    for (let i = 0; i < N; i++) {
      const a = b[Math.max(0, i - 1)]!, c = b[Math.min(N - 1, i + 1)]!, tx = c[0] - a[0], ty = c[1] - a[1], tl = Math.hypot(tx, ty) || 1, u = s[i]! / L, w = sgn * sp * Math.pow(u, 1.15);
      pts.push([b[i]![0] - (ty / tl) * w, b[i]![1] + (tx / tl) * w]); dz.push(smooth(u) * (sgn > 0 ? Z_FWD : -0.03) + tuck(u));
    }
    return { pts, dz };
  });
}

function build(): readonly BranchSet[] {
  const sets: BranchSet[] = [];
  for (const id of END_JOIN) sets.push({ host: id, when: null, span: [0.9, 1], list: endChildren(EDGE_PATH_2D[id]!, 0.97, EXT[id]!, 0.5).map((c) => ({ ...item(c, 1, true), atEnd: true as const })) });
  for (const id of Object.keys(SPLIT_AT)) {
    const t = treeOf(id)!;
    if (!t.side) continue;
    const out = isOut(id), k = taperAt(t.q);   // (the side branch starts as wide as the vein is where it leaves)
    sets.push({ host: id, when: null, span: out ? [t.q, 1] : [0, 1 - t.q], list: [item(t.side, k, out)] });
  }
  return sets;
}
export const LIVER_BRANCHES: readonly BranchSet[] = build();
