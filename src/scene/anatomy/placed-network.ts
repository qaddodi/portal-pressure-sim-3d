// THE PLACED VESSEL NETWORK (anatomy integration plan, section 3.1; docs/approved/anatomy-placement.md, frozen round 16). The approved placement describes WHOLE vessels (ivc, pv, sv, ...); the app draws the
// engine's PIECES of them (ILI_IVC, IVC_IS_1, ...), because the engine cuts a vein where a shunt or a collateral joins it. This file turns the one into the other, in 3D, once at load:
//   1. every course is made dense and relaxed as the mock makes it (geom.js denseCurve, relax 40), so the app's courses are the approved ones;
//   2. RUN-ONS (two vessels that carry on into one another at a node: the SMV into the portal vein, the coronary vein into the varices, the varices on to the azygos side, the cava and the SVC in the atrium, ...) are made ONE curve:
//      the stretch of one that doubles back along the other is cut away, the two are joined end to end, and the joined course is relaxed over a window either side of the join, then split there again. Both pieces are
//      pieces of one smooth curve, so position, heading and curvature run on through the join (Mohammad, 24 Nov: "the coronary vein to the esophageal varices ... not so smooth of a transition");
//   3. BRANCHES (a vein that ends on another's course part-way: the splenic vein on the confluence, the hepatic veins on the cava, a collateral or a shunt on its host) arrive on the host's centreline at an acute angle along the
//      host's flow (geom.js joinEnd, the mock's Y-merge), so a branch never leaves a wall backwards or as a hairpin;
//   4. each whole vessel is cut into its engine pieces at the 3D attach point of what joins there (the nearest point of the course to the joining vessel's end), not at the old length shares;
//   5. the draw-only branches (rhva, rhvb, rpva, rpvp) hang on their host: the straighter one runs on from the trunk as its through branch (one tube to the tip, as liver-branches.ts draws a branching vein), the other is
//      a side branch; the caudate veins (cv1-3) are joined into the cava the same way; the liver beds (no placed course) are today's beds carried onto the moved nodes.
// Pure data, no three.js, no reader of network.ts (network.ts reads this when PLACED is on).
import { PLACED_COURSES, PLACED_VESSELS, PLACED_JOINS, PLACED_ORGANS } from './placement.generated.ts';
import { EDGES, JUNCTIONS } from '../../engine/hales/portal/topology.js';
import { ANAT_HIDDEN, EDGE_PATH_2D, HIDDEN_EDGES, PLACED } from './source.ts';
import { x2d, y2d } from '../frame2d.ts';

export type V3 = [number, number, number];
type P2 = [number, number];
interface Edge { id: string; from: string; to: string; kind: string; shunt?: string; share?: number }
const edges = EDGES as Edge[];
const edgeById = new Map(edges.map((e) => [e.id, e]));

/** Whole vessel (the placement's key) -> its engine pieces in flow order (the brief's mapping). */
export const WHOLE_PIECES: Readonly<Record<string, readonly string[]>> = {
  ivc: ['ILI_IVC', 'ILI_IVC_1', 'IVC_IS_1', 'IVC_IS', 'IVCS_RA'], svc: ['V_UP', 'SVC_RA_1', 'SVC_RA'], azygos: ['C9', 'AZY_SVC'], rhv: ['RHV_IVC_1', 'RHV_IVC'],
  mhv: ['MHV_IVC'], lhv: ['LHV_IVC'], lrv: ['V_KID_L', 'V_KID_L_1', 'LRV_IVC'], pv: ['PV_TRUNK_1', 'PV_TRUNK'], rpv: ['PVH_R', 'PVH_R_1', 'PVH_R_2'], lpv: ['PVH_L', 'PVH_L_1'],
  sv: ['V_SPL', 'SV_MID', 'SV_CONF'], smv: ['V_INT', 'V_INT_1', 'SMV_CONF'], imv: ['V_COL', 'V_IMV'], lgv: ['LGV_CONF'], ha: ['A_HEP'], rha: ['A_HR'], lha: ['A_HL'],
};
/** The collaterals and shunts: their own ids are the placement's keys. */
const OWN = ['C1a', 'C1b', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'EPI_SVC', 'EPI_ILI', 'TIPS', 'DIPS', 'S_PC', 'S_MC', 'S_DSR', 'REX'] as const;
/** The draw-only branches on a host's end (no engine edge): the host's last (portal, `out`) or first (hepatic, `in`) piece, and which of the two runs on as the through branch (the straighter one; the HVPG wedges
 *  in the right hepatic vein's main trunk, short of the fork: Mohammad 24 Nov). */
export const PLACED_BRANCHES: Readonly<Record<string, { whole: string; out: boolean; through: string; side: string }>> = {
  PVH_R_2: { whole: 'rpv', out: true, through: 'rpvp', side: 'rpva' },
  RHV_IVC_1: { whole: 'rhv', out: false, through: 'rhvb', side: 'rhva' },
};
const PIECE_WHOLE = new Map<string, string>();
for (const [w, ps] of Object.entries(WHOLE_PIECES)) for (const p of ps) PIECE_WHOLE.set(p, w);
for (const id of OWN) PIECE_WHOLE.set(id, id);
/** The whole placed vessel an engine edge is a piece of (its own id for a collateral or a shunt), or undefined (a liver bed). */
export const wholeOf = (id: string): string | undefined => PIECE_WHOLE.get(id);

// ---- dense courses (geom.js denseCurve + relax: the mock's own) ----
const STEP = 0.006;
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
const norm = (a: V3): V3 => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const smooth = (u: number): number => (u <= 0 ? 0 : u >= 1 ? 1 : u * u * (3 - 2 * u));
const rev = <T>(a: readonly T[]): T[] => a.slice().reverse();

