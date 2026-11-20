// The vessels branch once more where they fade into the liver (Mohammad, 20 Nov: "have the portal veins branch one more time before fading; same for hepatic veins ... about 2 per branch
// into the Z axes"; "umbilical vein ... extend it a little then branch it into the liver"). Each host vein gets two children that leave it part-way along its end and spread apart as they
// run on into the liver, one forward and one back in depth, fading out (portal veins, the umbilical vein) or in (hepatic veins) the way the host does. They are decoration on the host's own
// course (a tributary group, like the 2D figure's fans), derived from it: no new edges, flows or numbers.
import { EDGE_PATH_2D } from './paths.copied.ts';

type P2 = readonly [number, number];
export interface BranchItem { k: number; fan: boolean; when: string | null; src: string | null; out: boolean; pts: readonly P2[]; dz: readonly number[]; /** the width at each end as a share of its own: a branch narrows toward its tip */ taper: readonly [number, number]; /** the share of its length each end's narrowing covers: the whole of it at the tip, none at the join */ taperSpan: readonly [number, number]; /** which end (0 start, 1 end) is the join with the host: it has no cap */ join: 0 | 1 }
export interface BranchSet { host: string; when: string | null; list: readonly BranchItem[]; /** the stretch (0 to 1) of the host's lens ramp the children wear: the part they leave, so there is no step in colour at the branch point */ span: readonly [number, number] }

const K = 1, N = 64, Z_FWD = 0.1, Z_BACK = -0.03;
/** Where along its host (0 to 1, from the end the branches grow from) each branching vein splits. The host is drawn only up to there: its children are its continuation, each starting as wide as the host on the
 *  host's own centreline and depth, so the split is one continuous shape and not two tubes laid over one another (Mohammad, 20 Nov: "glitched and not really connected"). */
export const SPLIT_AT: Readonly<Record<string, number>> = { PVH_R_2: 0.35, PVH_L_1: 0.97, RHV_IVC_1: 0.72, LHV_IVC: 0.62 };
const smooth = (t: number): number => t * t * (3 - 2 * t);
/** `path` (2D points, flow order) cut at the split of the vein `id` (what the host draws), or `path` itself for a vein that does not branch. */
export function trimHost(id: string, path: readonly P2[]): readonly P2[] {
  const at = SPLIT_AT[id];
  if (at == null || at >= 0.9 || path.length < 3) return path;
  const n = path.length, i0 = Math.min(n - 2, Math.round(at * (n - 1)));
  const out = (LIVER_BRANCH_HOSTS.out as readonly string[]).includes(id) ? path.slice(0, i0 + 1) : path.slice(n - 1 - i0);
  return resample(out, N);
}

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

/** Two children of the polyline `host` (in flow order): they leave it at `at` (0 to 1 along it), follow it, run on past its end by `ext` of its length and spread to `spread` of that. */
export function twoChildren(host: readonly P2[], at: number, ext: number, spread: number, bias = 0): { pts: P2[]; dz: number[] }[] {
  const n = host.length, i0 = Math.min(n - 2, Math.round(at * (n - 1))), m = Math.min(6, n - 1);
  const dx = host[n - 1]![0] - host[n - 1 - m]![0], dy = host[n - 1]![1] - host[n - 1 - m]![1], dl = Math.hypot(dx, dy) || 1;
  const base: P2[] = host.slice(i0);
  let len = 0; for (let i = 1; i < host.length; i++) len += Math.hypot(host[i]![0] - host[i - 1]![0], host[i]![1] - host[i - 1]![1]);
  const e = ext * len;
  for (let t = 3; t <= e; t += 3) base.push([host[n - 1]![0] + (dx / dl) * t, host[n - 1]![1] + (dy / dl) * t]);
  const b = resample(base, N);
  const s = [0]; for (let i = 1; i < N; i++) s.push(s[i - 1]! + Math.hypot(b[i]![0] - b[i - 1]![0], b[i]![1] - b[i - 1]![1]));
  const L = s[N - 1]! || 1, sp = spread * L;
  return ([1, -1] as const).map((sgn) => {
    const pts: P2[] = [], dz: number[] = [];
    for (let i = 0; i < N; i++) {
      const a = b[Math.max(0, i - 1)]!, c = b[Math.min(N - 1, i + 1)]!, tx = c[0] - a[0], ty = c[1] - a[1], tl = Math.hypot(tx, ty) || 1, u = s[i]! / L;
      const w = (sgn + bias) * sp * Math.pow(u, 1.4);
      pts.push([b[i]![0] - (ty / tl) * w, b[i]![1] + (tx / tl) * w]);
      dz.push(smooth(u) * (sgn > 0 ? Z_FWD : Z_BACK));
    }
    return { pts, dz };
  });
}

const TIP = 0.5;   // (a branch narrows to half its width, gently over its whole length, and fades out before it could end in a point: Mohammad, 20 Nov, "tapering too fast into little twigs")
const item = (c: { pts: P2[]; dz: number[] }, when: string | null, tipAtStart = false): BranchItem => ({ k: K, fan: true, when, src: null, out: false, pts: c.pts, dz: c.dz, taper: tipAtStart ? [TIP, 1] : [1, TIP], taperSpan: tipAtStart ? [1, 0] : [0, 1], join: tipAtStart ? 1 : 0 });

const rev = <T,>(a: readonly T[]): T[] => [...a].reverse();
/** The portal branches' ends, the hepatic veins' beginnings and the umbilical vein's start. The middle hepatic vein does not branch (Mohammad, 20 Nov: its children crossed the right's). */
export const LIVER_BRANCH_HOSTS = { out: ['PVH_R_2', 'PVH_L_1'], in: ['RHV_IVC_1', 'LHV_IVC'], umb: [] as readonly string[] } as const;

function build(): readonly BranchSet[] {
  const sets: BranchSet[] = [];
  for (const h of LIVER_BRANCH_HOSTS.out) sets.push({ host: h, when: null, span: [SPLIT_AT.PVH_R_2!, 1], list: twoChildren(EDGE_PATH_2D[h]!, SPLIT_AT[h]!, 0.55, 0.3).map((c) => item(c, null)) });
  // (a hepatic vein begins in the liver: its children run in from the liver toward the vein, so each is the mirror of a portal branch, with its depth easing in from the far end)
  // (they split well inside the liver, 0.7 of the way from the cava: `at`, and spread only as far as the liver reaches, never into a sibling's or another vein's way: tests/b3-liver-branches.test.ts)
  // (the left hepatic vein branches downward into the left lobe, both children, never up toward the capsule: `bias` 0.8 carries the pair to the lower side)
  const IN_SHAPE: Readonly<Record<string, readonly [number, number, number, number]>> = { RHV_IVC_1: [SPLIT_AT.RHV_IVC_1!, 0.4, 0.35, 0], LHV_IVC: [SPLIT_AT.LHV_IVC!, 0.4, 0.3, 0.8] };
  for (const h of LIVER_BRANCH_HOSTS.in) { const [at, ext, spread, bias] = IN_SHAPE[h]!; sets.push({ host: h, when: null, span: [0, 1 - at], list: twoChildren(rev(EDGE_PATH_2D[h]!), at, ext, spread, bias).slice(0, h === 'LHV_IVC' ? 1 : 2).map((c) => item({ pts: rev(c.pts), dz: rev(c.dz) }, null, true)) }); }
  // (the umbilical vein does not branch: Mohammad, 20 Nov, "the umbilical vein has multiple tributaries why. just one")
  return sets;
}
export const LIVER_BRANCHES: readonly BranchSet[] = build();
