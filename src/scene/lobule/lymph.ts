// The lymph channels of the lobule: two thin tubes along every sinusoid, one on each side, touching its wall (Mohammad, 20 Nov 2026: "lymph should be tubes that are hugging exactly the blood vessels, not running
// independently like bile; and split exactly like the sinusoids, one on each side of the vessel"; and of the filled-in drawing that replaced them, "disgusting": big green wedges in every crotch). Each tube is a fixed
// small width (taking only the taper toward the central vein), never an area. A sinusoid's two side lines are its axis moved sideways by its wall and a little less than the tube's radius, so the tube stands half
// under the wall (no daylight, no dark gap). At a merge the two outer lines run on into the trunk's own lines (the child's outer line is continued by the trunk's line on its side), and the two inner lines stand
// against their own walls and stop as threads where the sinusoids meet: nothing fills the wedge. Where a line crosses another vessel it is drawn UNDER it (the scene's job: lymphCover), so nothing is cut and there are
// no strays and no loops. Pure (numbers in, numbers out).
import type { Course, P2 } from './geometry.ts';

/** The lymph tube's taper toward the central vein: whole from rho 0.42 out, nothing at 0.13 (about 90 % of the way from the portal edge to the vein; Mohammad 20 Nov 2026: "taper to nothing closer to 90% of the way"). */
export function lyTaper(rho: number): number { const t = Math.min(1, Math.max(0, (rho - 0.13) / (0.42 - 0.13))); return t * t * (3 - 2 * t); }
/** Where the tube's centre stands from the wall, in its own radii: 0.55, so 45 % of the tube lies under the wall and no daylight shows between the two (the tube's own line there is hidden under the vessel's). */
export const HUG = 0.55;
/** Spacing of the offset lines, and of the finished tubes' samples (lobule radii). */
export const CUT_STEP = 0.004, TUBE_STEP = 0.025;

export interface LymphInput {
  /** The sinusoids that carry a lymph tube on each side (generations 0 to 2). */
  carry: readonly Course[];
  /** A sinusoid's wall radius at distance `rho` from the centre, and the tube's radius there. */
  wall: (kind: Course['kind'], rho: number) => number;
  radius: (rho: number) => number;
  /** The central vein's radius: no tube inside it. */
  rcv: number;
  /** Where a first-generation tube joins the terminal lymphatic, or null. */
  join: (c: Course, p: P2) => P2 | null;
}
/** One tube: points from the portal end in (the sinusoid's own direction), its sinusoid, its side, its generation and whether each end joins nothing (such an end tapers to a thread). */
export interface LymphRun { pts: P2[]; sib: number; side: 1 | -1; lvl: number; freeHead: boolean; freeTail: boolean }

const hyp = Math.hypot;

interface Axis { c: Course; seg: [number, number, number, number][]; }

/** Where two lines cross, looking at the last stretch of each (the crotch is at their ends): the first crossing along `a`, as the index of the segment's start on each line and the point. */
function firstCrossing(a: readonly P2[], b: readonly P2[]): { ia: number; ib: number; p: P2 } | null {
  const lo = (l: readonly P2[]) => Math.max(0, l.length - 90);
  for (let i = lo(a); i + 1 < a.length; i++) for (let j = lo(b); j + 1 < b.length; j++) {
    const p = a[i]!, q = a[i + 1]!, r = b[j]!, t = b[j + 1]!, d1x = q[0] - p[0], d1y = q[1] - p[1], d2x = t[0] - r[0], d2y = t[1] - r[1], den = d1x * d2y - d1y * d2x;
    if (Math.abs(den) < 1e-18) continue;
    const u = ((r[0] - p[0]) * d2y - (r[1] - p[1]) * d2x) / den, v = ((r[0] - p[0]) * d1y - (r[1] - p[1]) * d1x) / den;
    if (u >= 0 && u <= 1 && v >= 0 && v <= 1) return { ia: i, ib: j, p: [p[0] + d1x * u, p[1] + d1y * u] };
  }
  return null;
}