function denseCurve(ctrl: readonly (readonly number[])[]): V3[] {
  const P = [ctrl[0]!, ...ctrl, ctrl[ctrl.length - 1]!], dense: V3[] = [];
  for (let i = 1; i < P.length - 2; i++) {
    const p0 = P[i - 1]!, p1 = P[i]!, p2 = P[i + 1]!, p3 = P[i + 2]!;
    const d1 = Math.hypot(p2[0]! - p1[0]!, p2[1]! - p1[1]!, p2[2]! - p1[2]!) || 1e-6;
    const d0 = Math.hypot(p1[0]! - p0[0]!, p1[1]! - p0[1]!, p1[2]! - p0[2]!) || d1, d2 = Math.hypot(p3[0]! - p2[0]!, p3[1]! - p2[1]!, p3[2]! - p2[2]!) || d1;
    const m1 = [0, 1, 2].map((j) => ((p2[j]! - p0[j]!) / (d0 + d1)) * d1), m2 = [0, 1, 2].map((j) => ((p3[j]! - p1[j]!) / (d1 + d2)) * d1);
    const N = 30;
    for (let k = 0; k < N; k++) {
      const u = k / N, u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
      dense.push([0, 1, 2].map((j) => h00 * p1[j]! + h10 * m1[j]! + h01 * p2[j]! + h11 * m2[j]!) as V3);
    }
  }
  const last = ctrl[ctrl.length - 1]!;
  dense.push([last[0]!, last[1]!, last[2]!]);
  return resample(dense, STEP);
}
/** Even arc-length spacing near `step` (the ends kept). */
function resample(p: readonly V3[], step: number): V3[] {
  const s = [0]; for (let i = 1; i < p.length; i++) s.push(s[i - 1]! + len(sub(p[i]!, p[i - 1]!)));
  const L = s[s.length - 1]!, n = Math.max(2, Math.round(L / step)), out: V3[] = []; let j = 1;
  for (let i = 0; i <= n; i++) {
    const d = (L * i) / n; while (j < p.length - 1 && s[j]! < d) j++;
    const u = (d - s[j - 1]!) / ((s[j]! - s[j - 1]!) || 1);
    out.push(add(p[j - 1]!, mul(sub(p[j]!, p[j - 1]!), Math.min(1, Math.max(0, u)))));
  }
  return out;
}
/** Laplacian relax, `w(i)` the share each point takes (0 holds it); the two ends are always held. */
function relax(D: V3[], iters: number, w: (i: number) => number = () => 1): V3[] {
  const W = D.map((_, i) => (i === 0 || i === D.length - 1 ? 0 : w(i)));
  for (let it = 0; it < iters; it++) {
    const N = D.map((p) => [p[0], p[1], p[2]] as V3);
    for (let i = 1; i < D.length - 1; i++) { const k = W[i]!; if (k <= 0) continue; for (let j = 0; j < 3; j++) N[i]![j] = D[i]![j]! + k * (0.25 * D[i - 1]![j]! - 0.5 * D[i]![j]! + 0.25 * D[i + 1]![j]!); }
    D = N;
  }
  return D;
}
const arc = (D: readonly V3[]): number[] => { const s = [0]; for (let i = 1; i < D.length; i++) s.push(s[i - 1]! + len(sub(D[i]!, D[i - 1]!))); return s; };
const lengthOf = (D: readonly V3[]): number => arc(D)[D.length - 1]!;
const tangentAt = (D: readonly V3[], i: number): V3 => norm(sub(D[Math.min(D.length - 1, i + 3)]!, D[Math.max(0, i - 3)]!));
function nearestIdx(D: readonly V3[], p: V3, lo = 0, hi = D.length - 1): { i: number; d: number } {
  let best = lo, bd = Infinity; for (let i = lo; i <= hi; i++) { const d = len(sub(D[i]!, p)); if (d < bd) { bd = d; best = i; } } return { i: best, d: bd };
}
/** The nearest point ON the polyline (between samples), with its arc length. */
function nearestOn(D: readonly V3[], p: V3): { at: V3; s: number; d: number; i: number } {
  const s = arc(D); let best = { at: D[0]!, s: 0, d: Infinity, i: 0 };
  for (let i = 1; i < D.length; i++) {
    const a = D[i - 1]!, ab = sub(D[i]!, a), l2 = dot(ab, ab), t = l2 ? Math.min(1, Math.max(0, dot(sub(p, a), ab) / l2)) : 0, q = add(a, mul(ab, t)), d = len(sub(p, q));
    if (d < best.d) best = { at: q, s: s[i - 1]! + t * (s[i]! - s[i - 1]!), d, i: t < 0.5 ? i - 1 : i };
  }
  return best;
}

/** THE BEND FLOOR (Mohammad, 24 Nov: "all blood vessels run organically smoothly"): a course turns no more than FAIR_TURN degrees over any 0.01 of its length (tests/anatomy/smooth.ts measures 0.01 steps, bar 12),
 *  and its turning changes gradually. Where it would, the stretch round it is relaxed (and only there), its ends held, until it does. */
