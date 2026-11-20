// The vessels branch once more where they fade into the liver (Mohammad, 20 Nov: "have the portal veins branch one more time before fading; same for hepatic veins ... about 2 per branch
// into the Z axes"; "umbilical vein ... extend it a little then branch it into the liver"). Each host vein gets two children that leave it part-way along its end and spread apart as they
// run on into the liver, one forward and one back in depth, fading out (portal veins, the umbilical vein) or in (hepatic veins) the way the host does. They are decoration on the host's own
// course (a tributary group, like the 2D figure's fans), derived from it: no new edges, flows or numbers.
import { EDGE_PATH_2D } from './paths.copied.ts';

type P2 = readonly [number, number];
export interface BranchItem { k: number; fan: boolean; when: string | null; src: string | null; out: boolean; pts: readonly P2[]; dz: readonly number[] }
export interface BranchSet { host: string; when: string | null; list: readonly BranchItem[] }

const K = 0.7, N = 64, Z_FWD = 0.1, Z_BACK = -0.03;
const smooth = (t: number): number => t * t * (3 - 2 * t);

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
export function twoChildren(host: readonly P2[], at: number, ext: number, spread: number): { pts: P2[]; dz: number[] }[] {
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
      const w = sgn * sp * Math.pow(u, 1.4);
      pts.push([b[i]![0] - (ty / tl) * w, b[i]![1] + (tx / tl) * w]);
      dz.push(smooth(u) * (sgn > 0 ? Z_FWD : Z_BACK));
    }
    return { pts, dz };
  });
}

const item = (c: { pts: P2[]; dz: number[] }, when: string | null): BranchItem => ({ k: K, fan: true, when, src: null, out: false, pts: c.pts, dz: c.dz });

const rev = <T,>(a: readonly T[]): T[] => [...a].reverse();
/** The portal branches' ends, the hepatic veins' beginnings and the umbilical vein's start. */
export const LIVER_BRANCH_HOSTS = { out: ['PVH_R_2', 'PVH_L_1'], in: ['RHV_IVC_1', 'MHV_IVC', 'LHV_IVC'], umb: ['C3'] } as const;

function build(): readonly BranchSet[] {
  const sets: BranchSet[] = [];
  for (const h of LIVER_BRANCH_HOSTS.out) sets.push({ host: h, when: null, list: twoChildren(EDGE_PATH_2D[h]!, 0.35, 0.55, 0.3).map((c) => item(c, null)) });
  // (a hepatic vein begins in the liver: its children run in from the liver toward the vein, so each is the mirror of a portal branch, with its depth easing in from the far end)
  for (const h of LIVER_BRANCH_HOSTS.in) sets.push({ host: h, when: null, list: twoChildren(rev(EDGE_PATH_2D[h]!), 0.35, 0.55, 0.3).map((c) => item({ pts: rev(c.pts), dz: rev(c.dz) }, null)) });
  // (the umbilical vein: its first stretch, run backward, carried on past the left portal vein into the liver and branched; drawn while the paraumbilical collateral is open)
  for (const h of LIVER_BRANCH_HOSTS.umb) sets.push({ host: h, when: 'umb', list: twoChildren(rev(EDGE_PATH_2D[h]!.slice(0, 14)), 0.4, 0.7, 0.3).map((c) => item(c, 'umb')) });
  return sets;
}
export const LIVER_BRANCHES: readonly BranchSet[] = build();
