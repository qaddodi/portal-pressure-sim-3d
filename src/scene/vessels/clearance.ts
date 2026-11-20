// Depth clearance where two tubes CROSS (Mohammad 20 Nov: "show all the possible collaterals and shunts at once without too much overlap, and if there is we should be able to fix"; the inspector's Overlaps found the cause).
// The figure is the 2D picture on a stack of tiers (frame2d.ts TIER_Z) 0.015 to 0.02 apart whose ORDER is the 2D figure's over and under, but its tubes are 0.01 to 0.03 in RADIUS: where two cross, the centrelines are closer than the radii together
// and in a turned view (the inspector turns the figure all the way round) the tubes run THROUGH each other. A tier cannot cure it (the ordering is right; the gap is too small), and a junction is a different thing (the skins and forks own it:
// vessels/overlaps.ts `JUNCTION_RUN`). So at a crossing the one that is to give way is lifted (or lowered) along its own depth, over the stretch where they are too close and a smooth run either side, until the two clear each other by their radii
// together; the tier order is kept (the one in front stays in front), nothing moves in x or y, and the ends never move (a junction's ends keep the node's depth).
// The mover is the growing vessel (a collateral or a shunt comes and goes), else the thinner one, else the later one. One profile per vessel, computed once from the courses with no clearance and read by shape.ts `to3` as a depth to add along the course.
import { OVERLAP_K, isBraid, overlapRuns, sampleCourse, apartBoxes, type Sampled } from './overlaps.ts';
import type { NetVessel } from './network.ts';
import type { Vec3 } from './skin/types.ts';

/** A vessel's depth to add along its main course: `dz[k]` at the share `u[k]` of its length. */
export interface ClearProfile { u: readonly number[]; dz: readonly number[] }
/** How far apart the centrelines are taken to (of the radii together): past the overlap limit, with room. */
export const CLEAR_TARGET = 1.0;
/** The stretch the lift eases out over, in the radii together. */
export const CLEAR_EASE = 4;
/** No lift is ever more than this (scene units): a crossing of two thick tubes. */
export const CLEAR_MAX = 0.12;
const PASSES = 3;
const smooth = (u: number) => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const grows = (v: NetVessel) => v.kind === 'collateral' || v.kind === 'shunt';

/** Which of the two gives way. */
export const moverOf = (a: NetVessel, b: NetVessel): 'a' | 'b' => (grows(a) !== grows(b) ? (grows(a) ? 'a' : 'b') : a.radius !== b.radius ? (a.radius < b.radius ? 'a' : 'b') : 'b');

export interface ClearInput { network: readonly NetVessel[]; course: (v: NetVessel) => readonly Vec3[] | undefined }

/** The clearance profile of every vessel that has to give way somewhere (none for the rest). */
export function clearances(inp: ClearInput): Map<string, ClearProfile> {
  const all: Sampled[] = [];
  for (const v of inp.network) {
    if (v.feeder || v.id.includes('~F') || isBraid(v)) continue;
    const c = inp.course(v), s = c ? sampleCourse(v, c) : null;
    if (s) all.push(s);
  }
  const dz = new Map<string, Float64Array>(all.map((s) => [s.v.id, new Float64Array(s.pts.length)]));
  const lifted = (s: Sampled): Sampled => { const d = dz.get(s.v.id)!; const pts = s.pts.map((p, i): Vec3 => [p[0], p[1], p[2] + d[i]!]); const lo = [...s.lo] as [number, number, number], hi = [...s.hi] as [number, number, number]; for (const p of pts) { lo[2] = Math.min(lo[2], p[2]); hi[2] = Math.max(hi[2], p[2]); } return { ...s, pts, lo, hi }; };
  for (let pass = 0; pass < PASSES; pass++) {
    const now = new Map(all.map((s) => [s.v.id, lifted(s)]));
    let changed = false;
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = now.get(all[i]!.v.id)!, b = now.get(all[j]!.v.id)!;
      if (a.v.host === b.v.host) continue;
      const together = a.v.radius + b.v.radius, limit = together * OVERLAP_K;
      if (apartBoxes(a, b, limit)) continue;
      const [M, F] = moverOf(a.v, b.v) === 'a' ? [a, b] : [b, a];
      const runs = overlapRuns(M, F, limit).filter((r) => !r.junction);
      if (!runs.length) continue;
      const need = new Float64Array(M.pts.length);
      for (const r of runs) {
        // the side it gives way to: the way it already lies (the tier order is the 2D figure's over and under)
        const f = F.pts[r.mate]!, m = M.pts[r.at]!, up = m[2] - f[2] >= 0 ? 1 : -1;
        for (let k = r.i0; k <= r.i1; k++) {
          const p = M.pts[k]!;
          let d = Infinity, q = 0; for (let t = 0; t < F.pts.length; t++) { const fp = F.pts[t]!, dd = Math.hypot(p[0] - fp[0], p[1] - fp[1], p[2] - fp[2]); if (dd < d) { d = dd; q = t; } }
          const fp = F.pts[q]!, dxy = Math.hypot(p[0] - fp[0], p[1] - fp[1]), here = (p[2] - fp[2]) * up;
          const want = Math.sqrt(Math.max(0, (CLEAR_TARGET * together) ** 2 - dxy * dxy));
          const v = up * Math.max(0, want - here); if (Math.abs(v) > Math.abs(need[k]!)) need[k] = v;
        }
      }
      // ease it out over a stretch either side (the strongest of the samples near, each falling off smoothly), and let it go to nothing at the vessel's ends
      const w = CLEAR_EASE * together, own = dz.get(M.v.id)!, zone = 3 * M.v.radius;
      for (let k = 0; k < M.pts.length; k++) {
        let best = 0;
        for (let t = 0; t < M.pts.length; t++) { if (!need[t]) continue; const x = Math.abs(M.s[k]! - M.s[t]!) / w; if (x >= 1) continue; const v = need[t]! * smooth(1 - x); if (Math.abs(v) > Math.abs(best)) best = v; }
        best *= smooth(Math.min(M.s[k]!, M.total - M.s[k]!) / zone);
        const sum = Math.abs(best) > Math.abs(own[k]!) ? best : own[k]!;
        const v = Math.max(-CLEAR_MAX, Math.min(CLEAR_MAX, sum));
        if (Math.abs(v - own[k]!) > 1e-9) { own[k] = v; changed = true; }
      }
    }
    if (!changed) break;
  }
  const out = new Map<string, ClearProfile>();
  for (const s of all) { const d = dz.get(s.v.id)!; if (d.some((x) => Math.abs(x) > 1e-9)) out.set(s.v.id, { u: s.s.map((x) => x / s.total), dz: Array.from(d) }); }
  return out;
}

/** The depth to add at share `u` of the course (linear between the profile's samples). */
export function clearAt(p: ClearProfile | undefined, u: number): number {
  if (!p) return 0;
  const { u: us, dz } = p;
  if (u <= us[0]!) return dz[0]!;
  if (u >= us[us.length - 1]!) return dz[dz.length - 1]!;
  let lo = 0, hi = us.length - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (us[m]! <= u) lo = m; else hi = m; }
  const t = (u - us[lo]!) / (us[hi]! - us[lo]! || 1);
  return dz[lo]! + (dz[hi]! - dz[lo]!) * t;
}