export const FAIR_TURN = 8.5;
/** The most a branch's approach (its chord to the landing) may be off the host's flow before the landing moves on along it (joinEnd). */
const MERGE_MAX = 60;
/** The least a branch's arrival is off its host's axis (joinEnd). */
const MERGE_MIN = 40;
/** How long a carried trunk is, in its radii (the 2D figure's right portal trunk, bifurcation to split: 8.3), and the right hepatic vein's extra length at the crowded cava. */
const TRUNK_R = 8;
const SPLIT_PAST = 3;
/** How far back along a branch its course may be re-routed to reach a landing the trunk sets. */
const FORCE_REACH = 0.35;
const RHV_SPLIT = 7.5;
/** The right hepatic vein's trunk from the TIPS's mouth to the cava at least (the cava's junction is crowded: five arms). */
const RHV_MIN = 0.26;
const FAIR_SPAN = 0.05;
const ang = (a: V3, b: V3): number => { const l = len(a) * len(b); return l < 1e-12 ? 0 : (Math.acos(Math.max(-1, Math.min(1, dot(a, b) / l))) * 180) / Math.PI; };
/** `zone`: the stretch (arc length from the start, [from, to]) the fairing may move, easing to nothing over FAIR_SPAN outside it (the rest of the course, and the joins made there, keep their places and headings). */
function fair(D: V3[], zone: readonly [number, number] = [-Infinity, Infinity]): V3[] {
  const k = Math.max(1, Math.round(0.01 / STEP));
  const zw = (sv: number): number => (sv < zone[0] ? 1 - smooth((zone[0] - sv) / FAIR_SPAN) : sv > zone[1] ? 1 - smooth((sv - zone[1]) / FAIR_SPAN) : 1);
  for (let round = 0; round < 120; round++) {
    const s = arc(D), n = D.length, T = new Float64Array(n);
    for (let i = k; i < n - k; i++) T[i] = ang(sub(D[i]!, D[i - k]!), sub(D[i + k]!, D[i]!));
    const bad: number[] = [];
    for (let i = k; i < n - k; i++) if (zw(s[i]!) > 0 && (T[i]! > FAIR_TURN || (i > k && Math.abs(T[i]! - T[i - 1]!) * k > 5))) bad.push(i);
    if (!bad.length) break;
    const w = new Float64Array(n);
    for (const j of bad) for (let i = 0; i < n; i++) { const d = Math.abs(s[i]! - s[j]!); if (d < FAIR_SPAN) w[i] = Math.max(w[i]!, 1 - smooth(d / FAIR_SPAN)); }
    D = relax(D, 6, (i) => w[i]! * zw(s[i]!));
  }
  return D;
}

