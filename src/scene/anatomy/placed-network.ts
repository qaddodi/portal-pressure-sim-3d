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
// Pure data, no three.js, no reader of network.ts (network.ts reads this).
import { PLACED_VESSELS, PLACED_JOINS, PLACED_ORGANS } from './placement.generated.ts';
import { DRAWN_COURSES } from './drawn-courses.ts';
import { EDGES, JUNCTION_CHAINS } from '../../engine/hales/portal/topology.js';
import { ANAT_HIDDEN, EDGE_PATH_2D, HIDDEN_EDGES } from './source.ts';
import { x2d, y2d } from '../frame2d.ts';
import { aroundEso, onEso } from './eso-wall.ts';
import { WHOLE_HOSTS, WHOLE_PIECES, firstPieceOf, lastPieceOf, pieceEndingAt, piecesOf } from './whole-pieces.ts';

export type V3 = [number, number, number];
type P2 = [number, number];
interface Edge { id: string; from: string; to: string; kind: string; shunt?: string; share?: number }
const edges = EDGES as Edge[];
const edgeById = new Map(edges.map((e) => [e.id, e]));

/** Whole vessel (the placement's key) -> its engine pieces in flow order: read from the engine's junction table, never listed here (whole-pieces.ts). */
export { WHOLE_PIECES };
/** The collaterals and shunts: their own ids are the placement's keys. */
const OWN = ['C1a', 'C1b', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'EPI_SVC', 'EPI_ILI', 'TIPS', 'DIPS', 'S_PC', 'S_MC', 'S_DSR', 'REX'] as const;
/** The draw-only branches on a host's end (no engine edge): the host's last (portal, `out`) or first (hepatic, `in`) piece, and which of the two runs on as the through branch (the straighter one; the HVPG wedges
 *  in the right hepatic vein's main trunk, short of the fork: Mohammad 24 Nov). */
export const PLACED_BRANCHES: Readonly<Record<string, { whole: string; out: boolean; through: string; side: string }>> = {
  [lastPieceOf('PVH_R')]: { whole: 'rpv', out: true, through: 'rpvp', side: 'rpva' },
  [firstPieceOf('RHV_IVC')]: { whole: 'rhv', out: false, through: 'rhvb', side: 'rhva' },
};
const PIECE_WHOLE = new Map<string, string>();
for (const [w, ps] of Object.entries(WHOLE_PIECES)) for (const p of ps) PIECE_WHOLE.set(p, w);
for (const id of OWN) PIECE_WHOLE.set(id, id);
/** The engine's junction nodes (topology.js JUNCTIONS: where a collateral, a shunt or a tributary meets a host part-way along it): node -> its host edge, its share `at` along the
 *  host's drawn course, the whole vessel it is on. */
