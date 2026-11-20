// Arms that meet at a shallow angle cannot be welded (Mohammad, 20 Nov 2026: every junction welded; 55 of the Lobule's were skipped). Root cause: the Lobule's sinusoids merge two into one
// at a V of only 4 to 15 degrees at the junction centre, so the two tubes lie ON each other for ten radii and more before they part. A skin's seam ring must stand clear of every other arm's
// blend, which at 4 degrees is 40 radii out (the room an arm has), and the remesh of three nearly parallel, equal tubes runs away (past its vertex limit) or folds. The Anatomy never meets
// this: its branches leave a node at real angles. The fix is at the cause, in the shape: where arms meet closer than SPLAY_MIN_DEG, the last stretch of each movable arm is bent about J,
// fading out over SPLAY_LEN_R radii, until every pair stands at least that far apart (a T's host is not bent: only the branch is). The junction point, the radii and the colour places stay;
// only the last stretch of the path leans away from its neighbour, a lateral shift of a couple of radii at most. Pure (numbers in, numbers out).
import type { V3, WeldCourse } from './welds.ts';

/** The least angle (degrees) two arms of one junction may make, measured over their first SPLAY_PROBE_R radii. */
export const SPLAY_MIN_DEG = 40;
/** How far from J (in the arm's radii) the arm's direction is measured, and how far the bend takes to fade out. */
export const SPLAY_PROBE_R = 3, SPLAY_LEN_R = 12;
/** The lengths (times SPLAY_LEN_R radii) the blend from the new direction into the arm's own path is tried over, the shortest that keeps the arms from crossing taken. */
export const SPLAY_TRIES = [1, 1.5, 2.2, 3.2] as const;
/** Two arms' centres stay at least this share of their summed radii apart wherever they are not within reach of J itself. */
export const SPLAY_GAP = 1.05;
/** A branch that follows its host's bend eases the shift out over this many of its radii. */
export const SPLAY_CARRY_R = 6;

/** The structure of a junction the splay needs (welds.ts's Node has more). */
export interface SplayNode { id: string; J: V3; /* (moved in place when a bent host carries the T) */ ends: { c: number; end: 0 | 1 }[]; host?: { c: number; seg: number; t: number } }