// ---- the network, built once at load and only with the switch on (today's path never pays for it) ----
export const RUNON_WINDOW = 0.12;
export const PLACED_EDGE_3D: Record<string, V3[]> = {};
export const PLACED_NODE_3D: Record<string, V3> = {};
export interface PlacedSplit { /** where the split is along the drawn vein, 0 to 1 by length from its root (the portal veins' start, the hepatic veins' IVC end), liver-branches.ts Tree.q */ q: number; /** the side branch, flow order */ side: V3[] }
export const PLACED_SPLIT: Record<string, PlacedSplit> = {};
export const PLACED_CAUDATE_VEINS: V3[][] = [];
export const PLACED_CAUDATE_R: number[] = [];
export const PLACED_PATH_2D: Record<string, readonly (readonly [number, number])[]> = {};
export const PLACED_Z: Record<string, readonly number[]> = {};
export const PLACED_NODE_2D: Record<string, readonly [number, number]> = {};
/** Built only with the approved placement switched on (`?anatomy=new`, PPS_ANATOMY=placed). */
function buildPlaced(): void {
  const COURSE: Record<string, V3[]> = {};
  const rOf = (k: string): number => PLACED_VESSELS[k]?.r ?? 0.01;
  for (const [k, c] of Object.entries(PLACED_COURSES)) COURSE[k] = fair(relax(denseCurve(c), PLACED_JOINS.relax ?? 40));

  // ---- run-ons: one smooth curve through the node ----
  /** How far either side of a run-on the joined course is relaxed (scene units; at most this share of each course). */
  const RUNON_SHARE = 0.4;
  /** `a`'s end `ea` and `b`'s end `eb` meet end to end. `a` keeps its end where it is (it is the trunk); the stretch of `b` that lies back along `a` is cut away. Both courses are rewritten. */
  function runOn(a: string, ea: 0 | 1, b: string, eb: 0 | 1, meet: 'a' | 'mid' = 'a'): void {
    let A = ea ? COURSE[a]! : rev(COURSE[a]!);   // (A ends at the node)
    let B = eb ? rev(COURSE[b]!) : COURSE[b]!;   // (B starts at it)
    let N = meet === 'mid' ? mul(add(A[A.length - 1]!, B[0]!), 0.5) : A[A.length - 1]!;
    // the stretch of B that runs back along A (it starts part-way down A: a doubled tube): B starts where it passes nearest the node
    const kB = nearestIdx(B, N, 0, Math.floor(B.length * 0.5)).i;
    if (kB > 0) B = B.slice(kB);
    // the same for A, when B's start lies back along A
    const kA = nearestIdx(A, B[0]!, Math.floor(A.length * 0.5), A.length - 1).i;
    if (meet === 'mid' && kA < A.length - 1) A = A.slice(0, kA + 1);
    if (meet === 'mid') N = mul(add(A[A.length - 1]!, B[0]!), 0.5);
    // ease each end onto the node over a short stretch, then join and relax the joined course round the node
    const ease = (D: V3[], atEnd: boolean): V3[] => { const s = arc(D), L = s[s.length - 1]!, reach = Math.min(0.06, 0.3 * L), d = sub(N, atEnd ? D[D.length - 1]! : D[0]!); return D.map((p, i) => add(p, mul(d, 1 - smooth((atEnd ? L - s[i]! : s[i]!) / reach)))); };
    A = ease(A, true); B = ease(B, false);
    const J = [...A, ...B.slice(1)], at = A.length - 1, sJ = arc(J), s0 = sJ[at]!;
    const wa = Math.min(RUNON_WINDOW, RUNON_SHARE * lengthOf(A)), wb = Math.min(RUNON_WINDOW, RUNON_SHARE * lengthOf(B));
    const R = relax(J, 400, (i) => { const d = sJ[i]! - s0, w = d < 0 ? -d / wa : d / wb; return 1 - smooth(w); });
    // (faired only round the join: the courses' far ends, and the joins already made there, keep their headings)
    const zA = Math.max(0, at - Math.round((wa + FAIR_SPAN) / STEP)), zB = Math.max(0, R.length - 1 - at - Math.round((wb + FAIR_SPAN) / STEP));
    void zA; void zB;
    const F = fair(R, [s0 - wa, s0 + wb]);
    A = resample(F.slice(0, at + 1), STEP); B = resample(F.slice(at), STEP);
    COURSE[a] = ea ? A : rev(A); COURSE[b] = eb ? rev(B) : B;
  }

  // ---- branches: arrive on the host's centreline at an acute angle along its flow (geom.js joinEnd) ----
  /** `D` (its join end last) arrives on `P` (in the sense the flow should merge along). */
  function joinEnd(D: V3[], P: readonly V3[], rP: number, rD: number, force?: V3): V3[] {
    const end = D[D.length - 1]!, hit = nearestOn(P, force ?? end);
    let cut = 3.2 * rP + 3 * rD;
    let k = D.length - 1, acc = 0; while (k > 1 && acc < cut) { acc += len(sub(D[k]!, D[k - 1]!)); k--; }
    // (a landing set by the trunk (the TIPS's mouth on a carried trunk) is approached from far enough back that the branch comes at it along the host's flow, within MERGE_MAX: the re-routed stretch is longer, never a reversal)
    if (force) { const tf = tangentAt(P, hit.i); while (k > 1 && acc < FORCE_REACH && dot(norm(sub(hit.at, D[k]!)), tf) < Math.cos((MERGE_MAX * Math.PI) / 180)) { acc += len(sub(D[k]!, D[k - 1]!)); k--; } cut = acc; }
    const P0 = D[k]!, t0 = tangentAt(D, k);
    // AGAINST THE FLOW: where the placed course comes at its landing from downstream (its chord more than 90 degrees off the host's flow: the varices' drain over the azygos arch from the cava's side,
    // the fundal varices off the splenic vein toward the spleen), no arrival there merges along the flow (chord + 0.9 tangent points backward: a hairpin, a reversal). The landing moves on along the
    // host's flow to the first place the chord is within MERGE_MAX of it (the best one within reach when none is), so the branch merges forward (Mohammad, 24 Nov: "no hairpin, no reversal").
    let Jp = hit.at, tp = tangentAt(P, hit.i);
    if (!force && dot(norm(sub(Jp, P0)), tp) < 0) {
      const last = P.length - 1 - Math.ceil((2 * rP) / STEP);
      let bj = -1, bc = -Infinity;
      for (let j = hit.i + 1; j <= last; j++) { const c = dot(norm(sub(P[j]!, P0)), tangentAt(P, j)); if (c > bc) { bc = c; bj = j; } if (c >= Math.cos((MERGE_MAX * Math.PI) / 180)) break; }
      if (bj >= 0 && bc > dot(norm(sub(Jp, P0)), tp)) { Jp = P[bj]!; tp = tangentAt(P, bj); }
    }
    const chord = norm(sub(Jp, P0));
    // (the arrival is along the flow but never nearly parallel to it: at least MERGE_MIN off the host's axis, in the plane of the approach. A branch that slid in at 20 degrees (the DIPS on the cava) left a crotch too thin
    //  for its skin, whose normals turned 88 degrees between neighbours; the 2D figure's own merges are 40 to 60)
    let t1 = norm(add(chord, mul(tp, 0.9)));
    { const c = dot(t1, tp), lo = Math.cos((MERGE_MIN * Math.PI) / 180); if (c > lo) { let n = sub(chord, mul(tp, dot(chord, tp))); if (len(n) < 1e-6) n = sub(t0, mul(tp, dot(t0, tp))); if (len(n) > 1e-6) { n = norm(n); const a = (MERGE_MIN * Math.PI) / 180; t1 = norm(add(mul(tp, Math.cos(a)), mul(n, Math.sin(a)))); } } }
    const L = len(sub(Jp, P0));
    const n = Math.max(4, Math.round(L / STEP)), out = D.slice(0, k + 1);
    for (let i = 1; i <= n; i++) {
      const u = i / n, u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
      out.push([0, 1, 2].map((q) => h00 * P0[q]! + h10 * t0[q]! * L + h01 * Jp[q]! + h11 * t1[q]! * L) as V3);
    }
    // (relaxed round the old corner at P0, the end held on the host: the bend into the merge is gradual, not a Hermite's sudden start)
    const s = arc(out), sk = s[k]!, w = Math.max(0.04, 0.6 * cut), tot = s[s.length - 1]!;
    return resample(relax(out, 200, (i) => Math.min(1 - smooth(Math.abs(s[i]! - sk) / w), smooth((tot - s[i]!) / (0.5 * L)))), STEP);
  }
  /** Vessel `v`'s end `end` joins host course `h` as a branch (a tributary when its flow ends there, a branch leaving when it starts there). */
  function branch(v: string, end: 0 | 1, host: string, hostCourse?: V3[], force?: V3): void {
    const P = hostCourse ?? COURSE[host]!, D = COURSE[v]!;
    // (faired only over the stretch the merge re-routed and a little more: the far end, and whatever join it has, keeps its heading)
    const R = joinEnd(end ? D : rev(D), end ? P : rev(P), rOf(host), rOf(v), force), m = Math.round((3.2 * rOf(host) + 3 * rOf(v) + 0.1 + (force ? FORCE_REACH : 0)) / STEP);
    const sR = arc(R), tot = sR[sR.length - 1]!;
    const F = fair(R, [tot - m * STEP, Infinity]);
    COURSE[v] = end ? F : rev(F);
  }

  // the joins, in the mock's order (parents first), then the collaterals' and shunts' ends
  const J: { readonly joins: readonly { readonly v: string; readonly to: string; readonly end?: 0 | 1; readonly runon?: boolean }[] } = PLACED_JOINS;
  // (run-ons first: they rewrite both courses' ends; then every branch lands on the courses as they stand)
  runOn('smv', 1, 'pv', 0);
  runOn('pv', 1, 'rpv', 0);
  runOn('ha', 1, 'rha', 0);
  runOn('ivc', 1, 'svc', 1, 'mid');
  // THE ATRIUM'S DEPTH: the cava and the SVC end in the right atrium at the depth the placed organ has (placement A's heart-ra, its centre zc), each on one monotone slope over its last stretch (no dip behind the heart on
  // the way in: tests/b3-smooth-joins.test.ts); the run-on point meets there from both sides
  {
    const zA = PLACED_ORGANS.A['heart-ra'].zc;
    for (const [w, W] of [['ivc', 0.2], ['svc', 0.25]] as const) {
      const D = COURSE[w]!, sD = arc(D), L = sD[sD.length - 1]!, k = Math.max(0, sD.findIndex((x) => x >= L - W)), span = L - sD[k]!;
      // (a cubic in depth from the course's own depth and slope where the stretch starts to the atrium's depth, level at the end: unbroken where it starts, monotone, and the two meet level, heading on)
      const z0 = D[k]![2], j = Math.min(D.length - 1, k + 3), m0 = ((D[j]![2] - D[Math.max(0, k - 3)]![2]) / Math.max(1e-9, sD[j]! - sD[Math.max(0, k - 3)]!)) * span;
      COURSE[w] = D.map((p, i) => { if (i < k) return p; const t = (sD[i]! - sD[k]!) / span, t2 = t * t, t3 = t2 * t; return [p[0], p[1], (2 * t3 - 3 * t2 + 1) * z0 + (t3 - 2 * t2 + t) * m0 + (3 * t2 - 2 * t3) * zA] as V3; });
    }
  }
  runOn('lgv', 0, 'C1a', 0);
  runOn('C1a', 1, 'C1b', 0, 'mid');
  runOn('C2', 1, 'C5', 0, 'mid');
  runOn('EPI_ILI', 0, 'EPI_SVC', 0, 'mid');
  // the draw-only through branches run on from their trunk (one tube to the tip)
  runOn('rpv', 1, 'rpvp', 0);
  runOn('rhv', 0, 'rhvb', 0);
  // THE TRUNKS CARRIED ON (Mohammad, 24 Nov: no old-style join may ship): the placed right portal trunk is 0.116 long, the right hepatic one about as short at the crowded cava, and each must hold its engine pieces
  // (PVH_R, PVH_R_1 to the TIPS's mouth; RHV_IVC from the TIPS's mouth to the cava) with a skin at both ends: a piece shorter than about four of its radii a side has no ring clear of the blends, and the skins at PVH, RPV_T
  // and IVCS fell back. So the trunk runs on along its through branch (one placed curve: the drawn picture is the same tube) until it is long enough, and the split, the side branch's root and the TIPS's mouth sit at its
  // new end, as the 2D figure has them (the TIPS leaves at the split).
  const carry = (trunk: string, through: string, atEnd: boolean, need: number): void => {
    const T = COURSE[trunk]!, B = COURSE[through]!, have = lengthOf(T), sB = arc(B);
    if (have >= need) return;
    const k = Math.max(1, Math.min(B.length - 1 - Math.ceil(0.1 / STEP), sB.findIndex((x) => x >= need - have)));
    const moved = B.slice(0, k + 1);
    COURSE[trunk] = atEnd ? [...T, ...moved.slice(1)] : [...rev(moved), ...T.slice(1)];
    COURSE[through] = B.slice(k);
  };
  // (the right portal vein's second branch leaves SPLIT_PAST of its radii past the TIPS's mouth, one more arm of that node's skin (RPV_T, as the 2D figure has it); the right hepatic vein's leaves RHV_SPLIT of its radii from
  //  the TIPS's mouth, deep enough to be a junction of its own in the middle of the vein (skin/inventory.ts SKIN_REACH, the 2D figure's 8.6))
  carry('rpv', 'rpvp', true, (TRUNK_R + SPLIT_PAST) * rOf('rpv'));
  carry('rhv', 'rhvb', false, Math.max(lengthOf(COURSE.rhv!), RHV_MIN) + RHV_SPLIT * rOf('rhv'));
  /** Where the side branch leaves a carried trunk (its split), and where the TIPS does. */
  const SPLIT_POINT: Record<string, V3> = { rpv: COURSE.rpv![COURSE.rpv!.length - 1]!, rhv: COURSE.rhv![0]! };
  const along = (D: readonly V3[], d: number): V3 => { const sD = arc(D); const i = Math.max(0, sD.findIndex((x) => x >= d)); return D[i]!; };
  const TIPS_POINT: Record<string, V3> = { rpv: along(COURSE.rpv!, lengthOf(COURSE.rpv!) - SPLIT_PAST * rOf('rpv')), rhv: along(COURSE.rhv!, RHV_SPLIT * rOf('rhv')) };
  for (const jn of J.joins) {
    if (jn.runon || jn.end == null) continue;
    if (['rpvp', 'rhvb', 'rha'].includes(jn.v) || (jn.v === 'rpv' && jn.to === 'pv')) continue;   // (run-ons above)
    if (jn.v === 'rpva') { branch('rpva', 0, 'rpv', [...COURSE.rpv!, ...COURSE.rpvp!.slice(1)], SPLIT_POINT.rpv); continue; }
    if (jn.v === 'rhva') { branch('rhva', 0, 'rhv', [...rev(COURSE.rhvb!), ...COURSE.rhv!.slice(1)].reverse(), SPLIT_POINT.rhv); continue; }
    // (a main vessel whose engine node is its host's own end (the splenic vein at the confluence, where the SMV runs on into the portal vein) lands exactly there: a landing a hair beside it put the confluence's arms at
    //  three depths, 0.00026 apart, and the skin's ink needs one)
    const vp = WHOLE_PIECES[jn.v], hp = WHOLE_PIECES[jn.to];
    const vNode = vp ? (jn.end ? edgeById.get(vp[vp.length - 1]!)!.to : edgeById.get(vp[0]!)!.from) : null;
    const hostEnd = hp && vNode ? (edgeById.get(hp[0]!)!.from === vNode ? COURSE[jn.to]![0]! : edgeById.get(hp[hp.length - 1]!)!.to === vNode ? COURSE[jn.to]![COURSE[jn.to]!.length - 1]! : undefined) : undefined;
    branch(jn.v, jn.end, jn.to, undefined, hostEnd);
  }

  // ONE MOUTH: main vessels that the engine joins to one host at one node (the three hepatic veins at the cava's top, IVCS) open at one point of it, the widest one's mouth, as one skin's arms. Placed 3 radii
  // apart along the cava, the skin's hull bridged the two outer veins unevenly and folded (Mohammad, 24 Nov: no old-style join may ship)
  {
    const groups = new Map<string, { v: string; end: 0 | 1 }[]>();
    for (const jn of J.joins) {
      if (jn.runon || jn.end == null || !WHOLE_PIECES[jn.v] || !WHOLE_PIECES[jn.to]) continue;
      const vp = WHOLE_PIECES[jn.v]!, node = jn.end ? edgeById.get(vp[vp.length - 1]!)!.to : edgeById.get(vp[0]!)!.from;
      const k = `${jn.to}|${node}`; groups.set(k, [...(groups.get(k) ?? []), { v: jn.v, end: jn.end }]);
    }
    for (const [k, g] of groups) {
      if (g.length < 3) continue;
      const host = k.split('|')[0]!, first = g.reduce((a, b) => (rOf(b.v) > rOf(a.v) ? b : a)), C = COURSE[first.v]!, J0 = first.end ? C[C.length - 1]! : C[0]!;
      for (const x of g) if (x !== first) branch(x.v, x.end, host, undefined, J0);
    }
  }
  // ---- collaterals and shunts: each end lands on the vessel its engine node belongs to ----
  /** The whole vessels (and collaterals) that have a piece at `node`, but `self`. */
  function atNode(node: string, self: string): { whole: string; piece: string; end: 0 | 1 }[] {
    const out: { whole: string; piece: string; end: 0 | 1 }[] = [];
    for (const e of edges) {
      const w = PIECE_WHOLE.get(e.id);
      if (!w || w === self) continue;
      if (e.from === node) out.push({ whole: w, piece: e.id, end: 0 });
      if (e.to === node) out.push({ whole: w, piece: e.id, end: 1 });
    }
    return out;
  }
  const isMain = (w: string): boolean => w in WHOLE_PIECES;
  /** How near an end must be to a host to land on it (a collateral whose end is drawn away from its node, the rectal varices down the rectum, is left as placed). */
  const LAND_REACH = 0.06;
  const RUN_ON_ENDS = new Set(['C1a|0', 'C1a|1', 'C1b|0', 'C2|1', 'C5|0', 'EPI_ILI|0', 'EPI_SVC|0']);
  /** The host course a collateral end lands on: the whole vessel (its trunk only, never a draw-only branch). */
  const ownCourse = (w: string): V3[] => COURSE[w]!;
  // ONE MOUTH AT A NODE (Mohammad, 24 Nov: no old-style join may ship): an end the engine joins at a node of its host opens where that node is drawn, so it is an arm of the node's skin, not a wall landing beside it that has
  // no ring clear of the node's blend (the distal splenorenal shunt 0.14 up the splenic vein from the spontaneous one, the mesocaval on the iliac 0.1 from the renal vein, the paraumbilical vein a hair off the epigastric
  // run-on): the host's own end when the node is one, else the main vessel's mouth there (two collaterals forced to one point leave along one line and the hull folds: each keeps its own)
  const mouth = new Map<string, V3>();
  const nodeOfWholeEnd = (w: string, end: 0 | 1): string | undefined => { const ps = WHOLE_PIECES[w] ?? (edgeById.has(w) ? [w] : undefined); if (!ps) return undefined; return end ? edgeById.get(ps[ps.length - 1]!)!.to : edgeById.get(ps[0]!)!.from; };
  for (const jn of J.joins) {
    if (jn.runon || jn.end == null || !WHOLE_PIECES[jn.v] || !WHOLE_PIECES[jn.to]) continue;
    const n = nodeOfWholeEnd(jn.v, jn.end), C = COURSE[jn.v]!;
    if (n && !mouth.has(`${jn.to}|${n}`)) mouth.set(`${jn.to}|${n}`, jn.end ? C[C.length - 1]! : C[0]!);
  }
  const hostEndAt = (w: string, node: string): V3 | undefined => (nodeOfWholeEnd(w, 0) === node ? COURSE[w]![0]! : nodeOfWholeEnd(w, 1) === node ? COURSE[w]![COURSE[w]!.length - 1]! : undefined);
  for (const id of OWN) {
    const e = edgeById.get(id)!;
    for (const end of [0, 1] as const) {
      if (RUN_ON_ENDS.has(`${id}|${end}`)) continue;
      const node = end ? e.to : e.from, p = end ? COURSE[id]![COURSE[id]!.length - 1]! : COURSE[id]![0]!;
      const cands = atNode(node, id).filter((c) => c.whole !== id);
      let best: { w: string; d: number } | null = null;
      for (const c of cands) { const d = nearestOn(ownCourse(c.whole), p).d - 0 * rOf(c.whole); if (!best || (isMain(c.whole) && !isMain(best.w)) || (isMain(c.whole) === isMain(best.w) && d < best.d)) best = { w: c.whole, d }; }
      if (!best || best.d > LAND_REACH + rOf(best.w)) continue;
      // (a shunt or collateral that lands on another collateral's run: the epigastric vein's pair, the azygos: the same rule)
      // the host's flow sense at the landing: a vessel that ENDS there merges along the host's flow; one that starts there leaves along it
      const key = `${best.w}|${node}`;
      branch(id, end, best.w, ownCourse(best.w), id === 'TIPS' ? TIPS_POINT[best.w] : (hostEndAt(best.w, node) ?? mouth.get(key)));
    }
  }

  // ---- the caudate veins: three short tributaries into the cava (the pieces are cut below, so this lands on the whole cava) ----
  for (const k of ['cv1', 'cv2', 'cv3']) if (COURSE[k]) branch(k, 1, 'ivc');

  // ---- cut each whole vessel into its engine pieces at the attach points ----
  /** Where each engine node sits (3D): a piece's end; for a branching host's far end, its split. */
  const endPt = (id: string, end: 0 | 1): V3 => { const c = COURSE[id]!; return end ? c[c.length - 1]! : c[0]!; };
  for (const [w, pieces] of Object.entries(WHOLE_PIECES)) {
    const D = COURSE[w]!, s = arc(D), L = s[s.length - 1]!;
    const cuts: number[] = [], free: boolean[] = [];
    for (let i = 0; i < pieces.length - 1; i++) {
      const node = edgeById.get(pieces[i]!)!.to;
      // the joiners at the node: their ends (as they now stand) on this course; a main vessel first, the widest; else a collateral or a shunt, the widest
      const js = atNode(node, w).filter((c) => !pieces.includes(c.piece)).map((c) => {
        // (the joiner's end at this node: a collateral's own end; a main vessel's whole end, when its piece there is the whole's first or last)
        const pw = c.whole, ps = WHOLE_PIECES[pw];
        const atStart = ps ? ps[0] === c.piece && c.end === 0 : c.end === 0, atEndW = ps ? ps[ps.length - 1] === c.piece && c.end === 1 : c.end === 1;
        const p = atStart ? endPt(pw, 0) : atEndW ? endPt(pw, 1) : null;
        const k = edgeById.get(c.piece)!.kind;
        return p ? { p, main: k !== 'collateral' && k !== 'shunt', r: rOf(pw), hit: nearestOn(D, p) } : null;
      }).filter((x): x is NonNullable<typeof x> => !!x && x.hit.d < LAND_REACH + rOf(w));
      js.sort((a, b) => (a.main !== b.main ? (a.main ? -1 : 1) : b.r - a.r));
      let at: number;
      if (js.length) {
        at = js[0]!.hit.s / L;
        // (a collateral piece of a whole, drawn only when it is open (the lumbar vein, C9, the azygos's lower course): a branch that lands at its cut would meet its run-on at one point, and with it hidden would sit on the
        //  arch's open start. The branch lands on the always-drawn piece's wall instead, two of its diameters past the cut (the 2D figure's own drawing: tests/azygos-origin.test.ts))
        const kc = (id: string): boolean => edgeById.get(id)!.kind === 'collateral';
        if (!js[0]!.main && kc(pieces[i]!) !== kc(pieces[i + 1]!)) at += ((kc(pieces[i]!) ? -1 : 1) * 4 * rOf(w)) / L;
      } else { const row = (JUNCTIONS as readonly (readonly unknown[])[]).find((r) => r[0] === node); at = row ? Number(row[2]) : (i + 1) / pieces.length; }
      cuts.push(at); free.push(!js.length);
    }
    // (a node nothing drawn lands at (the arterioportal shunt's on the right portal trunk, hidden): its cut is midway between the cuts either side, so both pieces are as long as they can be for their skins)
    for (let i = 0; i < cuts.length; i++) if (free[i]) { let j = i; while (j < cuts.length && free[j]) j++; const lo = i ? cuts[i - 1]! : 0, hi = j < cuts.length ? cuts[j]! : 1; for (let m = i; m < j; m++) cuts[m] = lo + ((hi - lo) * (m - i + 1)) / (j - i + 1); i = j; }
    // (in flow order, each piece at least a hundredth of the course)
    for (let i = 0; i < cuts.length; i++) cuts[i] = Math.min(1 - 0.01 * (cuts.length - i), Math.max(cuts[i]!, (i ? cuts[i - 1]! : 0) + 0.01));
    const bounds = [0, ...cuts, 1];
    pieces.forEach((id, i) => {
      const a = bounds[i]! * L, b = bounds[i + 1]! * L;
      const pts: V3[] = [];
      const at = (d: number): V3 => { let j = 1; while (j < D.length - 1 && s[j]! < d) j++; const u = (d - s[j - 1]!) / ((s[j]! - s[j - 1]!) || 1); return add(D[j - 1]!, mul(sub(D[j]!, D[j - 1]!), Math.min(1, Math.max(0, u)))); };
      pts.push(at(a));
      for (let j = 0; j < D.length; j++) if (s[j]! > a + 1e-9 && s[j]! < b - 1e-9) pts.push(D[j]!);
      pts.push(at(b));
      PLACED_EDGE_3D[id] = resample(pts, STEP);
    });
  }
  for (const id of OWN) PLACED_EDGE_3D[id] = COURSE[id]!;
  // the node places, before the through branches are hung on (a branching host's far node is its split)
  for (const e of edges) {
    const c = PLACED_EDGE_3D[e.id];
    if (!c) continue;
    if (!PLACED_NODE_3D[e.from]) PLACED_NODE_3D[e.from] = c[0]!;
    if (!PLACED_NODE_3D[e.to]) PLACED_NODE_3D[e.to] = c[c.length - 1]!;
  }

  // ---- the draw-only branches: the through branch carried on in the host's piece, the side branch on its own ----
  for (const [host, b] of Object.entries(PLACED_BRANCHES)) {
    const own = PLACED_EDGE_3D[host]!, th = COURSE[b.through]!;
    const whole = b.out ? [...own, ...th.slice(1)] : [...rev(th), ...own.slice(1)];
    PLACED_EDGE_3D[host] = whole;
    const q = lengthOf(own) / lengthOf(whole);
    PLACED_SPLIT[host] = { q, side: b.out ? COURSE[b.side]! : rev(COURSE[b.side]!) };
  }

  // ---- the liver beds (no placed course; drawn only on the Circuit): one smooth curve from the portal branch's split on through the lobe to where its hepatic vein begins, cut in three (the
  // inflow bed, the sinusoids, the outflow bed), so the beds are pieces of one curve and run on into one another; it leaves the portal vein along its heading and arrives along the hepatic vein's ----
  const isBed = (e: Edge): boolean => e.kind === 'liver' && !!EDGE_PATH_2D[e.id] && !HIDDEN_EDGES.has(e.id) && !ANAT_HIDDEN.has(e.id);
  /** A cubic Hermite from A (heading tA) to B (heading tB), dense. */
  function hermite(A: V3, tA: V3, B: V3, tB: V3, k = 1): V3[] {
    const L = len(sub(B, A)) * k, n = Math.max(12, Math.round((len(sub(B, A)) * 2) / STEP)), pts: V3[] = [];
    for (let i = 0; i <= n; i++) {
      const u = i / n, u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
      pts.push([0, 1, 2].map((q) => h00 * A[q]! + h10 * tA[q]! * L + h01 * B[q]! + h11 * tB[q]! * L) as V3);
    }
    return resample(pts, STEP);
  }
  /** `D` cut at the shares `cuts` (by length). */
  function cutAt(D: readonly V3[], cuts: readonly number[]): V3[][] {
    const s = arc(D), L = s[s.length - 1]!, bounds = [0, ...cuts, 1];
    const at = (d: number): V3 => { let j = 1; while (j < D.length - 1 && s[j]! < d) j++; const u = (d - s[j - 1]!) / ((s[j]! - s[j - 1]!) || 1); return add(D[j - 1]!, mul(sub(D[j]!, D[j - 1]!), Math.min(1, Math.max(0, u)))); };
    return bounds.slice(1).map((b, i) => { const a0 = bounds[i]! * L, b0 = b * L, pts: V3[] = [at(a0)]; for (let j = 0; j < D.length; j++) if (s[j]! > a0 + 1e-9 && s[j]! < b0 - 1e-9) pts.push(D[j]!); pts.push(at(b0)); return resample(pts, STEP); });
  }
  {
    const splitIdx = (c: readonly V3[], share: number): number => { const s = arc(c), L = s[s.length - 1]!; return Math.max(0, s.findIndex((x) => x >= share * L - 1e-9)); };
    const portal = (host: string, at = 1): { at: V3; t: V3 } => { const c = PLACED_EDGE_3D[host]!, sp = PLACED_SPLIT[host], k = sp ? splitIdx(c, sp.q) : Math.min(c.length - 1, splitIdx(c, at)); return { at: c[k]!, t: tangentAt(c, k) }; };
    const hepatic = (host: string, at = 0): { at: V3; t: V3 } => { const c = PLACED_EDGE_3D[host]!, sp = PLACED_SPLIT[host], k = sp ? splitIdx(c, 1 - sp.q) : splitIdx(c, at); return { at: c[k]!, t: tangentAt(c, k) }; };
    // (the lobe's artery ends at the sinusoids' node, SIN_R or SIN_L, where it meets the inflow bed: the bed is cut there at the point nearest the artery's placed end, and the artery lands on it there. Its end 0.1 away from the
    //  node was an arm off its junction, and the skin's surface folded there)
    const lay = (pre: string, sin: string, post: string, pv: string, hv: string, art: string, pa = 1, ha = 0): void => {
      const P = portal(pv, pa), H = hepatic(hv, ha), D = hermite(P.at, P.t, H.at, H.t, 1.2), A = COURSE[art]!;
      const c1 = Math.min(0.55, Math.max(0.25, nearestOn(D, A[A.length - 1]!).s / lengthOf(D)));
      const [a, b, c] = cutAt(D, [c1, c1 + (1 - c1) / 2]);
      PLACED_EDGE_3D[pre] = a!; PLACED_EDGE_3D[sin] = b!; PLACED_EDGE_3D[post] = c!;   // (the Hermite is fair already: one cubic)
      branch(art, 1, pre, D, a![a!.length - 1]!);
      PLACED_EDGE_3D[WHOLE_PIECES[art]![0]!] = resample(COURSE[art]!, STEP);
    };
    lay('PRE_R', 'SIN_RR', 'POST_R_RHV', 'PVH_R_2', 'RHV_IVC_1', 'rha');
    lay('PRE_L', 'SIN_LL', 'POST_L_LHV', 'PVH_L_1', 'LHV_IVC', 'lha', 0.2, 0.45);   // (the left portal vein runs on past its lobe's outflow: its bed leaves it where it starts to fade)
    // the right lobe's second outflow bed: from the central vein on to the middle hepatic vein, leaving along the bed it continues
    {
      const sinR = PLACED_EDGE_3D.SIN_RR!, A = sinR[sinR.length - 1]!, H = hepatic('MHV_IVC', 0.3);   // (the middle hepatic vein starts in front of the lobe's centre: its bed joins it where it has come back to the veins' depth)
      PLACED_EDGE_3D.POST_R_MHV = fair(hermite(A, norm(add(tangentAt(sinR, sinR.length - 1), norm(sub(H.at, A)))), H.at, H.t, 1));
    }
    // (the beds' own nodes, the sinusoids' and the central veins', are where the beds meet; the lobar arteries' ends are not them)
    for (const [n, id] of [['SIN_R', 'PRE_R'], ['SIN_L', 'PRE_L'], ['CV_R', 'SIN_RR'], ['CV_L', 'SIN_LL']] as const) { const c = PLACED_EDGE_3D[id]!; PLACED_NODE_3D[n] = c[c.length - 1]!; }
  }

  // ---- the caudate veins ----
  /** The three caudate veins (flow order: out of the lobe into the cava). */
  for (const k of ['cv1', 'cv2', 'cv3']) if (COURSE[k]) PLACED_CAUDATE_VEINS.push(COURSE[k]!);
  /** Their radii (the placement's). */
  for (const k of ['cv1', 'cv2', 'cv3']) if (COURSE[k]) PLACED_CAUDATE_R.push(rOf(k));

  // ---- 2D projections: the courses in the 2D figure's units, for the rules written in them (joins, coils, strands), and their depths ----
  for (const [id, c] of Object.entries(PLACED_EDGE_3D)) { PLACED_PATH_2D[id] = c.map((p): P2 => [x2d(p[0]), y2d(p[1])]); PLACED_Z[id] = c.map((p) => p[2]); }
  for (const [n, p] of Object.entries(PLACED_NODE_3D)) PLACED_NODE_2D[n] = [x2d(p[0]), y2d(p[1])];
}
if (PLACED) buildPlaced();
/** A course as 2D points and depths. */
export const to2D = (c: readonly V3[]): { pts: P2[]; z: number[] } => ({ pts: c.map((p): P2 => [x2d(p[0]), y2d(p[1])]), z: c.map((p) => p[2]) });
/** Where along `host`'s piece (0 to 1, by length) the point nearest `p` lies. */
export function shareOn(host: string, p: V3): number { const c = PLACED_EDGE_3D[host]!, h = nearestOn(c, p); return h.s / lengthOf(c); }