export const JNODE = new Map<string, { node: string; host: string; at: number; whole: string }>();
for (const c of JUNCTION_CHAINS as { host: string; nodes: string[]; at: number[] }[]) {
  const whole = Object.keys(WHOLE_HOSTS).find((w) => WHOLE_HOSTS[w]!.includes(c.host));
  if (!whole) throw new Error(`junction host ${c.host} is on no placed whole vessel`);
  c.nodes.forEach((node, i) => JNODE.set(node, { node, host: c.host, at: c.at[i]!, whole }));
}
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
/** Re-spaces the stretch of `D` between arc lengths `a` and `b` (widened to its points) to about STEP, keeping every point outside it. */
function respace(D: V3[], a: number, b: number): V3[] {
  const s = arc(D), i0 = Math.max(0, s.findIndex((x) => x >= a) - 1);
  let i1 = s.findIndex((x) => x > b); i1 = i1 < 0 ? D.length - 1 : i1;
  if (i1 - i0 < 2) return D;
  return [...D.slice(0, i0), ...resample(D.slice(i0, i1 + 1), STEP), ...D.slice(i1 + 1)];
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
/** The wholes that open into the cava at the hepatic confluence, IVCS: their arrival lies in the cava's plane (joinEnd `flat`). */
const HEPATIC_WHOLES: ReadonlySet<string> = new Set(['rhv', 'mhv', 'lhv']);
/** TWO OSTIA ON THE CAVA (Mohammad, 25 Nov: "RHV alone, MHV+LHV shared trunk"): the right hepatic vein opens on its own into the cava's right wall, and the middle hepatic vein joins the left one in a short common trunk, which
 *  opens higher, on the cava's left wall, just below the diaphragm. The engine still ends all three at IVCS: the cava is cut there at the common trunk's ostium (`mouth`), the right hepatic vein lands lower on the cava's wall as an
 *  arm of the same node, and the middle hepatic vein lands on the left one's course `trunk` back from where it crosses the cava's wall (the common trunk is the left hepatic vein's tube: a draw-only run-on). */
export const HV_OSTIA = { node: 'IVCS', host: 'ivc', mouth: 'lhv', joiner: 'mhv', own: 'rhv' } as const;
/** The common trunk's length, from where the middle hepatic vein meets the left one to the cava's wall, in the left hepatic vein's radii (the anatomy's 1 to 1.5 cm). */
export const HV_TRUNK_R = 3;
/** The common trunk as drawn: the left hepatic vein's piece, the point where the middle one joins it, and its length to the cava's wall (scene units). Set at load (placed only). */
export const PLACED_HV_TRUNK: { piece: string; joiner: string; at: V3; length: number } = { piece: 'LHV_IVC', joiner: 'MHV_IVC', at: [0, 0, 0], length: 0 };
/** The least a branch's arrival is off its host's axis (joinEnd). */
// (a branch wider than its host arrives MERGE_MIN times their width ratio off its axis: C6, 1.34 times the renal vein, slid in at 40 and left a wall crotch whose normals turned 84 degrees between neighbours; at 54 it is 74)
const MERGE_MIN = 40;
/** How long a carried trunk is, in its radii (the 2D figure's right portal trunk, bifurcation to split: 8.3), and the right hepatic vein's extra length at the crowded cava. */
const TRUNK_R = 8;
const SPLIT_PAST = 3;
/** How far back along a branch its course may be re-routed to reach a landing the trunk sets. */
const FORCE_REACH = 0.35;
// (10: at 7.5 the TIPS's skin and the split's crowded the piece between them and merged with two permanent arms, so the TIPS was not welded; at 12.5 it crowds the cava's)
const RHV_SPLIT = 10;
/** The right hepatic vein's trunk from the TIPS's mouth to the cava at least (the cava's junction is crowded: five arms). */
const RHV_MIN = 0.26;
const FAIR_SPAN = 0.05;
/** The DIPS's course as Mohammad drew it (25 Nov, picked as #2 on dips-his-course.png): its centreline in the front view (scene x, y) after the portal fork, ending on the cava's centreline at the last point's height (the cava's x is the cava's own). */
export const DIPS_DRAWN: readonly (readonly [number, number])[] = [[-0.322, 0.48], [-0.326, 0.53], [-0.312, 0.572], [-0.282, 0.616], [-0.25, 0.646], [-0.215, 0.658], [-0.197, 0.665]];
/** The least a stent's tract keeps from any other drawn vessel, wall to wall, away from its own ends (scene units), and the stretch along it over which a push away eases out. */
const TRACT_CLEAR = 0.009, TRACT_SPAN = 0.1;
/** The stents and surgical shunts: tracts laid between two ends. */
const TRACTS = ['TIPS', 'DIPS', 'S_PC', 'S_MC', 'S_DSR', 'REX'] as const;
/** The surgical shunts, whose ends are sewn end to side onto their hosts (vessels/seams.ts SEWN_IDS), and the least angle each end leaves its host's through axis at (degrees),
 *  measured over its first SEWN_HEAD_R radii; an end that leaves nearer is turned out to it and eases back onto its course over SEWN_SPAN (scene units). The stents (TIPS, DIPS)
 *  are tracts through the liver, not anastomoses: their courses are Mohammad's own. */
export const SEWN_ENDS = ['S_PC', 'S_MC', 'S_DSR', 'REX'] as const;
export const SEWN_MIN = 45, SEWN_HEAD_R = 3;
/** The angle such an end is turned out to at its mouth (it eases back toward its course from there, so its first stretch is left between SEWN_MIN and this). */
const SEWN_TURN = 80;
const SEWN_SPAN = 0.35;
/** What the turn gives on the screen (tests/shunt-continuity.test.ts): from SEWN_FRONT_FROM of the two radii past its mouth out to SEWN_FRONT_TO along it, a sewn shunt's wall clears its
 *  host's wall, in the front view, by at least SEWN_FRONT_GAP of its own radius (it is never a second tube lying along its host). */
export const SEWN_FRONT_GAP = 0.3, SEWN_FRONT_FROM = 3, SEWN_FRONT_TO = 0.6;
/** Where along the whole left portal vein (by length from the bifurcation) its lobe's bed leaves it: where it starts to fade into the lobe. */
const LPV_BED = 0.6;
/** Where the varices' courses ease onto the oesophagus's wall above the cardia, and off it where the drain turns toward the azygos (scene y, from and to). */
const ESO_IN = [1.02, 1.1] as const, ESO_OUT = [1.5, 1.58] as const;
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
/** Built once, at load: the approved placement is the app's only anatomy. */
function buildPlaced(): void {
  const COURSE: Record<string, V3[]> = {};
  const rOf = (k: string): number => PLACED_VESSELS[k]?.r ?? 0.01;
  for (const [k, c] of Object.entries(DRAWN_COURSES)) COURSE[k] = fair(relax(denseCurve(c), PLACED_JOINS.relax ?? 40));

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
  function joinEnd(D: V3[], P: readonly V3[], rP: number, rD: number, force?: V3, flat = false): V3[] {
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
    const mMin = MERGE_MIN * Math.max(1, rD / rP);
    { const c = dot(t1, tp), lo = Math.cos((mMin * Math.PI) / 180); if (c > lo) { let n = sub(chord, mul(tp, dot(chord, tp))); if (len(n) < 1e-6) n = sub(t0, mul(tp, dot(t0, tp))); if (len(n) > 1e-6) { n = norm(n); const a = (mMin * Math.PI) / 180; t1 = norm(add(mul(tp, Math.cos(a)), mul(n, Math.sin(a)))); } } }
    // (IN THE HOST'S PLANE AT THE MOUTH (the hepatic confluence's heavy ink, Mohammad 24 Nov): the figure is seen from the front, and an arrival that dives into its host from in front (the middle and left hepatic veins came down onto the cava
    //  sloping 0.27 and 0.23 away from the viewer) runs over the host's front wall for radii before it opens: its rim, 1.6 k in front of the cava, is the line drawn across the cava's lumen there (1.1 % of IVCS's lumen as line only, 0.1 % in
    //  today's flat figure). A hepatic vein's arrival keeps its heading on the screen and takes the cava's own depth slope, so it opens from the side, as the 2D figure's do. Every other arrival keeps its depth: flattened, the portal
    //  branches moved PVH so the DIPS's skin there had no ring that clears the blend)
    if (flat) { const hx = Math.hypot(t1[0], t1[1]), px = Math.hypot(tp[0], tp[1]); if (px > 1e-6) t1 = norm([t1[0], t1[1], (tp[2] * hx) / px]); }
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
  function branch(v: string, end: 0 | 1, host: string, hostCourse?: V3[], force?: V3, flat = false): void {
    const P = hostCourse ?? COURSE[host]!, D = COURSE[v]!;
    // (faired only over the stretch the merge re-routed and a little more: the far end, and whatever join it has, keeps its heading)
    const R = joinEnd(end ? D : rev(D), end ? P : rev(P), rOf(host), rOf(v), force, flat), m = Math.round((3.2 * rOf(host) + 3 * rOf(v) + 0.1 + (force ? FORCE_REACH : 0)) / STEP);
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
  // THE VARICES ON THE OESOPHAGUS'S WALL (Mohammad, 24 Nov: "varices should be surrounding the esophagus"): the coronary vein's run up the oesophagus (C1a, whose strands are the varices) and the drain on to the azygos side
  // (C1b, as far as it climbs the tube) lie on the tube's outside, their own radius beyond its wall (anatomy/eso-wall.ts), each point moved straight out from (or in toward) the axis, so the course keeps its side of the tube and
  // its run; the strands then wind round the axis from there (vessels/coil.ts WRAP). Eased in above the cardia (the coronary vein's run-on keeps its place) and out where the drain turns off the tube toward the azygos.
  {
    const w = (y: number): number => smooth((y - ESO_IN[0]) / (ESO_IN[1] - ESO_IN[0])) * (1 - smooth((y - ESO_OUT[0]) / (ESO_OUT[1] - ESO_OUT[0])));
    for (const k of ['C1a', 'C1b']) COURSE[k] = COURSE[k]!.map((p): V3 => { const k0 = w(p[1]); if (k0 <= 0) return p; const a = aroundEso(p); return onEso(p[1], a.th, a.out + (rOf('C1a') - a.out) * k0); });
  }
  // THE VARICES ARE ONE RUN ALONG THE OESOPHAGUS (Mohammad, 25 Nov: "make the esophageal varices one vein not two ... I want the 3 varices on the esophageal"): the engine cuts the route at its VAR station, mid-oesophagus (height 1.40),
  // and the strands, which are C1a's, pinched back into one trunk there, so the bundle read as two veins end to end. The coronary vein's run (C1a, the strands' vessel) is carried on along the drain (C1b) as far as the oesophagus
  // goes (ESO_OUT, where the drain turns off toward the azygos), the way a trunk is carried on along its through branch below: one placed curve, so the three strands run unbroken the length of the tube and gather only where the
  // vein leaves it. C1b keeps the turn-off and the landing on the azygos; the station sits at the new join. The engine's two edges, and every number they carry, are unchanged.
  {
    const A = COURSE.C1a!, B = COURSE.C1b!, k = Math.max(1, B.findIndex((p) => p[1] >= ESO_OUT[0]));
    if (k < B.length - 1 - Math.ceil(0.1 / STEP)) { COURSE.C1a = [...A, ...B.slice(1, k + 1)]; COURSE.C1b = B.slice(k); }
  }
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
  for (const jn of J.joins) {
    if (jn.runon || jn.end == null) continue;
    if (['rpvp', 'rhvb', 'rha'].includes(jn.v) || (jn.v === 'rpv' && jn.to === 'pv')) continue;   // (run-ons above)
    if (jn.v === 'rpva') { branch('rpva', 0, 'rpv', [...COURSE.rpv!, ...COURSE.rpvp!.slice(1)], SPLIT_POINT.rpv); continue; }
    if (jn.v === 'rhva') { branch('rhva', 0, 'rhv', [...rev(COURSE.rhvb!), ...COURSE.rhv!.slice(1)].reverse(), SPLIT_POINT.rhv); continue; }
    if (jn.v === HV_OSTIA.mouth || jn.v === HV_OSTIA.joiner) continue;   // (the common trunk, below)
    // (a main vessel whose engine node is its host's own end (the splenic vein at the confluence, where the SMV runs on into the portal vein) lands exactly there: a landing a hair beside it put the confluence's arms at
    //  three depths, 0.00026 apart, and the skin's ink needs one)
    const vp = WHOLE_PIECES[jn.v], hp = WHOLE_PIECES[jn.to];
    const vNode = vp ? (jn.end ? edgeById.get(vp[vp.length - 1]!)!.to : edgeById.get(vp[0]!)!.from) : null;
    const hostEnd = hp && vNode ? (edgeById.get(hp[0]!)!.from === vNode ? COURSE[jn.to]![0]! : edgeById.get(hp[hp.length - 1]!)!.to === vNode ? COURSE[jn.to]![COURSE[jn.to]!.length - 1]! : undefined) : undefined;
    branch(jn.v, jn.end, jn.to, undefined, hostEnd, HEPATIC_WHOLES.has(jn.v));
  }

  // TWO OSTIA (HV_OSTIA): the right hepatic vein has landed on the cava where the placement draws it (the loop above); the left one lands on the cava where its placement ends, its common trunk's ostium; and the middle one lands
  // on the left one's course HV_TRUNK_R of its radii back from where it crosses the cava's wall, merging along its flow (joinEnd), so the two share one tube into the cava. Before (round 17 and earlier) all three opened at ONE point of
  // the cava's axis, the right one's, and the middle one ran within 1.3 cava radii of the axis for its last 0.07: the crowded arms notched the junction's skin
  {
    const { host, mouth: m, joiner } = HV_OSTIA;
    branch(m, 1, host, undefined, undefined, true);
    const T = COURSE[m]!, sT = arc(T), H = COURSE[host]!, R = rOf(host);
    let k = T.length - 1; while (k > 0 && nearestOn(H, T[k]!).d < R) k--;   // (where the trunk crosses the cava's wall)
    const want = sT[k]! - HV_TRUNK_R * rOf(m);
    let j = 1; while (j < k && sT[j + 1]! <= want) j++;   // (the last point at least the trunk's length back)
    branch(joiner, 1, m, undefined, T[j]!);
    Object.assign(PLACED_HV_TRUNK, { at: T[j]!, length: sT[k]! - sT[j]! });
    // (the right hepatic vein's mouth is level with the trunk's, within the skin's NEAR_R of the node's centre, so its end meets the node at the node's own depth, the skin's one tier (skin/inventory.ts tierSpread): its last stretch takes
    //  the few thousandths of depth between the cava where it lands and the node, eased in over its last 3 cava radii)
    {
      const O = COURSE[HV_OSTIA.own]!, e = O[O.length - 1]!, Jz = T[T.length - 1]![2]!, dz = Jz - e[2]!, sO = arc(O), tot = sO[sO.length - 1]!, reach = 3 * R;
      COURSE[HV_OSTIA.own] = O.map((p, i) => [p[0]!, p[1]!, p[2]! + dz * smooth(1 - (tot - sO[i]!) / reach)] as V3);
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
  // WHERE EACH END OPENS (Mohammad, 24 Nov: no old-style join may ship; every growing end welded; the drawn picture is the placed course). An end opens where the placement draws it, with these exceptions, each so a skin takes it as an arm:
  //  - SNAP: within SNAP_R of its host's radii of the point where its engine node is drawn (the host's own end, or the main vessel's mouth there) it opens exactly there (the paraumbilical vein a hair off the epigastric run-on);
  //  - a node only collaterals and shunts join inside a main vessel (the splenic vein's SVD, the left renal vein's LRV_S and LRV) is drawn at its own end's drawn landing (the shunt that divides the vein there, else the widest),
  //    unless an end drawn off its own node lies within SNAP_R of one of its ends: then the node moves to that end, and its skin takes it too (the short gastric veins leave the splenic vein near the hilum, beside SVD, though the
  //    engine joins them at SV: SVD is drawn at their take-off);
  //  - an end within PARALLEL_DEG of its node's own end runs beside it: it opens at its own node, an arm of that node's skin, and bows off it (SIBLINGS APART, below);
  //  - two such nodes closer than NODE_GAP_R radii are moved apart along the vein, downstream, never past a main vessel's mouth (LRV_S and LRV were 4 radii apart: one skin for both
  //  had two permanent arms and failed).
  /** THE ONE PENDING CASE (27 Nov): the node drawn at an end's take-off whatever else opens there, SVD at the short gastric veins' (they leave the splenic vein beside it, though the
   *  engine still joins them at SV, 11 radii
   *   away: engine brief A moves that end to SVD, and tests/junction-ends.test.ts then turns the general rule on for C2 by itself and this line goes). Every other take-off is placed
    *  from the engine's JUNCTIONS table. */
  const NODE_AT_END: Readonly<Record<string, string>> = { SVD: 'C2|0' };
  const SNAP_R = 6, NODE_GAP_R = 10, PARALLEL_DEG = 30, PAIR_GAP_R = 5;
  /** SIBLINGS APART (below): how far off its sibling an end beside it leaves (degrees), the share of the course from that end the bow spans, and the bow's steps and most (shares of the course's length). */
  const SIBLING_DEG = 60, BOW_SPAN = 0.7, BOW_STEP = 0.05, BOW_MAX = 4;
  /** The shunts that divide the vein whose start is their node (skin/divide.ts DIVIDED): each opens at that node. */
  const DIVIDERS = new Set(['S_DSR|0', 'S_DSR|1']);
  const endDir = (id: string, end: 0 | 1): V3 => { const D = COURSE[id]!, k = Math.min(D.length - 1, 6); return norm(end ? sub(D[D.length - 1 - k]!, D[D.length - 1]!) : sub(D[k]!, D[0]!)); };
  const angleDeg = (a: V3, b: V3): number => (Math.acos(Math.max(-1, Math.min(1, dot(a, b)))) * 180) / Math.PI;
  const mouth = new Map<string, V3>();
  const nodeOfWholeEnd = (w: string, end: 0 | 1): string | undefined => { const ps = WHOLE_PIECES[w] ?? (edgeById.has(w) ? [w] : undefined); if (!ps) return undefined; return end ? edgeById.get(ps[ps.length - 1]!)!.to : edgeById.get(ps[0]!)!.from; };
  for (const jn of J.joins) {
    if (jn.runon || jn.end == null || !WHOLE_PIECES[jn.v] || !WHOLE_PIECES[jn.to]) continue;
    const n = nodeOfWholeEnd(jn.v, jn.end), C = COURSE[jn.v]!;
    if (n && !mouth.has(`${jn.to}|${n}`)) mouth.set(`${jn.to}|${n}`, jn.end ? C[C.length - 1]! : C[0]!);
  }
  { const C = COURSE[HV_OSTIA.mouth]!; mouth.set(`${HV_OSTIA.host}|${HV_OSTIA.node}`, C[C.length - 1]!); }   // (the cava's node at the hepatic veins is the common trunk's ostium: TWO OSTIA)
  // (A FADING END IS NO MOUTH (Mohammad, 24 Nov: "Umbilical vein should grow from more proximal LPV"): the engine's LPV node is the left portal vein's far end, which the placement fades into the left lobe; the paraumbilical
  //  vein and the Meso-Rex bypass, which the engine joins there, were forced onto that fading tip, 0.37 past where the placement draws them leave, at the umbilical portion (the recessus of Rex). An end that fades is not
  //  a place a vessel can open: a branch whose node is such an end lands on the host's wall where the placement draws it, as the 2D figure's umbilical vein leaves its wall (starts.ts leaveVein))
  const fadesAt = (w: string, end: 0 | 1): boolean => !!PLACED_VESSELS[w]?.fade[end];
  const hostEndAt = (w: string, node: string): V3 | undefined => (nodeOfWholeEnd(w, 0) === node ? (fadesAt(w, 0) ? undefined : COURSE[w]![0]!) : nodeOfWholeEnd(w, 1) === node ? (fadesAt(w, 1) ? undefined : COURSE[w]![COURSE[w]!.length - 1]!) : undefined);
  /** Where the placement draws an end that lands on a host's fading end: the host's nearest point to it (the branch's placed end). */
  const wallAt = (w: string, node: string, p: V3): V3 | undefined => ((nodeOfWholeEnd(w, 0) === node && fadesAt(w, 0)) || (nodeOfWholeEnd(w, 1) === node && fadesAt(w, 1)) ? nearestOn(COURSE[w]!, p).at : undefined);
  // THE DIPS (Mohammad, 24 and 25 Nov; docs/approved/dips.md): the course he drew and picked (#2 of dips-his-course.png): from the portal bifurcation (the engine's PVH, the portal trunk's end) it leaves straight up and a little to the screen-left,
  // well away from the left portal vein, crosses the right hepatic artery's depth, arcs over in one wide curve and runs up and right into the cava's centreline at the caudate lobe's lower third (DIPS_DRAWN). Its depth goes from the fork's to
  // the cava's evenly along its length. (History: 6c6b8c9d's 0.22 lead bent the course 56 degrees at the fork, the straight chord fixed that in 3203285e but ran up the left portal vein's line and read as going into it; raising the cava end
  // straight, A/B/C, was rejected. Depth, measured with tests/skin-weld-shade.test.ts and tests/skin-shunts.test.ts: held level for a fifth of its length and then eased, the left portal vein's rim inks 1.2 to 1.5 % of the fork at the front view, or
  // the fork's weld drops the DIPS (no ring on the left portal vein clears it); evenly, the DIPS is welded and the fork inks 0.64 % at the front view and 0.62 % turned, which the portal fork's bound (0.8 %, tests/skin-weld-shade.test.ts INK_BOUND) allows.)
  {
    const pv = COURSE.pv!, iv = COURSE.ivc!;
    const P0 = pv[pv.length - 1]!, yE = DIPS_DRAWN[DIPS_DRAWN.length - 1]![1];
    let E = iv[0]!; for (const q of iv) if (Math.abs(q[1] - yE) < Math.abs(E[1] - yE)) E = q;
    const ctl: V3[] = [P0, ...DIPS_DRAWN.slice(0, -1).map(([x, y]): V3 => [x, y, 0]), E];
    const cum = [0]; for (let i = 1; i < ctl.length; i++) cum.push(cum[i - 1]! + Math.hypot(ctl[i]![0] - ctl[i - 1]![0], ctl[i]![1] - ctl[i - 1]![1]));
    const tot = cum[cum.length - 1]!;
    for (let i = 1; i < ctl.length - 1; i++) ctl[i]![2] = P0[2] + (E[2] - P0[2]) * (cum[i]! / tot);
    COURSE.DIPS = fair(relax(denseCurve(ctl), PLACED_JOINS.relax ?? 40));
  }
  /** How far, in the vessel's radii, a branch that lands at the cut between a collateral piece and a drawn one lands past it, on the drawn piece (the varices on the azygos arch). */
  const AZY_LEAD_R = 4;
  /** A whole vessel's (or a collateral's) end point as it stands. */
  const endPt = (id: string, end: 0 | 1): V3 => { const c = COURSE[id]!; return end ? c[c.length - 1]! : c[0]!; };
  /** The whole's real cuts as shares of its length, one per node between two of its hosts (the engine nodes the vessel is really cut at; the junction nodes inside a host come from the
   *  table). A node a main vessel joins is cut where
   *  the widest such vessel lands on the course (the mouth); a node only collaterals and shunts join, where they land (NODE_S); a node nothing drawn lands at, midway between the cuts either side. */
  function realCuts(w: string): number[] {
    const D = COURSE[w]!, L = lengthOf(D), hosts = WHOLE_HOSTS[w]!, pieces = WHOLE_PIECES[w]!, cuts: number[] = [], free: boolean[] = [];
    for (let hi = 0; hi < hosts.length - 1; hi++) {
      const lastId = lastPieceOf(hosts[hi]!), nextId = firstPieceOf(hosts[hi + 1]!), node = edgeById.get(lastId)!.to;
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
      const ns = NODE_S.get(`${w}|${node}`);
      let at: number;
      if (w === HV_OSTIA.host && node === HV_OSTIA.node) at = nearestOn(D, mouth.get(`${w}|${node}`)!).s / L;   // (TWO OSTIA: the cava is cut at the common trunk's ostium, not at the widest vein's, the right one's, lower down)
      else if (ns !== undefined) at = ns / L;
      // (the node is where the first collateral or shunt lands. A collateral piece of a whole, drawn only when it is open (the lumbar vein, C9, the azygos's lower course), run on
      //  by a drawn piece (the arch): a branch that lands at that cut would meet its run-on at one point, sit on the arch's open (faded) start when the lumbar vein is hidden, and
      //  leave the arch 3 radii to the SVC, short of the 4 a skin needs on each side (the SVC's skin has no ring that clears its blend: tests/skin-inventory.test.ts). So the
      //  branch lands on the drawn piece's wall AZY_LEAD_R of the vessel's radii past the cut, the 2D figure's own drawing (tests/azygos-origin.test.ts). The varices' end is that
      //  far from its engine node, AZY: named in tests/junction-ends.test.ts, as the table cannot say where AZY is drawn.)
      else if (js.length) {
        at = js[0]!.hit.s / L;
        const kc = (id: string): boolean => edgeById.get(id)!.kind === 'collateral';
        if (!js[0]!.main && kc(lastId) !== kc(nextId)) at += ((kc(lastId) ? -1 : 1) * AZY_LEAD_R * rOf(w)) / L;
      }
      else at = (hi + 1) / hosts.length;
      cuts.push(at); free.push(ns === undefined && !js.length);
      void nextId;
    }
    // (a node nothing drawn lands at: its cut is midway between the cuts either side, so both pieces are as long as they can be for their skins)
    for (let i = 0; i < cuts.length; i++) if (free[i]) { let j = i; while (j < cuts.length && free[j]) j++; const lo = i ? cuts[i - 1]! : 0, hi = j < cuts.length ? cuts[j]! : 1; for (let m = i; m < j; m++) cuts[m] = lo + ((hi - lo) * (m - i + 1)) / (j - i + 1); i = j; }
    return cuts;
  }
  /** Where each node that only collaterals and shunts join is drawn on its whole (arc length): the cut between its pieces. */
  const NODE_S = new Map<string, number>();
  /** The pairs `a|b` of ends that open side by side at one node, arms of one skin (below): converging there is no crossing (THE TRACTS CROSS NOTHING). */
  const BESIDE = new Set<string>();
  interface Land { id: string; end: 0 | 1; node: string; w: string; s: number; p: V3; force?: V3; off?: boolean; keep?: boolean }
  const lands: Land[] = [];
  /** The ends that open beside their node's own end (below), each with that end. */
  const SIBLINGS: { o: Land; owner: Land }[] = [];
  for (const id of OWN) {
    const e = edgeById.get(id)!;
    for (const end of [0, 1] as const) {
      if (RUN_ON_ENDS.has(`${id}|${end}`)) continue;
      const node = end ? e.to : e.from, p = end ? COURSE[id]![COURSE[id]!.length - 1]! : COURSE[id]![0]!;
      const cands = atNode(node, id).filter((c) => c.whole !== id);
      let best: { w: string; d: number } | null = null;
      for (const c of cands) { const d = nearestOn(ownCourse(c.whole), p).d; if (!best || (isMain(c.whole) && !isMain(best.w)) || (isMain(c.whole) === isMain(best.w) && d < best.d)) best = { w: c.whole, d }; }
      if (!best || best.d > LAND_REACH + rOf(best.w)) continue;
      // (first as drawn: the host's flow sense at the landing, a vessel that ENDS there merges along the host's flow, one that starts there leaves along it; the azygos and the
      //  epigastric pair land on another collateral's run the same way)
      branch(id, end, best.w, ownCourse(best.w));
      const q = end ? COURSE[id]![COURSE[id]!.length - 1]! : COURSE[id]![0]!;
      lands.push({ id, end, node, w: best.w, s: nearestOn(ownCourse(best.w), q).s, p });
    }
  }
  // (the stent thread's rebuilt DIPS course, from the bifurcation, and the varices round the oesophagus keep the rule they were drawn with at a REAL node: the host's own end, else the
  //  wall where a fading end is, else the main
  //  vessel's mouth. An end at a JUNCTION node (the engine's table, JNODE) has no rule of its own: it opens where the table puts it, in the per-whole pass below.)
  const KEEP_RULE = new Set(['DIPS', 'C1a', 'C1b']);
  for (const l of lands) {
    if (JNODE.has(l.node)) continue;
    if (KEEP_RULE.has(l.id)) { l.force = hostEndAt(l.w, l.node) ?? wallAt(l.w, l.node, l.p) ?? mouth.get(`${l.w}|${l.node}`); l.keep = true; continue; }
    const P = hostEndAt(l.w, l.node) ?? mouth.get(`${l.w}|${l.node}`);
    if (!P) continue;
    if (Math.abs(nearestOn(ownCourse(l.w), P).s - l.s) <= SNAP_R * rOf(l.w)) l.force = P; else l.off = true;
  }
  /** Where each junction node of the engine's table is drawn along its whole (arc length). */
  const JUNCTION_S = new Map<string, number>();
  /** The length a host's drawn course has past its real end nodes: the draw-only through branch hung on the last (right portal vein) or the first (right hepatic vein) piece of its
   *  host, which the table's `at` counts. */
  const branchExt = (w: string): { pre: number; post: number } => {
    let pre = 0, post = 0;
    for (const b of Object.values(PLACED_BRANCHES)) if (b.whole === w) { const l = lengthOf(COURSE[b.through]!); if (b.out) post = l; else pre = l; }
    return { pre, post };
  };
  /** The whole's real cuts (arc length), one per node between its hosts: the host edges' own ends, where the drawing cuts the vessel. */
  const REAL_S = new Map<string, number[]>();
  /** The point of course `D` at arc length `s`. */
  const pointAtS = (D: readonly V3[], s: number): V3 => {
    const sD = arc(D); let j = 1; while (j < D.length - 1 && sD[j]! < s) j++;
    const u = (s - sD[j - 1]!) / ((sD[j]! - sD[j - 1]!) || 1);
    return add(D[j - 1]!, mul(sub(D[j]!, D[j - 1]!), Math.min(1, Math.max(0, u))));
  };
  for (const [w, ps] of Object.entries(WHOLE_PIECES)) {
    const C = ownCourse(w), L = lengthOf(C), R = rOf(w), hosts = WHOLE_HOSTS[w]!;
    const stops: { s: number; fixed: boolean; node: string; land?: Land; others: Land[]; beside: Land[]; jn?: true }[] = [];
    for (let hi = 0; hi < hosts.length - 1; hi++) {
      const lastE = edgeById.get(lastPieceOf(hosts[hi]!))!, n = lastE.to;
      // (the azygos's start: a collateral piece run on by a drawn one keeps its own rule, the cut below)
      if ((lastE.kind === 'collateral') !== (edgeById.get(firstPieceOf(hosts[hi + 1]!))!.kind === 'collateral')) continue;
      const M = mouth.get(`${w}|${n}`);
      const at = lands.filter((l) => l.w === w && l.node === n && !l.force && !l.keep);
      if (M) { stops.push({ s: nearestOn(C, M).s, fixed: true, node: n, others: [], beside: [] }); continue; }
      if (!at.length) continue;
      // (the node's own end: the shunt that divides the vein starting there (skin/divide.ts: the distal splenorenal shunt takes the splenic vein's start at SVD), else the widest)
      const owner = at.find((l) => DIVIDERS.has(`${l.id}|${l.end}`)) ?? at.reduce((x, y) => (rOf(y.id) > rOf(x.id) ? y : x));
      const near = lands.find((l) => l.w === w && (NODE_AT_END[n] === `${l.id}|${l.end}` || (l.off && at.some((m) => Math.abs(l.s - m.s) <= SNAP_R * R))));
      stops.push({ s: near ? near.s : owner.s, fixed: false, node: n, land: owner, others: at.filter((l) => l !== owner), beside: [] });
    }
    stops.sort((x, y) => x.s - y.s);
    for (let i = 1; i < stops.length; i++) {
      const x = stops[i]!, gap = NODE_GAP_R * R;
      if (!x.fixed && !stops[i - 1]!.fixed && x.s - stops[i - 1]!.s < gap) x.s = Math.min(stops[i - 1]!.s + gap, L - 2 * R, stops[i + 1]?.fixed ? stops[i + 1]!.s - gap : Infinity);
    }
    for (const x of stops) if (!x.fixed && x.node) NODE_S.set(`${w}|${x.node}`, x.s);
    // THE JUNCTIONS (27 Nov: "the flow lens, pressure, flow direction and everything else must know where vessel junctions really are"): every take-off along a host is where the
    //  engine's table puts it, `at` of the way along the
    // host's drawn course between its two real end nodes (this whole's real cuts, and the draw-only through branch past its end). Each end the table lists lands there exactly,
    //  whatever else lands beside it; the vessel is cut there.
    // (A real node is still kept NODE_GAP_R radii downstream of the junction before it, as it always was: the renal vein's node LRV past the shunts' junction LRV_S. Its place and the
    //  junction's depend on one another, the junction being
    //  a share of the host, so it is solved by moving the node until it holds, which takes two rounds.)
    const ext = branchExt(w), places: { node: string; host: string; s: number; taps: [string, number][] }[] = [];
    const chains = hosts.map((host) => (JUNCTION_CHAINS as { host: string; nodes: string[]; at: number[]; taps: [string, number][][] }[]).find((c) => c.host === host));
    const place = (): void => {
      places.length = 0;
      const real = realCuts(w);
      REAL_S.set(w, real);
      hosts.forEach((host, hi) => {
        const chain = chains[hi];
        if (!chain) return;
        const x0 = hi === 0 ? -ext.pre : real[hi - 1]! * L, x1 = hi === hosts.length - 1 ? L + ext.post : real[hi]! * L;
        chain.nodes.forEach((node, i) => {
          const s = x0 + chain.at[i]! * (x1 - x0);
          if (s < 1e-6 || s > L - 1e-6) throw new Error(`junction ${node} (${host} at ${chain.at[i]}) falls on the draw-only branch past ${w}'s real course: it needs a cut there`);
          places.push({ node, host, s, taps: chain.taps[i] ?? [] });
        });
      });
    };
    place();
    for (let round = 0; round < 20; round++) {
      let moved = false;
      for (const x of stops) {
        if (x.fixed) continue;
        const before = places.filter((q) => q.s < x.s).reduce<number>((m, q) => Math.max(m, q.s), -Infinity);
        if (Number.isFinite(before) && x.s - before < NODE_GAP_R * R - 1e-9) { x.s = Math.min(before + NODE_GAP_R * R, L - 2 * R); NODE_S.set(`${w}|${x.node}`, x.s); moved = true; }
      }
      if (!moved) break;
      place();
    }
    for (const q of places) {
      JUNCTION_S.set(q.node, q.s);
      const here = lands.filter((l) => l.node === q.node);
      const owner = here.find((l) => DIVIDERS.has(`${l.id}|${l.end}`)) ?? here.reduce<Land | undefined>((a, l) => (!a || rOf(l.id) > rOf(a.id) ? l : a), undefined);
      if (owner) stops.push({ s: q.s, fixed: true, node: q.node, jn: true, land: owner, others: here.filter((l) => l !== owner), beside: [] });
      // (a main vessel that ends here (the coronary vein on the portal trunk) lands there too)
      for (const [sid, sign] of q.taps) { const mw = PIECE_WHOLE.get(sid); if (mw && mw !== w && isMain(mw)) branch(mw, sign > 0 ? 1 : 0, w, ownCourse(w), pointAtS(C, q.s)); }
    }
    // (an end that leaves or arrives within PARALLEL_DEG of its node's own end runs beside it (the spontaneous and the distal splenorenal shunts, 5 degrees apart on the splenic vein,
    //  14 on the renal vein): it opens at its own
    //  node, beside the node's own end, an arm of the same skin (LRV_S builds with both shunts: tests/skin-crotch.test.ts; SVD with both and the short gastric veins, a skin takes
    //  three growing arms), and bows off it (SIBLINGS APART).
    //  ROOT CAUSE (C6 at SV, 25 Nov): it used to open at the next node downstream when a main vessel joins there, "a skin with room for it" (a skin took two growing arms, and SVD had
    //  the distal shunt and the short gastric
    //  veins), so the spontaneous shunt's splenic end went 0.241 (12.7 of the vein's radii) down the splenic vein from where the placement draws it, to the inferior mesenteric vein's
    //  mouth; at its own node it is 1.6 radii from it.
    //  ROOT CAUSE (C6 on the cava, 25 Nov): it used to open on the host's wall past the next node instead, and a wall landing was kept WALL_GAP_R (22) of the host's radii from that
    //  node, so the spontaneous splenorenal shunt's
    //  mouth went 0.54 from where the placement draws it, from the renal vein (0.500, -0.035) to (-0.012, -0.223) beside the cava, and its course swept across the gastrorenal shunt
    //  just above that one's mouth (tests/overlaps.test.ts).
    //  At its own node it opens 3.7 of the renal vein's radii from its drawn landing, within SNAP_R: tests/landing-frozen.test.ts)
    for (const x of stops) for (const o of x.others) {
      if (!x.land || angleDeg(endDir(o.id, o.end), endDir(x.land.id, x.land.end)) >= PARALLEL_DEG) continue;
      x.beside.push(o); SIBLINGS.push({ o, owner: x.land }); BESIDE.add(`${o.id}|${x.land.id}`).add(`${x.land.id}|${o.id}`);
    }
    for (const x of stops) {
      if (x.jn) { for (const l of [x.land!, ...x.others]) l.force = pointAtS(C, x.s); continue; }
      if (x.land && Math.abs(x.s - x.land.s) > 1e-6) x.land.force = along(C, x.s);
      for (const o of x.beside) o.force = along(C, x.s);
    }
  }
  // TWO ENDS ON ONE WALL: two ends that open on a host's wall (no node's skin takes them) closer than PAIR_GAP_R of its radii crowd one skin. The Meso-Rex bypass and the paraumbilical vein are drawn leaving the left portal vein 0.9 radii
  // apart, and the ridge between them was too thin to shade smoothly: 19 degrees off its neighbours (bound 12, tests/skin-exact-normal.test.ts), or their skin grew past its vertex limit. The owner's rule that every join is smooth outranks a
  // mouth exactly where the mock draws it, so the one nearer the host's root moves on up the host to PAIR_GAP_R (5) from the other: the paraumbilical vein, 0.075 up the vein, with the ridge shading 5.8 degrees off its neighbours.
  // (Moving the bypass down instead takes it out of the vein's proximal half and onto the LPV node's skin. Spreading both, or 4.5 to 6.5 radii, either folds the ridge again (14 to 30 degrees) or crowds PVH, and the DIPS loses its weld.)
  for (const w of new Set(lands.map((l) => l.w))) {
    const C = ownCourse(w), L = lengthOf(C), R = rOf(w);
    const onWall = lands.filter((l) => l.w === w && l.id !== 'TIPS' && !JNODE.has(l.node) && !hostEndAt(w, l.node) && !mouth.has(`${w}|${l.node}`) && !NODE_S.has(`${w}|${l.node}`))
      .map((l) => ({ l, s: nearestOn(C, l.force ?? (l.end ? COURSE[l.id]![COURSE[l.id]!.length - 1]! : COURSE[l.id]![0]!)).s }));
    for (let i = 0; i < onWall.length; i++) for (let j = i + 1; j < onWall.length; j++) {
      const a = onWall[i]!, b = onWall[j]!;
      if (Math.abs(a.s - b.s) >= PAIR_GAP_R * R) continue;
      const [lo, hi] = a.s <= b.s ? [a, b] : [b, a];
      lo.s = Math.max(2 * R, hi.s - PAIR_GAP_R * R);
      lo.l.force = along(C, lo.s);
    }
  }
  // (then each end that must open elsewhere lands again, exactly there)
  for (const l of lands) if (l.force && len(sub(l.force, l.end ? COURSE[l.id]![COURSE[l.id]!.length - 1]! : COURSE[l.id]![0]!)) > 1e-6) branch(l.id, l.end, l.w, ownCourse(l.w), l.force);
  // SIBLINGS APART (Mohammad, 25 Nov: every end opens where the placement draws it, smoothly). An end that opens beside its node's own end (within PARALLEL_DEG, above) leaves the host along the same line: the spontaneous
  // splenorenal shunt left the splenic vein 5 degrees beside the distal splenorenal shunt and arrived on the renal vein 14 beside it, the two tracts ran the whole way 0.022 apart, centre to centre (their walls overlapped:
  // their radii sum to 0.047), and no skin could take both (the seam rings stood side by side, inside the hull of the rings: skin/cuts.ts chooseCuts failed after its 40 tries, so the shunt was sent on to the next node, 12.7 of
  // the splenic vein's radii from where the placement draws it). Each such end now bows off its sibling: the course is pushed along N, the normal of the plane of the host's axis and the sibling's heading at the mouth (on
  // the side the end already leans to), by A L b(u), u the share of the course from that end and b(u) = u (1 - u/w)^2 out to w = BOW_SPAN (nothing at the mouth, the heading turned there, and nothing, with no turn,
  // from w on), A the least (in steps of BOW_STEP) that turns the end SIBLING_DEG off its sibling. The mouths stay where they are (tests/landing-frozen.test.ts), the course is smooth (a polynomial, then the bend floor), and its two ends are judged
  // apart, so a course beside its sibling at both ends (the spontaneous shunt) bows off it along its whole length, 0.055 at most (2 of its radii): wall to wall clear of its sibling, the splenic vein's skin SVD takes it as its third growing arm and LRV_S both shunts. (A bow over the whole course, w 1, bowed it 0.11 and
  //  left a thin ridge in the crotch of SVD's part without the divided vein, 20 degrees of shade between neighbours at a far view: tests/skin-exact-normal.test.ts)
  {
    const bows = new Map<string, { end: 0 | 1; N: V3; sib: V3 }[]>();
    for (const { o, owner } of SIBLINGS) {
      const own = endDir(o.id, o.end), sib = endDir(owner.id, owner.end);
      if (angleDeg(own, sib) >= SIBLING_DEG) continue;
      const H = ownCourse(o.w), C = COURSE[o.id]!, ax = tangentAt(H, nearestOn(H, o.end ? C[C.length - 1]! : C[0]!).i);
      let N = norm([ax[1] * sib[2] - ax[2] * sib[1], ax[2] * sib[0] - ax[0] * sib[2], ax[0] * sib[1] - ax[1] * sib[0]]);
      if (dot(N, own) < 0) N = mul(N, -1);
      bows.set(o.id, [...(bows.get(o.id) ?? []), { end: o.end, N, sib }]);
    }
    const b = (u: number): number => (u < BOW_SPAN ? u * (1 - u / BOW_SPAN) * (1 - u / BOW_SPAN) : 0);
    for (const [id, es] of bows) {
      const D = COURSE[id]!, sD = arc(D), L = sD[sD.length - 1]!, A = es.map(() => 0);
      const bowed = (): V3[] => D.map((p, i) => es.reduce((q, e, k) => add(q, mul(e.N, A[k]! * L * b(e.end ? 1 - sD[i]! / L : sD[i]! / L))), p));
      for (let k = 0; k < es.length; k++) while (A[k]! < BOW_MAX) { A[k] = A[k]! + BOW_STEP; COURSE[id] = bowed(); if (angleDeg(endDir(id, es[k]!.end), es[k]!.sib) >= SIBLING_DEG) break; }
      COURSE[id] = resample(fair(bowed()), STEP);
    }
  }

  // ---- the caudate veins: three short tributaries into the cava (the pieces are cut below, so this lands on the whole cava) ----
  for (const k of ['cv1', 'cv2', 'cv3']) if (COURSE[k]) branch(k, 1, 'ivc');

  // ---- cut each whole vessel into its engine pieces: at the real nodes between its hosts (realCuts, which the junction pass above has already used), and each host at its junction
  //  nodes (the table's `at`) ----
  for (const [w, pieces] of Object.entries(WHOLE_PIECES)) {
    const D = COURSE[w]!, s = arc(D), L = s[s.length - 1]!, hosts = WHOLE_HOSTS[w]!, real = REAL_S.get(w) ?? realCuts(w);
    const cuts: number[] = [];
    hosts.forEach((host, hi) => {
      for (const node of piecesOf(host).slice(0, -1).map((id) => edgeById.get(id)!.to)) cuts.push(JUNCTION_S.get(node)! / L);
      if (hi < hosts.length - 1) cuts.push(real[hi]!);
    });
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
  { const c = PLACED_EDGE_3D[pieceEndingAt('IVC_IS', HV_OSTIA.node)]!; PLACED_NODE_3D[HV_OSTIA.node] = c[c.length - 1]!; }   // (the node is the cava's cut, whichever hepatic vein's edge came first)

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
    lay('PRE_R', 'SIN_RR', 'POST_R_RHV', lastPieceOf('PVH_R'), firstPieceOf('RHV_IVC'), 'rha');
    // (the left portal vein runs on past its lobe's outflow: its bed leaves it where it starts to fade, 0.6 of the whole vein from the bifurcation, wherever its pieces are cut)
    {
      const lp = piecesOf('PVH_L'), lens = lp.map((id) => lengthOf(PLACED_EDGE_3D[id]!)), want = LPV_BED * lens.reduce((x, y) => x + y, 0);
      let k = 0, before = 0; while (k < lp.length - 1 && before + lens[k]! < want) { before += lens[k]!; k++; }
      lay('PRE_L', 'SIN_LL', 'POST_L_LHV', lp[k]!, 'LHV_IVC', 'lha', Math.min(0.9, Math.max(0.05, (want - before) / lens[k]!)), 0.45);
    }
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

  // ---- A SEWN END LEAVES ITS HOST (Mohammad, 26 Nov: "mesorex shunt is completely broken ... the shunt breaks and is not continuous"). A surgical shunt's end is an END-TO-SIDE
  // anastomosis, the graft sewn onto the host's side, so it leaves the host's wall at a decided angle. The placement drew the Meso-Rex bypass peeling off the superior mesenteric vein
  // 26 degrees off its axis (32 as laid), so for 3.4 of its radii the graft, wider than the vein, lay along the vein's own continuation and read as a second tube beside it with a knob
  // at its root. Every sewn end (SEWN_ENDS) whose first stretch is nearer than SEWN_MIN to its host's through axis turns out to SEWN_TURN at its mouth, across the screen, on the side
  // it already leaves to (the figure is seen from the front: turned toward the viewer, as first done, the bypass still lay over the vein on the screen, wall on wall), and eases back
  // onto its own course over SEWN_SPAN, so past the turn it keeps its depth in front of the pancreas. The mouth stays where it is. ----
  {
    for (const id of SEWN_ENDS) {
      const e = edgeById.get(id)!;
      for (const end of [0, 1] as const) {
        const D = end ? rev(PLACED_EDGE_3D[id]!) : PLACED_EDGE_3D[id]!.slice(), P0 = D[0]!, r = rOf(id);
        // (the host: the drawn vessel whose wall the mouth is on, at its node or on its side. Its THROUGH axis is its whole course, so a mouth at a run-on node
        //  (the SMV, where V_INT_1 runs on into SMV_CONF) is judged against the vein going on)
        let host: { C: V3[]; d: number } | null = null;
        for (const c of atNode(end ? e.to : e.from, id)) {
          const k = edgeById.get(c.piece)?.kind;
          if (k === 'collateral' || k === 'shunt' || k === 'liver') continue;
          const C = COURSE[c.whole] ?? PLACED_EDGE_3D[c.piece]; if (!C) continue;
          const h = nearestOn(C, P0);
          if (h.d < 1.5 * rOf(c.whole) && (!host || h.d < host.d)) host = { C, d: h.d };
        }
        if (!host) continue;
        const tp = tangentAt(host.C, nearestOn(host.C, P0).i), s = arc(D);
        const at = (len0: number): number => Math.max(1, s.findIndex((x) => x >= len0));
        const h0 = norm(sub(D[at(SEWN_HEAD_R * r)]!, P0)), c0 = dot(h0, tp);
        if (Math.acos(Math.min(1, Math.abs(c0))) * 180 / Math.PI >= SEWN_MIN) continue;
        // (the turn's direction: its heading on the screen, square to the host's axis)
        const f: V3 = [h0[0], h0[1], 0];
        let n = sub(f, mul(tp, dot(f, tp)));
        if (len(n) < 1e-6) continue; n = norm(n);
        const a = (SEWN_TURN * Math.PI) / 180, t0 = norm(add(mul(tp, Math.sign(c0) * Math.cos(a)), mul(n, Math.sin(a))));
        const k = at(SEWN_SPAN), Pk = D[k]!, tk = tangentAt(D, k), L = len(sub(Pk, P0)), m = Math.max(8, Math.round(L / STEP));
        const lead: V3[] = [];
        for (let i = 0; i < m; i++) {
          const u = i / m, u2 = u * u, u3 = u2 * u, h00 = 2 * u3 - 3 * u2 + 1, h10 = u3 - 2 * u2 + u, h01 = -2 * u3 + 3 * u2, h11 = u3 - u2;
          lead.push([0, 1, 2].map((q) => h00 * P0[q]! + h10 * t0[q]! * L + h01 * Pk[q]! + h11 * tk[q]! * L) as V3);
        }
        // (only the new lead is spaced afresh: the rest keeps its own points, so the far mouth's weld is laid on the very samples it was before)
        const R = [...resample([...lead, Pk], STEP).slice(0, -1), ...D.slice(k)], F = fair(R, [SEWN_SPAN, SEWN_SPAN + FAIR_SPAN]);
        PLACED_EDGE_3D[id] = end ? rev(F) : F;
      }
    }
  }

  // ---- THE TRACTS CROSS NOTHING (Mohammad, 24 Nov: nothing crosses): a stent's or a surgical shunt's tract (TRACTS) is laid between its two ends with no regard for what lies between them (the TIPS ran through the right hepatic artery, 0.016 into its
  // wall). Where a tract comes within TRACT_CLEAR, wall to wall, of another drawn vessel away from its own two ends, the stretch round there moves straight away from it, easing to nothing over TRACT_SPAN along the tract and
  // inside its ends' lumens, until it clears; then it is faired. ----
  {
    const radOf = (id: string): number => rOf(wholeOf(id) ?? (DRAWN_COURSES[id] ? id : '')) || 0.005;
    for (const id of TRACTS) {
      let D = PLACED_EDGE_3D[id]!;
      const r = rOf(id), e = edgeById.get(id)!;
      // (the vessels it opens into, those that meet them at its two nodes, and their draw-only branches, count only away from its ends: within three of the two radii of an end the tract is entering them; an end that opens
      //  beside the tract's own at one node (BESIDE: the spontaneous splenorenal shunt beside the distal one at LRV_S, 14 degrees apart) converges on it over far more than that, as the skin's two arms, and is not counted)
      const at = (node: string): Set<string> => new Set(atNode(node, id).map((c) => c.piece));
      const near0 = at(e.from), near1 = at(e.to), hostR = (n: Set<string>): number => Math.max(0, ...[...n].map(radOf));
      const z0 = 3 * (hostR(near0) + r), z1 = 3 * (hostR(near1) + r), inner = [hostR(near0) + r, hostR(near1) + r];
      const os = [
        ...Object.entries(PLACED_EDGE_3D).filter(([o]) => o !== id && edgeById.get(o)?.kind !== 'liver' && !BESIDE.has(`${id}|${o}`)).map(([o, c]) => ({ c, r: radOf(o), end: near0.has(o) ? 0 : near1.has(o) ? 1 : -1 })),
        ...Object.entries(PLACED_SPLIT).map(([h, sp]) => ({ c: sp.side, r: 0.6 * radOf(h), end: near0.has(h) ? 0 : near1.has(h) ? 1 : -1 })),
        ...PLACED_CAUDATE_VEINS.map((c, i) => ({ c, r: PLACED_CAUDATE_R[i] ?? 0.009, end: -1 })),
      ];
      for (let round = 0; round < 60; round++) {
        const s = arc(D), L = s[s.length - 1]!;
        let worst = { gap: Infinity, i: -1, away: [0, 0, 0] as V3 };
        for (let i = 0; i < D.length; i++) {
          if (s[i]! < inner[0]! || L - s[i]! < inner[1]!) continue;
          for (const o of os) {
            if ((o.end === 0 && s[i]! < z0) || (o.end === 1 && L - s[i]! < z1)) continue;
            const h = nearestOn(o.c, D[i]!), gap = h.d - r - o.r;
            if (gap < worst.gap) worst = { gap, i, away: norm(sub(D[i]!, h.at)) };
          }
        }
        if (worst.gap >= TRACT_CLEAR) break;
        const push = TRACT_CLEAR + 0.001 - worst.gap, s0 = s[worst.i]!;
        D = D.map((p, i) => { const w = (1 - smooth(Math.abs(s[i]! - s0) / TRACT_SPAN)) * smooth(s[i]! / inner[0]!) * smooth((L - s[i]!) / inner[1]!); return w > 0 ? add(p, mul(worst.away, push * w)) : p; });
        // (faired and re-spaced only round the stretch it moved: the rest keeps its points, so a change at one end of a tract never re-lays the weld at its other)
        const zone = [s0 - TRACT_SPAN - FAIR_SPAN, s0 + TRACT_SPAN + FAIR_SPAN] as const;
        D = respace(fair(D, zone), zone[0] - FAIR_SPAN, zone[1] + FAIR_SPAN);
      }
      PLACED_EDGE_3D[id] = D;
    }
  }

  // ---- 2D projections: the courses in the 2D figure's units, for the rules written in them (joins, coils, strands), and their depths ----
  for (const [id, c] of Object.entries(PLACED_EDGE_3D)) { PLACED_PATH_2D[id] = c.map((p): P2 => [x2d(p[0]), y2d(p[1])]); PLACED_Z[id] = c.map((p) => p[2]); }
  for (const [n, p] of Object.entries(PLACED_NODE_3D)) PLACED_NODE_2D[n] = [x2d(p[0]), y2d(p[1])];
}
buildPlaced();
/** The cava's piece the caudate veins open into (vessels/caudate-veins.ts CAUDATE_HOST): the piece their ends lie on, wherever the cava is cut (the DIPS lands at the caudate's foot, below them). */
export const PLACED_CAUDATE_HOST: string = (() => {
  const ends = PLACED_CAUDATE_VEINS.map((c) => c[c.length - 1]!);
  if (!ends.length) return firstPieceOf('IVC_IS');
  let best = firstPieceOf('IVC_IS'), bd = Infinity;
  for (const id of WHOLE_PIECES.ivc!) { const c = PLACED_EDGE_3D[id]; if (!c) continue; const d = Math.max(...ends.map((p) => nearestOn(c, p).d)); if (d < bd) { bd = d; best = id; } }
  return best;
})();
/** A course as 2D points and depths. */
export const to2D = (c: readonly V3[]): { pts: P2[]; z: number[] } => ({ pts: c.map((p): P2 => [x2d(p[0]), y2d(p[1])]), z: c.map((p) => p[2]) });
/** Where along `host`'s piece (0 to 1, by length) the point nearest `p` lies. */
export function shareOn(host: string, p: V3): number { const c = PLACED_EDGE_3D[host]!, h = nearestOn(c, p); return h.s / lengthOf(c); }
