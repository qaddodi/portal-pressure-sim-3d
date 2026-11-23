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
/** ...and at least this many lengths of the shift it carries (the branch turns by about 1.5 / this at most), and at most this share of the branch (its far end is its own junction's). */
export const SPLAY_CARRY_SLOPE = 5, SPLAY_CARRY_MAX = 0.6;
/** ...and at least this share of the branch (a small shift still eases over a few samples, which kinked a cross-link at its host end). */
export const SPLAY_CARRY_MIN_SHARE = 0.3;
/** The re-routed arm keeps its cubic out to this share of the way to Q; a C2 quintic tail then lands on the path at the wiggle's inflection, at most SPLAY_JOIN_EXT samples past Q. */
export const SPLAY_JOIN_U0 = 0.5, SPLAY_JOIN_EXT = 8;

/** The structure of a junction the splay needs (welds.ts's Node has more). */
export interface SplayNode { id: string; J: V3; /* (moved in place when a bent host carries the T) */ ends: { c: number; end: 0 | 1 }[]; host?: { c: number; seg: number; t: number } }

const hyp = Math.hypot;
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const unit = (a: V3): V3 => { const l = hyp(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const smoother = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * x * (x * (x * 6 - 15) + 10); };

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
        // (the ease is long enough for the branch to turn gently: a host's bend shifts a T's junction by many radii, and easing that over six radii kicked the cross-link's first samples sideways, turns of 75 and 60
        //  degrees in a few samples (118 degrees at an 143, 23 Nov, the SOS slide). It is at least SPLAY_CARRY_SLOPE lengths of the shift, never more than the share of the branch that leaves its other end alone,
        //  and it fades with a C2 curve, so the branch has no kink where the shift ends)
        let total = 0; for (let i = 1; i < pts.length; i++) total += hyp(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1], pts[i]![2] - pts[i - 1]![2]);
        const reach = Math.min(Math.max(SPLAY_CARRY_R * R, SPLAY_CARRY_SLOPE * hyp(dl[0], dl[1], dl[2]), SPLAY_CARRY_MIN_SHARE * total), SPLAY_CARRY_MAX * total);
        let run = 0, prev = pts[e.end === 0 ? 0 : pts.length - 1]!;
        for (let i = e.end === 0 ? 0 : pts.length - 1; i >= 0 && i < pts.length; i += step) {
          const q = pts[i]!;
          run += hyp(q[0] - prev[0], q[1] - prev[1], q[2] - prev[2]); prev = q;
          const w = 1 - smoother(run / reach);
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
      let reachMax = len;
      arms.forEach((a, i) => {
        if (a.fixed) return;
        const q = Q[i]!, L = a.arc[q]!, P1 = out[a.c]!.pts[a.idx[q]!]!;
        const after = out[a.c]!.pts[a.idx[Math.min(a.idx.length - 1, q + 1)]!]!, before = out[a.c]!.pts[a.idx[Math.max(0, q - 1)]!]!;
        const t1 = unit([after[0] - before[0], after[1] - before[1], after[2] - before[2]]);
        const P = (k: number) => out[a.c]!.pts[a.idx[k]!]!;
        /** The Hermite cubic from J to Q: position, first and second derivative in u (0..1). */
        const H = (u: number): V3 => { const u2 = u * u, u3 = u2 * u; return [0, 1, 2].map((c) => (2 * u3 - 3 * u2 + 1) * n.J[c]! + (u3 - 2 * u2 + u) * L * dirs[i]![c]! + (-2 * u3 + 3 * u2) * P1[c]! + (u3 - u2) * L * t1[c]!) as V3; };
        const H1 = (u: number) => { const u2 = u * u; return [0, 1, 2].map((c) => (6 * u2 - 6 * u) * n.J[c]! + (3 * u2 - 4 * u + 1) * L * dirs[i]![c]! + (-6 * u2 + 6 * u) * P1[c]! + (3 * u2 - 2 * u) * L * t1[c]!); };
        const H2 = (u: number) => [0, 1, 2].map((c) => (12 * u - 6) * n.J[c]! + (6 * u - 4) * L * dirs[i]![c]! + (-12 * u + 6) * P1[c]! + (6 * u - 2) * L * t1[c]!);
        // (the cubic is nearly straight, so it erases the course's wiggle on J..Q and met it at Q wherever the wiggle happened to be, a turn of -5 degrees per sample at the SOS ring's course, 23 Nov. The cubic stays
        //  as it is out to U0 of the way, so the skins' seams see the same arms; a quintic tail then carries its position, direction and curvature to the path's own at the wiggle's inflection)
        // the turn (signed, about the plan's up) at sample k of the original path
        const turnAt = (k: number) => { const A = P(k - 1), B = P(k), C = P(k + 1); return Math.atan2((B[0] - A[0]) * (C[1] - B[1]) - (B[1] - A[1]) * (C[0] - B[0]), (B[0] - A[0]) * (C[0] - B[0]) + (B[1] - A[1]) * (C[1] - B[1])); };
        let qE = q;
        if (q >= 1) {
          let best = Infinity;
          for (let k = q; k <= Math.min(a.idx.length - 2, q + SPLAY_JOIN_EXT); k++) {
            const tk = Math.abs(turnAt(k)); if (tk < best) { best = tk; qE = k; }
            if (k > q && Math.sign(turnAt(k)) !== Math.sign(turnAt(k - 1))) break;
          }
        }
        /** The unit tangent and the curvature vector (normal part of the second derivative over speed squared) of a curve with first and second derivatives d1, d2. */
        const geo = (d1: number[], d2: number[]) => { const sp = hyp(d1[0]!, d1[1]!, d1[2]!), T = d1.map((x) => x / sp), dt = d2[0]! * T[0]! + d2[1]! * T[1]! + d2[2]! * T[2]!; return { T, K: d2.map((x, c) => (x - dt * T[c]!) / (sp * sp)) }; };
        const s0 = SPLAY_JOIN_U0 * L, s1 = a.arc[qE]!, Lw = s1 - s0;
        const tail = q >= 1 && qE + 1 < a.idx.length && qE >= 1 && Lw > 1e-9;
        let PA: V3 = n.J, PB: V3 = n.J, g0 = { T: [0, 0, 0], K: [0, 0, 0] }, g1 = g0;
        if (tail) {
          PA = H(SPLAY_JOIN_U0); g0 = geo(H1(SPLAY_JOIN_U0), H2(SPLAY_JOIN_U0));
          // the path's own state at qE: central differences by arc length (the samples are not evenly spaced)
          const pa = P(qE + 1), pb = P(qE - 1), pm = P(qE), hA = a.arc[qE + 1]! - a.arc[qE]!, hB = a.arc[qE]! - a.arc[qE - 1]!;
          PB = pm;
          g1 = geo([0, 1, 2].map((c) => (pa[c]! - pb[c]!) / (hA + hB)), [0, 1, 2].map((c) => 2 * ((pa[c]! - pm[c]!) / hA - (pm[c]! - pb[c]!) / hB) / (hA + hB)));
          reachMax = Math.max(reachMax, s1);
        }
        const path: V3[] = [];
        a.idx.forEach((idx, k2) => {
          const s = a.arc[k2]!;
          if (tail && s > s0 && k2 <= qE) {
            const t = (s - s0) / Lw, t2 = t * t, t3 = t2 * t, t4 = t3 * t, t5 = t4 * t;
            const b0 = 1 - 10 * t3 + 15 * t4 - 6 * t5, b1 = t - 6 * t3 + 8 * t4 - 3 * t5, b2 = 0.5 * t2 - 1.5 * t3 + 1.5 * t4 - 0.5 * t5, b3 = 0.5 * t3 - t4 + 0.5 * t5, b4 = -4 * t3 + 7 * t4 - 3 * t5, b5 = 10 * t3 - 15 * t4 + 6 * t5;
            path.push([0, 1, 2].map((c) => b0 * PA[c]! + b1 * g0.T[c]! * Lw + b2 * g0.K[c]! * Lw * Lw + b3 * g1.K[c]! * Lw * Lw + b4 * g1.T[c]! * Lw + b5 * PB[c]!) as V3);
            return;
          }
          if (k2 > q && !(tail && k2 <= qE)) { path.push([...out[a.c]!.pts[idx]!] as V3); return; }
          path.push(H(L > 0 ? s / L : 1));
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
          if (a.arc[qa]! > reachMax * 1.3) break;
          const pa = at(i, qa);
          for (let qb = 0; qb < b.idx.length; qb++) {
            if (b.arc[qb]! > reachMax * 1.3) break;
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