const hyp = Math.hypot;
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => { const l = hyp(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const smooth = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };

/** `v` turned by `ang` radians about the unit `axis` (Rodrigues). */
export function rotate(v: V3, axis: V3, ang: number): V3 {
  const c = Math.cos(ang), s = Math.sin(ang), d = dot(axis, v) * (1 - c), x = cross(axis, v);
  return [v[0] * c + x[0] * s + axis[0] * d, v[1] * c + x[1] * s + axis[1] * d, v[2] * c + x[2] * s + axis[2] * d];
}

/** The path outward from J along an arm: the samples from `at` stepping `dir`. */
function stretch(pts: readonly V3[], at: number, dir: 1 | -1): number[] { const o: number[] = []; for (let i = at; i >= 0 && i < pts.length; i += dir) o.push(i); return o; }

/** The unit direction from J to the first sample on `idx` that is `reach` away (the last sample if the arm is shorter). */
function dirOf(pts: readonly V3[], idx: readonly number[], J: V3, reach: number): V3 {
  let p = pts[idx[idx.length - 1]!]!;
  for (const i of idx) { const q = pts[i]!; if (hyp(q[0] - J[0], q[1] - J[1], q[2] - J[2]) >= reach) { p = q; break; } }
  return unit([p[0] - J[0], p[1] - J[1], p[2] - J[2]]);
}

/** A copy of `cs` with the arms of every junction that meets at less than SPLAY_MIN_DEG bent apart. `angles` (optional) receives, per junction id, the smallest angle left. */
export function splayCourses(cs: readonly WeldCourse[], nodes: readonly SplayNode[], minDeg = SPLAY_MIN_DEG, trace?: (node: string, msg: string) => void): WeldCourse[] {
  const out = cs.map((c) => ({ ...c, pts: c.pts.map((p) => [...p] as V3) }));
  const minCos = Math.cos((minDeg * Math.PI) / 180);
  /** A course whose path moved carries the T's that end on its side: each T's junction point follows the host, and the branch's last stretch eases over to it. (Mutates the nodes' `J`.) */
  const carryTees = (host: number) => {
    for (const t of nodes) {
      if (!t.host || t.host.c !== host) continue;
      const h = out[host]!, a = h.pts[t.host.seg]!, b = h.pts[t.host.seg + 1]!, f = t.host.t;
      const J2: V3 = [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
      const dl: V3 = [J2[0] - t.J[0], J2[1] - t.J[1], J2[2] - t.J[2]];
      if (hyp(dl[0], dl[1], dl[2]) < 1e-9) continue;
      for (const e of t.ends) {
        const pts = out[e.c]!.pts, R = out[e.c]!.rad[e.end === 0 ? 0 : pts.length - 1]!, step = e.end === 0 ? 1 : -1;
        let run = 0, prev = pts[e.end === 0 ? 0 : pts.length - 1]!;
        for (let i = e.end === 0 ? 0 : pts.length - 1; i >= 0 && i < pts.length; i += step) {
          const q = pts[i]!;
          run += hyp(q[0] - prev[0], q[1] - prev[1], q[2] - prev[2]); prev = q;
          const w = 1 - smooth(run / (SPLAY_CARRY_R * R));
          if (w <= 0) break;
          pts[i] = [q[0] + dl[0] * w, q[1] + dl[1] * w, q[2] + dl[2] * w];
        }
      }
      t.J = J2;
    }
  };
  for (const n of [...nodes].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    type Arm = { c: number; idx: number[]; d: V3; d0: V3; fixed: boolean; arc: number[] };
    const arms: Arm[] = [];
    const arcOf = (c: number, idx: number[]): number[] => { const a: number[] = []; let run = 0, prev: V3 = n.J; for (const i of idx) { const q = out[c]!.pts[i]!; run += hyp(q[0] - prev[0], q[1] - prev[1], q[2] - prev[2]); prev = q; a.push(run); } return a; };
    const add = (c: number, idx: number[], R: number, fixed: boolean) => {
      const d = dirOf(out[c]!.pts, idx, n.J, SPLAY_PROBE_R * R);
      arms.push({ c, idx, d, d0: d, fixed, arc: arcOf(c, idx) });
    };
    for (const e of n.ends) {
      const at = e.end === 0 ? 0 : out[e.c]!.pts.length - 1, dir = e.end === 0 ? 1 : -1, R = out[e.c]!.rad[at]!, idx = stretch(out[e.c]!.pts, at, dir);
      add(e.c, idx, R, false);
    }
    if (n.host) {
      const h = out[n.host.c]!, R = h.rad[n.host.seg]!;
      add(n.host.c, stretch(h.pts, n.host.seg, -1), R, true);
      add(n.host.c, stretch(h.pts, n.host.seg + 1, 1), R, true);
    }
    // do any two arms meet closer than the least angle? (measured over their first radii)
    const spread = (dirs: V3[]): V3[] => {
      const d = dirs.map((v) => [...v] as V3);
      for (let sweep = 0; sweep < 40; sweep++) {
        let moved = false;
        for (let i = 0; i < arms.length; i++) for (let j = i + 1; j < arms.length; j++) {
          const a = arms[i]!, b = arms[j]!, c = dot(d[i]!, d[j]!);
          if (c <= minCos || (a.fixed && b.fixed)) continue;
          const deficit = (minDeg * Math.PI) / 180 - Math.acos(Math.max(-1, Math.min(1, c))) + 1e-3;
          // the plane's normal: from the pair, or the plan's up when they are parallel
          let nrm = cross(d[i]!, d[j]!);
          if (hyp(nrm[0], nrm[1], nrm[2]) < 1e-6) nrm = [0, 0, 1];
          nrm = unit(nrm);
          const share = a.fixed || b.fixed ? 1 : 0.5;
          // (a x b = nrm: turning a by minus the deficit moves it from b, b the other way)
          if (!a.fixed) d[i] = unit(rotate(d[i]!, nrm, -deficit * share));
          if (!b.fixed) d[j] = unit(rotate(d[j]!, nrm, deficit * share));
          moved = true;
        }
        if (!moved) break;
      }
      return d;
    };
    const probe = arms.map((a) => a.d), spreadProbe = spread(probe);
    if (spreadProbe.every((v, i) => dot(v, probe[i]!) > 1 - 1e-9)) continue;
    // Each movable arm is re-routed from J to a point Q further out on its own path (the first sample `len` along it): a cubic that leaves J in a direction of its own and meets the path at Q
    // in the path's own direction. Crossing arms cannot be pulled apart by turning their first stretch (they cross again further out), so Q is taken further and further out until the new
    // arms keep clear of one another.
    const R0 = out[arms.find((a) => !a.fixed)!.c]!.rad[arms.find((a) => !a.fixed)!.idx[0]!]!;
    for (const mult of SPLAY_TRIES) {
      const len = mult * SPLAY_LEN_R * R0;
      const Q = arms.map((a) => { let q = a.idx.length - 1; for (let k2 = 0; k2 < a.arc.length; k2++) if (a.arc[k2]! >= len) { q = k2; break; } return q; });
      const chord = arms.map((a, i) => (a.fixed ? a.d : unit((() => { const p = out[a.c]!.pts[a.idx[Q[i]!]!]!; return [p[0] - n.J[0], p[1] - n.J[1], p[2] - n.J[2]] as V3; })())));
      const dirs = spread(chord);
      const cand = new Map<number, V3[]>();
      arms.forEach((a, i) => {
        if (a.fixed) return;
        const q = Q[i]!, L = a.arc[q]!, P1 = out[a.c]!.pts[a.idx[q]!]!;
        const after = out[a.c]!.pts[a.idx[Math.min(a.idx.length - 1, q + 1)]!]!, before = out[a.c]!.pts[a.idx[Math.max(0, q - 1)]!]!;
        const t1 = unit([after[0] - before[0], after[1] - before[1], after[2] - before[2]]);
        const path: V3[] = [];
        a.idx.forEach((idx, k2) => {
          if (k2 > q) { path.push([...out[a.c]!.pts[idx]!] as V3); return; }
          const u = L > 0 ? a.arc[k2]! / L : 1, u2 = u * u, u3 = u2 * u;
          const h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
          path.push([0, 1, 2].map((c) => h00 * n.J[c]! + h10 * L * dirs[i]![c]! + h01 * P1[c]! + h11 * L * t1[c]!) as V3);
        });
        cand.set(i, path);
      });
      // the arms must not cross one another: the centre distance of any two samples stays above what two tubes need, apart from near J itself
      const at = (i: number, k2: number): V3 => cand.get(i)?.[k2] ?? out[arms[i]!.c]!.pts[arms[i]!.idx[k2]!]!;
      let ok = true;
      for (let i = 0; i < arms.length && ok; i++) for (let j = i + 1; j < arms.length && ok; j++) {
        if (!cand.has(i) && !cand.has(j)) continue;
        const a = arms[i]!, b = arms[j]!, Ra = out[a.c]!.rad[a.idx[0]!]!, Rb = out[b.c]!.rad[b.idx[0]!]!;
        for (let qa = 0; qa < a.idx.length && ok; qa++) {
          if (a.arc[qa]! > len * 1.3) break;
          const pa = at(i, qa);
          for (let qb = 0; qb < b.idx.length; qb++) {
            if (b.arc[qb]! > len * 1.3) break;
            const pb = at(j, qb), d = hyp(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]);
            if (d < Math.min(SPLAY_GAP * (Ra + Rb), 0.5 * Math.max(a.arc[qa]!, b.arc[qb]!) - 1e-3)) { ok = false; break; }
          }
        }
      }
      if (!ok) { if (mult === SPLAY_TRIES[SPLAY_TRIES.length - 1]) trace?.(n.id, 'splay: arms cross at every length, left as they are'); continue; }
      trace?.(n.id, `splay: bent over ${mult} x ${SPLAY_LEN_R} radii`);
      for (const [i, path] of cand) { const a = arms[i]!; a.idx.forEach((idx, k2) => { out[a.c]!.pts[idx] = path[k2]!; }); carryTees(a.c); }
      break;
    }
  }
  return out;
}