/** The lymph tubes of a lobule: each carried sinusoid's two side lines, the outer ones continued into the trunk's, the inner ones left to end at the crotch. */
export function lymphRuns(inp: LymphInput): LymphRun[] {
  const { carry, wall, radius, rcv } = inp, out = new Map<string, LymphRun>(), byId = new Map(carry.map((c) => [c.id, c])), outerOf = new Map<number, 1 | -1>();
  for (const c of carry) {
    const n = c.pts.length, tn: P2[] = c.pts.map((_, i) => { const a = c.pts[Math.max(0, i - 1)]!, b = c.pts[Math.min(n - 1, i + 1)]!, l = hyp(b[0] - a[0], b[1] - a[1]) || 1; return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l] as P2; });
    const X: P2[] = [], Nn: P2[] = [], Rho: number[] = [];
    for (let i = 0; i + 1 < n; i++) {
      const a = c.pts[i]!, b = c.pts[i + 1]!, len = hyp(b[0] - a[0], b[1] - a[1]), m = Math.max(1, Math.ceil(len / CUT_STEP));
      for (let k = 0; k < m; k++) {
        const t = k / m, nx = tn[i]![0] + (tn[i + 1]![0] - tn[i]![0]) * t, ny = tn[i]![1] + (tn[i + 1]![1] - tn[i]![1]) * t, l = hyp(nx, ny) || 1;
        X.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); Nn.push([nx / l, ny / l]); Rho.push(c.rho[i]! + (c.rho[i + 1]! - c.rho[i]!) * t);
      }
    }
    X.push(c.pts[n - 1]!); Nn.push(tn[n - 1]!); Rho.push(c.rho[n - 1]!);
    for (const side of [1, -1] as const) {
      const pts: P2[] = [];
      for (let k = 0; k < X.length; k++) {
        if (Rho[k]! < rcv) continue;
        const d = wall(c.kind, Rho[k]!) + HUG * radius(Rho[k]!);
        pts.push([X[k]![0] + side * Nn[k]![0] * d, X[k]![1] + side * Nn[k]![1] * d]);
      }
      if (pts.length >= 3) out.set(`${c.id}:${side}`, { pts, sib: c.id, side, lvl: c.kind === 's0' ? 0 : c.kind === 's1' ? 1 : 2, freeHead: c.kind !== 's0', freeTail: true });
    }
  }
  for (const c of carry) {
    // a first-generation tube's two sides begin on the terminal lymphatic they drain into (2D: the channel starts on it)
    if (c.kind === 's0') for (const side of [1, -1] as const) {
      const run = out.get(`${c.id}:${side}`);
      if (!run) continue;
      const a = c.pts[0]!, f = run.pts[0]!, e = inp.join(c, f);
      if (e && hyp(f[0] - a[0], f[1] - a[1]) < 0.05) { run.pts.unshift(e); run.freeHead = false; }
    }
    // a branch's OUTER line (the side away from its sibling) runs on into the trunk's line on that side; its inner line stands against its own wall and ends there
    const p = c.parent != null ? byId.get(c.parent) : undefined;
    if (!p) continue;
    const dir = (k: Course): P2 => { const q = k.pts[Math.max(0, k.pts.length - 5)]!, e = k.pts[k.pts.length - 1]!; return [q[0] - e[0], q[1] - e[1]]; };
    // the outer line is the one away from the sibling branch: the branch on the left (as the trunk runs on) has its left line outside, the other its right (a sibling's bearing, not the trunk's first stretch, which may bend)
    const sib = carry.find((o) => o.id !== c.id && o.parent === c.parent), dc = dir(c);
    let outer: 1 | -1;
    if (sib) { const ds = dir(sib); outer = dc[0] * ds[1] - dc[1] * ds[0] > 0 ? 1 : -1; }
    else { const a = p.pts[0]!, b = p.pts[Math.min(2, p.pts.length - 1)]!, l = hyp(b[0] - a[0], b[1] - a[1]) || 1; outer = dc[0] * (-(b[1] - a[1]) / l) + dc[1] * ((b[0] - a[0]) / l) > 0 ? 1 : -1; }
    const mine = out.get(`${c.id}:${outer}`), trunk = out.get(`${p.id}:${outer}`);
    if (!mine || !trunk) continue;
    mine.pts.push(trunk.pts[0]!); mine.freeTail = false; trunk.freeHead = false;
    outerOf.set(c.id, outer);
  }
  // the two INNER lines of a pair of branches meet where they cross, at the crotch: each ends exactly there (one thin line round the crotch, hugging both walls), so nothing is left free and nothing fills the wedge
  for (const c of carry) {
    const sib = c.parent != null ? carry.find((o) => o.id > c.id && o.parent === c.parent) : undefined, oc = outerOf.get(c.id);
    if (!sib || oc == null || outerOf.get(sib.id) == null) continue;
    const a = out.get(`${c.id}:${-oc}`), b = out.get(`${sib.id}:${-outerOf.get(sib.id)!}`);
    if (!a || !b) continue;
    const x = firstCrossing(a.pts, b.pts);
    if (!x) continue;
    a.pts.length = x.ia + 1; a.pts.push(x.p); b.pts.length = x.ib + 1; b.pts.push(x.p); a.freeTail = b.freeTail = false;
  }
  return [...out.values()];
}

/** How far from a free end the tube takes to reach full width (lobule radii), and the thread it narrows to. */
export const END_TAPER = 0.03, END_THREAD = 0.1;
const arcs = new WeakMap<object, number[]>();
/** The share of its width a channel keeps at sample `i`: whole, but narrowing to a thread over the last END_TAPER of an end that joins nothing (no blunt stubs: it either runs on into another channel, or on the lymphatic, or fades out). */
export function endTaper(c: { pts: readonly P2[]; free?: readonly [boolean, boolean] }, i: number): number {
  if (!c.free || (!c.free[0] && !c.free[1])) return 1;
  let a = arcs.get(c);
  if (!a) { a = [0]; for (let k = 1; k < c.pts.length; k++) a.push(a[k - 1]! + hyp(c.pts[k]![0] - c.pts[k - 1]![0], c.pts[k]![1] - c.pts[k - 1]![1])); arcs.set(c, a); }
  const L = a[a.length - 1]!, d = Math.min(c.free[0] ? a[i]! : Infinity, c.free[1] ? L - a[i]! : Infinity), t = Math.min(1, Math.max(0, d / END_TAPER));
  return END_THREAD + (1 - END_THREAD) * t * t * (3 - 2 * t);
}

/** A run resampled to about `step` apart (at least 3 points), evenly by length, so a tube is as dense as it needs to be and no more; its first `fineHead` of length at `fineStep`, where the channel dives under a blood vessel and the depth must ease. */
export function resampleRun(pts: readonly P2[], step = TUBE_STEP, fineHead = 0, fineStep = 0.006): { pts: P2[]; len: number } {
  const arc = [0]; for (let i = 1; i < pts.length; i++) arc.push(arc[i - 1]! + hyp(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  const len = arc[arc.length - 1]!, S: number[] = [0], head = Math.min(fineHead, len * 0.5);
  if (head > 0) { const m = Math.max(1, Math.ceil(head / fineStep)); for (let k = 1; k <= m; k++) S.push((head * k) / m); }
  const rest = len - head, m = Math.max(head > 0 ? 1 : 2, Math.ceil(rest / step));
  for (let k = 1; k <= m; k++) S.push(head + (rest * k) / m);
  const res: P2[] = [];
  let j = 0;
  for (const s of S) {
    while (j < arc.length - 2 && arc[j + 1]! < s) j++;
    const t = arc[j + 1]! > arc[j]! ? (s - arc[j]!) / (arc[j + 1]! - arc[j]!) : 0;
    res.push([pts[j]![0] + (pts[j + 1]![0] - pts[j]![0]) * t, pts[j]![1] + (pts[j + 1]![1] - pts[j]![1]) * t]);
  }
  return { pts: res, len };
}

/** A vessel the lymph may have to pass under: its axis, its radius at each point, and how far (in tube radii) beyond its wall the channel starts to dive. */
export interface Cover { pts: readonly P2[]; rad: readonly number[]; band: number }
/** How far UNDER the blood each sample of a channel must lie, 0 (beside it, at its own level) to 1 (inside the vessel's footprint: wholly beneath it), easing in between (Mohammad, 20 Nov 2026: "make sure they pass UNDER the
 *  sinusoid's blood vessel, not through it, to connect to their interportal vessels"). A channel that hugs a sinusoid stands 1.05 radii off its wall, so a sinusoid's band is under that (it never dips); the inlet venule and
 *  the terminal lymphatic, which nothing hugs, have a wide one, so the dive is gentle. Pure. */
export function lymphCover(pts: readonly P2[], radius: (i: number) => number, covers: readonly Cover[]): number[] {
  const boxes = covers.map((c) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of c.pts) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); } const m = Math.max(...c.rad) + c.band * radius(0); return [x0 - m, y0 - m, x1 + m, y1 + m] as const; });
  return pts.map((q, k) => {
    let best = 0;
    covers.forEach((c, ci) => {
      const b = boxes[ci]!;
      if (q[0] < b[0] || q[0] > b[2] || q[1] < b[1] || q[1] > b[3]) return;
      const band = c.band * radius(k);
      for (let i = 0; i + 1 < c.pts.length; i++) {
        const a = c.pts[i]!, e = c.pts[i + 1]!, bx = e[0] - a[0], by = e[1] - a[1], bb = bx * bx + by * by, t = bb ? Math.min(1, Math.max(0, ((q[0] - a[0]) * bx + (q[1] - a[1]) * by) / bb)) : 0;
        const over = hyp(q[0] - a[0] - t * bx, q[1] - a[1] - t * by) - (c.rad[i]! + (c.rad[i + 1]! - c.rad[i]!) * t);
        if (over >= band) continue;
        const u = Math.min(1, Math.max(0, 1 - over / band));
        best = Math.max(best, u * u * (3 - 2 * u));
      }
    });
    return best;
  });
}
