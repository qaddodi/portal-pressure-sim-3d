// WP0 of the vessel-geometry plan (recs-22nov/vessel-geometry-review.md): the network as DATA. One node per junction with exactly one position per pose (the body and the Circuit's
// map), and every edge a centreline of 64 bones that starts and ends exactly on its nodes, so continuity is true by construction and no runtime code has to keep it true.
//
// The courses are read as they are (vessels/network.ts for the body, circuit/course.ts for the two poses sampled at the same 64 steps of arc length); nothing is redrawn. What this
// file adds, by the plan owner's rulings of 22 Nov: (1) a node's place is where the TRUNKS meet (the pair that runs on into one another, else the widest veins), radius-weighted, per pose;
// (2) a branch whose end lies on a trunk's wall is a SIDE-WALL LANDING: the host is split there into two edges at its own bone and the branch ends on that bone, the short way from where it was drawn;
// where the map draws that branch at the host's end instead, the host's map bones between the landing and that end are laid at the station (as the 2D diagram has one meeting point);
// (3) any other end eases onto its node (an end in a fully faded tail bends only inside it, hiddenTail) over its last stretch by the one fade the course code already uses (network.ts `jointFade`), and every move past 25 % of its course or 3 radii must be named (KNOWN_BIG_MOVES);
// (4) where two vessels carry straight on into each other (network.ts RUN_PAIRS) one shared tangent at the node and one shared radius, and where the MAP turns there (IVCS to RA, the epigastric vein, the hepatic artery) the corner is
// rounded as the map rounds its own (course.ts CORNER_R, a quadratic through the corner, the node on the curve); (5) a parallel-transport frame along every edge that runs on across those joins.
//
// The skeleton is pure data: nothing here is read by the old path (the default), and nothing in the scene imports it until WP4 (`?geom=net`).
import type { Vec3 } from '../../anatomy/vessels.ts';
import { CORNER_R, COURSES, N_TRACK } from '../../circuit/course.ts';
import { frameN } from '../../circuit/frame.ts';
import { MAP_K } from '../../circuit/map.ts';
import { circuitWidthMap } from '../../circuit/width.ts';
import { fadeOf } from '../fades.ts';
import { tipAlpha, vesselAlphaAt } from '../fade-alpha.ts';
import { MAPPED, NETWORK_BY_ID, RUN_PAIRS, jointFade, type NetVessel } from '../network.ts';
import { radiusAtU } from '../tubes.ts';
import type { Bone, SkelEdge, SkelNode, Skeleton } from './types.ts';

/** Bones to an edge: the Circuit's N_TRACK (the 2D morph's sample count), so sample i of the body course is sample i of the map course. */
export const BONES_PER_EDGE = N_TRACK;
/** An end's easing reach: 6 times its move (a slope of one in six, under 10 degrees of lean), but at least this share of the course and at most 45 % (the two ends of a short vessel never overlap). */
export const REACH_MIN = 0.12, REACH_MAX = 0.45, REACH_PER_MOVE = 6;
/** Two courses run on into one another when their outward directions at the node are within this of opposite (network.ts `joined`: cos < -0.9, about 25 degrees). */
export const RUN_COS = -0.9;

export interface SkelEnd { edge: string; end: 0 | 1; node: string; pose: 0 | 1; /** how far the end moved onto its node (scene units) */ move: number; /** the length it eased over (scene units) */ reach: number; /** the move as a share of the whole course */ share: number; /** the move in radii of the widest vessel at the node */ radii: number; /** the part of it across the plane (x and y), in the same radii: the rest is depth, which the drawn tubes ease to their node's depth too (NODE_Z) */ planar: number }
/** What building the skeleton found: every end that had to move (to read the cost), the landings that split a host, the map's rounded corners, and which run-ons carry straight on in each pose. */

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len = (a: Vec3): number => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => { const l = len(a); return l > 1e-12 ? scale(a, 1 / l) : [0, 0, 0]; };

/** The node an end of `v` belongs to. The artery and the veins are separate networks (the hepatic artery ends at the tips of the bed's lanes, not on its stations: 2D, Mohammad 21 Nov), so an artery's node has its own id. */
export const nodeIdOf = (v: Pick<NetVessel, 'from' | 'to' | 'tone'>, end: 0 | 1): string => `${end ? v.to : v.from}${v.tone === 'artery' ? ':art' : ''}`;

interface Work { v: NetVessel; P: [Vec3[], Vec3[]]; arc: [number[], number[]]; r: [number[], number[]] }

function arcOf(P: readonly Vec3[]): number[] {
  const a = [0];
  for (let i = 1; i < P.length; i++) a.push(a[i - 1]! + len(sub(P[i]!, P[i - 1]!)));
  return a;
}
/** The stretch at `end` of a course that the DOWN-THE-FIGURE fade (the tails below the plate) leaves fully faded (resting alpha at most FADE_SEEN, fades.ts / fade-alpha.ts): `n` bones and `d` arc length from the end. The end's bend may run this far and no further, so the part anyone sees never moves. Zeros when the end itself is drawn or the fade is another kind. */
export const FADE_SEEN = 0.02;
export function hiddenTail(id: string, P: readonly Vec3[], arc: readonly number[], end: 0 | 1): { n: number; d: number } {
  const n = P.length, total = arc[n - 1]!, art = NETWORK_BY_ID.get(id)?.tone === 'artery';
  const f = fadeOf(id, art);
  if (!f || f.mode !== 2) return { n: 0, d: 0 };   // (the others fade along the vessel and stay as they were)
  let c = 0, d = 0;
  for (let q = 0; q < n; q++) {
    const i = end ? n - 1 - q : q;
    if (tipAlpha(f, i / (n - 1), P[i]![0], P[i]![1]) > FADE_SEEN) break;
    c++; d = end ? total - arc[i]! : arc[i]!;
  }
  return { n: c, d };
}
const sstep = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-9))); return t * t * (3 - 2 * t); };
/** The bones at each end of a vessel that nothing draws at rest: `body` where the body's fade (vesselAlphaAt) is at most FADE_SEEN, `both` where the Circuit's too (the map holds every fade off but an artery's own mapFade, vessel-object.ts setTipFade), counted along the course's own samples. A lens, a selection or an opened collateral that lets a fade go is not read: WP2 culls on `both` only, and only that. */
export function hiddenCounts(id: string): { body: [number, number]; both: [number, number] } {
  const c = COURSES.get(id), v = NETWORK_BY_ID.get(id), n = BONES_PER_EDGE;
  if (!c || !v) return { body: [0, 0], both: [0, 0] };
  const f = fadeOf(id, v.tone === 'artery'), at = (i: number) => vesselAlphaAt(id, i / (n - 1), c.A[i]!.x, c.A[i]!.y), onMap = (i: number) => (f?.mapFade ? 1 - sstep(f.mapFade[0], f.mapFade[1], i / (n - 1)) : 1);
  const run = (ok: (i: number) => boolean, end: 0 | 1): number => { let k = 0; while (k < n && ok(end ? n - 1 - k : k)) k++; return k; };
  const body = (i: number) => at(i) <= FADE_SEEN, both = (i: number) => at(i) <= FADE_SEEN && onMap(i) <= FADE_SEEN;
  return { body: [run(body, 0), run(body, 1)], both: [run(both, 0), run(both, 1)] };
}

/** The reach an end eases over, from how far it moves and the course's length. */
export const reachOf = (move: number, courseLen: number): number => Math.min(REACH_MAX * courseLen, Math.max(REACH_PER_MOVE * move, REACH_MIN * courseLen));

/** Moves the samples of one end by `delta`, fading with the arc length from that end by the course code's own joint fade. */
function easeEnd(P: Vec3[], arc: readonly number[], end: 0 | 1, delta: Vec3, reach: number): void {
  const n = P.length, total = arc[n - 1]!;
  for (let q = 0; q < n; q++) {
    const i = end ? n - 1 - q : q, d = end ? total - arc[i]! : arc[i]!;
    const w = jointFade(d, reach);
    if (w <= 0) break;
    P[i] = add(P[i]!, scale(delta, w));
  }
}
/** Lays the `n` bones at `end` (a stretch nothing draws) on one cubic Hermite turn from the last drawn bone to `to`, evenly in the curve's parameter: it leaves the drawn course the way the course was going and arrives at `to` heading along the line from the drawn bone to it, so a node that lies back the way the vessel came (the iliac node above EPI_ILI's and C4's tails) is reached by a wide U-turn, not the hairpin an ease through the same few bones makes. */
function layTail(P: Vec3[], end: 0 | 1, n: number, to: Vec3): void {
  const m = P.length, at = (q: number) => (end ? m - 1 - q : q), iB = at(n), B = P[iB]!, go = unit(sub(B, P[at(n + 1)]!)), chord = sub(to, B), L = 1.5 * len(chord) + 1e-9, T0 = scale(go, L), T1 = scale(unit(chord), L);
  for (let q = 1; q <= n; q++) {
    const t = q / n, t2 = t * t, t3 = t2 * t, h00 = 2 * t3 - 3 * t2 + 1, h10 = t3 - 2 * t2 + t, h01 = -2 * t3 + 3 * t2, h11 = t3 - t2;
    P[at(n - q)] = add(add(scale(B, h00), scale(T0, h10)), add(scale(to, h01), scale(T1, h11)));
  }
}
/** The direction a course leaves its end in, into the course (the first secant: what the bones themselves say). */
const intoOf = (P: readonly Vec3[], end: 0 | 1): Vec3 => (end ? unit(sub(P[P.length - 2]!, P[P.length - 1]!)) : unit(sub(P[1]!, P[0]!)));

/** Bends the first stretch of a course so that its direction into the course at `end` becomes `want`, the end itself fixed: adds `delta * h(d)`, h(d) = d (1 - d / reach)^2 (slope 1 at the end, nothing past `reach`). Repeated, since the bones are discrete. */
function aimEnd(P: Vec3[], arc: readonly number[], end: 0 | 1, want: Vec3, reach: number): void {
  const n = P.length, total = arc[n - 1]!;
  for (let it = 0; it < 6; it++) {
    const have = intoOf(P, end), delta = sub(want, have);
    if (len(delta) < 1e-9) return;
    for (let q = 1; q < n; q++) {
      const i = end ? n - 1 - q : q, d = end ? total - arc[i]! : arc[i]!;
      if (d >= reach) break;
      const h = d * (1 - d / reach) * (1 - d / reach);
      P[i] = add(P[i]!, scale(delta, h));
    }
  }
}

/** The rest radius of a vessel at each bone in the body: its own, eased to the mean width where it runs on into another vessel (network.ts taper, tubes.ts radiusAtU: the one rule). */
function bodyRadii(v: NetVessel, courseLen: number, taper: readonly [number, number] | undefined): number[] {
  const out: number[] = [];
  for (let i = 0; i < BONES_PER_EDGE; i++) out.push(radiusAtU({ pts: v.pts, radius: v.radius, ...(taper ? { taper } : {}) }, i / (BONES_PER_EDGE - 1), courseLen));
  return out;
}
/** A vessel's rest radius on the map (scene units): the 2D rule's width in map units (circuit/width.ts, boost 1) halved and carried by the map's scale. */
export const mapRadiusOf = (v: Pick<NetVessel, 'widthKind' | 'baseD' | 'circFine'>): number => 0.5 * circuitWidthMap(v.widthKind, v.baseD, 1, v.circFine ?? 1) * MAP_K;

function rodrigues(n: Vec3, from: Vec3, to: Vec3): Vec3 {
  const ax = cross(from, to), s = len(ax), c = dot(from, to);
  if (s < 1e-12) return c > 0 ? n : n;   // (no turn; an exact reversal does not occur between neighbouring samples)
  const k = scale(ax, 1 / s);
  // n cos + (k x n) sin + k (k . n)(1 - cos)
  return add(add(scale(n, c), scale(cross(k, n), s)), scale(k, dot(k, n) * (1 - c)));
}
const tangentsOf = (P: readonly Vec3[]): Vec3[] => P.map((_, i) => unit(sub(P[Math.min(P.length - 1, i + 1)]!, P[Math.max(0, i - 1)]!)));
/** A parallel-transport frame along the samples from the end `from` (so the frame at the other end follows from it). `n0` is carried in when the course runs on from an edge already framed. t points the way the samples run (0 to 63). */
function transport(P: readonly Vec3[], from: 0 | 1, n0: Vec3 | null): [Vec3, Vec3, Vec3][] {
  const T = tangentsOf(P), n = P.length, out: [Vec3, Vec3, Vec3][] = new Array(n);
  const first = from ? n - 1 : 0;
  let nn: Vec3;
  if (n0) { const p = sub(n0, scale(T[first]!, dot(n0, T[first]!))); nn = len(p) > 1e-9 ? unit(p) : frameN(T[first]!) as Vec3; } else nn = frameN(T[first]!) as Vec3;
  for (let q = 0; q < n; q++) {
    const i = from ? n - 1 - q : q;
    if (q > 0) { const prev = from ? i + 1 : i - 1; nn = unit(rodrigues(nn, T[prev]!, T[i]!)); nn = unit(sub(nn, scale(T[i]!, dot(nn, T[i]!)))); }
    out[i] = [T[i]!, nn, cross(T[i]!, nn)];
  }
  return out;
}

/** An end that lies within this many radii of another incident course (and nearer to it than to the node) lands on its wall: the host is split there into a real node (the plan's side-wall rule) and the landing course stays as drawn. */
export const LAND_RADII = 3;
/** The fewest bones a landing keeps from its host's ends and from another landing. */
const MIN_PIECE = 5, MIN_GAP = 3;
/** Procedure shunts that run along a trunk from its end (DIPS from the portal vein, REX from the superior mesenteric vein) start on the trunk's wall MIN_PIECE bones in, a junction of their own outside the cluster at the trunk's end (WP2 ruling, 22 Nov: the sheet rung cannot take them in the cluster). `edge|end`. */
export const WALL_STARTS: ReadonlySet<string> = new Set(['DIPS|0', 'REX|0']);
/** The most an end may move onto its node: a share of its course, and a count of radii. A move past either fails the skeleton test unless `KNOWN_BIG_MOVES` names it with a reason. */
/** The fewest bones a rounded map corner spreads over on each side of its node. */
export const FILLET_BONES = 5;
export const MAX_MOVE_SHARE = 0.25, MAX_MOVE_RADII = 3;

/** Ends whose move is past the limits because the DATA puts them there, each named with its kind and reason; the test fails on any other end past the limits and on any named here that is not past them any more, and checks each reason against the build's own report
 *  ('fade': the end lies in the faded tail below the plate, past 2D's FADE_DOWN_Y start;
 *  'depth': the move is the depth the drawn tubes ease to their node's too (NODE_Z), not a bend across the plate; 'fillet': the node sits on a rounded map corner, not on the corner point the branch ends at; 'data': none of these, named as an open gap). Key: `edge|end|pose`. */
export const KNOWN_BIG_MOVES: Readonly<Record<string, { why: 'fade' | 'depth' | 'fillet' | 'data'; reason: string }>> = {
  'EPI_ILI|1|0': { why: 'fade', reason: "the epigastric vein's end is 100 figure units from the iliac trunk's start, in the tail 2D fades out below the plate (fade 870 to 925, its end at 950): the bend runs only inside the fully faded stretch (hiddenTail, alpha at most 0.02), so the drawn part does not move (tests/net-skeleton.test.ts); a steep hairpin there (about 64 degrees between bones), invisible" },
  'C4|1|0': { why: 'fade', reason: "the rectal collateral's end (y 1010) is 0.6 from the iliac node, in the tail the 3D fade takes out below the plate (fade 940 to 1005): the bend runs only inside the fully faded stretch (hiddenTail), so the drawn part does not move; a steep hairpin there (over 100 degrees between bones), invisible" },
  'C3|1|0': { why: 'depth', reason: 'the paraumbilical vein runs at the forward tier (z 0.2) and reaches the umbilicus node at the plate: the move is all depth' },
  'C3|0|0': { why: 'data', reason: "the paraumbilical vein's start is 8.8 radii across the plane from the left portal vein's node (the old path leaves it on the wall, starts.ts); no landing fits; open gap" },
  'C3|1|1': { why: 'fillet', reason: "the epigastric node sits on the rounded corner of the map's EPI run-on (wide because the epigastric-SVC edge is long and its bones far apart); the paraumbilical vein's map end is at the corner point" },
  'C7|0|0': { why: 'data', reason: "the retroperitoneal collateral's start is 3.1 radii (0.036) from the mesenteric node, 13 % of its course: over the radii limit only; open gap" },
  'S_MC|1|0': { why: 'data', reason: 'a short surgical shunt (0.25) 2.8 radii from the cava node: under the radii limit, over the share; shunts are WP5' },
};

export interface SkelLanding { host: string; branch: string; branchEnd: 0 | 1; /** the host's bone the node sits on */ bone: number; node: string }
/** A host whose map course is re-laid so that a landing the body has and the map does not stays whole: the map draws the branch ending at the host's end `hostEnd` (its station), so on the map the host's bones from `bone` to that end are all at the station (the pieces between the landings have no length there, as in the 2D diagram, where the branches meet in one point) and the rest of the course is spread over its whole length. */
export interface SkelCollapse { host: string; hostEnd: 0 | 1; bone: number }
export interface SkeletonReport { ends: SkelEnd[]; collapses: SkelCollapse[]; landings: SkelLanding[]; runOns: { node: string; a: string; b: string; opposed: [boolean, boolean] }[]; fillets: { node: string; a: string; b: string; reach: number }[] }

const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
/** The point at fractional bone `f` of the samples. */
const atBone = (P: readonly Vec3[], f: number): Vec3 => { const i = Math.min(P.length - 2, Math.max(0, Math.floor(f))); return lerp3(P[i]!, P[i + 1]!, f - i); };
/** The nearest point of the samples to `q`: its distance and fractional bone. */
function nearest(P: readonly Vec3[], q: Vec3): { d: number; f: number } {
  let best = Infinity, f = 0;
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i]!, ab = sub(P[i + 1]!, a), l2 = dot(ab, ab), t = l2 > 0 ? Math.min(1, Math.max(0, dot(sub(q, a), ab) / l2)) : 0, d = dist(add(a, scale(ab, t)), q);
    if (d < best) { best = d; f = i + t; }
  }
  return { d: best, f };
}
const dist = (a: Vec3, b: Vec3): number => len(sub(a, b));
/** The point at arc length `s` from an end of the samples (`arc`: their running length). */
function atArcFromEnd(P: readonly Vec3[], arc: readonly number[], end: 0 | 1, s: number): Vec3 {
  const n = P.length, total = arc[n - 1]!, at = end ? total - s : s;
  for (let i = 1; i < n; i++) if (arc[i]! >= at) { const span = arc[i]! - arc[i - 1]!; return lerp3(P[i - 1]!, P[i]!, span > 0 ? (at - arc[i - 1]!) / span : 0); }
  return P[n - 1]!;
}

/** Builds the skeleton from the drawn network (the vessels with a map course; the fans of tributaries have none and join the skeleton in WP5, with their presence). */
export function buildSkeletonWithReport(): { skeleton: Skeleton; report: SkeletonReport } {
  const order: NetVessel[] = [...MAPPED], byId = new Map(order.map((v) => [v.id, v]));
  const work = new Map<string, Work>();
  for (const v of order) {
    const g = COURSES.get(v.id)!, P: [Vec3[], Vec3[]] = [g.A.map((p): Vec3 => [p.x, p.y, p.z]), g.C.map((p): Vec3 => [p.x, p.y, p.z])];
    work.set(v.id, { v, P, arc: [arcOf(P[0]), arcOf(P[1])], r: [[], []] });
  }
  const report: SkeletonReport = { ends: [], collapses: [], landings: [], runOns: [], fillets: [] };
  const radius = (v: NetVessel, pose: 0 | 1): number => (pose ? mapRadiusOf(v) : v.radius);
  const endOf = (w: Work, end: 0 | 1, pose: 0 | 1): Vec3 => w.P[pose][end ? BONES_PER_EDGE - 1 : 0]!;
  const keyOf = (v: NetVessel, end: 0 | 1): string => `${v.id}|${end}`;

  // ---- the ends that meet, per network
  const groups = new Map<string, { v: NetVessel; end: 0 | 1 }[]>();
  for (const v of order) for (const end of [0, 1] as const) { const id = nodeIdOf(v, end), l = groups.get(id) ?? []; l.push({ v, end }); groups.set(id, l); }

  // ---- the trunks of each node: the pair that runs on into one another, else the widest veins (a collateral, a shunt and a liver bed are branches). Only a branch moves onto the node.
  const pairsAt = new Map<string, typeof RUN_PAIRS>();
  for (const p of RUN_PAIRS) {
    const va = byId.get(p.a), vb = byId.get(p.b);
    if (!va || !vb) continue;
    const id = nodeIdOf(va, p.ea);
    if (nodeIdOf(vb, p.eb) === id) (pairsAt.get(id) ?? pairsAt.set(id, []).get(id)!).push(p);
  }
  const trunk = new Set<string>();
  for (const [id, l] of groups) {
    if (l.length < 2) { for (const e of l) trunk.add(keyOf(e.v, e.end)); continue; }
    const pr = pairsAt.get(id);
    if (pr?.length) { for (const p of pr) { trunk.add(`${p.a}|${p.ea}`); trunk.add(`${p.b}|${p.eb}`); } continue; }
    const main = l.filter((e) => e.v.kind !== 'collateral' && e.v.kind !== 'shunt' && e.v.kind !== 'liver'), pool = main.length ? main : l, top = Math.max(...pool.map((e) => e.v.radius));
    for (const e of pool) if (e.v.radius >= 0.9 * top) trunk.add(keyOf(e.v, e.end));
  }

  // ---- the node's place: the trunks' radius-weighted mean, per pose
  const nodePos = new Map<string, [Vec3, Vec3]>();
  for (const [id, l] of groups) {
    const t = l.filter((e) => trunk.has(keyOf(e.v, e.end)));
    nodePos.set(id, [0, 1].map((pose): Vec3 => {
      let s: Vec3 = [0, 0, 0], tot = 0;
      for (const { v, end } of t) { const wt = radius(v, pose as 0 | 1); s = add(s, scale(endOf(work.get(v.id)!, end, pose as 0 | 1), wt)); tot += wt; }
      return scale(s, 1 / tot);
    }) as [Vec3, Vec3]);
  }

  // ---- map corners are real: a run-on that turns on the map (IVCS to RA, the epigastric vein, the hepatic artery) is rounded as the map's own corners are (course.ts CORNER_R, a quadratic through the corner), and the node sits on the rounded curve
  const filleted = new Set<string>();
  for (const [id, pr] of pairsAt) {
    const p = pr[0]!, wa = work.get(p.a)!, wb = work.get(p.b)!;
    if (dot(intoOf(wa.P[1], p.ea), intoOf(wb.P[1], p.eb)) < RUN_COS) continue;
    const c = nodePos.get(id)![1], la = wa.arc[1][BONES_PER_EDGE - 1]!, lb = wb.arc[1][BONES_PER_EDGE - 1]!, d = Math.min(REACH_MAX * la, REACH_MAX * lb, Math.max(CORNER_R * MAP_K, FILLET_BONES * Math.max(la, lb) / (BONES_PER_EDGE - 1)));   // (a long edge's bones are far apart: the fillet takes at least FILLET_BONES of them, or it is a corner again)
    const p0 = atArcFromEnd(wa.P[1], wa.arc[1], p.ea, d), p1 = atArcFromEnd(wb.P[1], wb.arc[1], p.eb, d);
    const bez = (t: number): Vec3 => add(add(scale(p0, (1 - t) * (1 - t)), scale(c, 2 * (1 - t) * t)), scale(p1, t * t));
    nodePos.get(id)![1] = bez(0.5);
    const lay = (w: Work, end: 0 | 1, t0: number, t1: number) => {
      const n = BONES_PER_EDGE, total = w.arc[1][n - 1]!, old = w.arc[1];
      for (let q = 0; q < n; q++) {
        const i = end ? n - 1 - q : q, s = end ? total - old[i]! : old[i]!;
        if (s >= d) break;
        w.P[1][i] = bez(t0 + (t1 - t0) * (1 - s / d));   // (s = 0 is the node, t = 0.5; s = d is the course's own point, t = 0 or 1)
      }
    };
    lay(wa, p.ea, 0, 0.5); lay(wb, p.eb, 1, 0.5);
    filleted.add(keyOf(wa.v, p.ea)); filleted.add(keyOf(wb.v, p.eb));
    report.fillets.push({ node: id, a: p.a, b: p.b, reach: d });
  }

  // ---- side-wall landings: a branch whose end lies on a trunk's wall (nearer to the trunk's course than to the node) splits that trunk there, at the trunk's own bone: the trunk is kept as drawn and the branch's end goes the short way to it
  const landings: (SkelLanding & { collapse?: 0 | 1 })[] = [], landed = new Set<string>();
  for (const [id, l] of groups) {
    if (l.length < 2) continue;
    for (const { v, end } of l) {
      if (trunk.has(keyOf(v, end))) continue;
      const q = endOf(work.get(v.id)!, end, 0), toNode = dist(q, nodePos.get(id)![0]);
      let best: { h: NetVessel; d: number; f: number } | null = null;
      for (const t of l) {
        if (!trunk.has(keyOf(t.v, t.end)) || t.v === v) continue;
        const r = nearest(work.get(t.v.id)!.P[0], q);
        if (!best || r.d < best.d) best = { h: t.v, d: r.d, f: r.f };
      }
      const wall = WALL_STARTS.has(keyOf(v, end));
      if (!best || (!wall && (best.f < MIN_PIECE || best.f > BONES_PER_EDGE - 1 - MIN_PIECE))) continue;
      // (the node is the host's own bone, the host as drawn: the branch's end goes to it, a short way (under LAND_RADII radii and a quarter of the branch), where the host passes it; a wall start takes the bone MIN_PIECE in from the host's end, however near the node is)
      let bone = wall ? Math.min(BONES_PER_EDGE - 1 - MIN_PIECE, Math.max(MIN_PIECE, Math.round(best.f))) : Math.round(best.f);
      const hw = work.get(best.h.id)!, bw = work.get(v.id)!;
      if (wall) {   // (its own junction: MIN_GAP bones from any other landing on the host, on the side nearer its start)
        const taken = landings.filter((x) => x.host === best!.h.id).map((x) => x.bone), free = (b: number) => b >= MIN_PIECE && b <= BONES_PER_EDGE - 1 - MIN_PIECE && taken.every((t) => Math.abs(t - b) >= MIN_GAP);
        if (!free(bone)) { const c = [...taken.flatMap((t) => [t - MIN_GAP, t + MIN_GAP]), bone].filter(free).sort((a, b) => dist(q, hw.P[0][a]!) - dist(q, hw.P[0][b]!))[0]; if (c == null) continue; bone = c; }
      }
      const dBone = dist(q, hw.P[0][bone]!);
      if (dBone > LAND_RADII * Math.max(best.h.radius, v.radius) || dBone > MAX_MOVE_SHARE * bw.arc[0][BONES_PER_EDGE - 1]! || (!wall && dBone + 0.5 * best.h.radius >= toNode)) continue;
      // (the map takes the landing too, at the host's same bone. Where the map draws the branch at the host's end instead (its station), the host's map bones from the landing to that end are laid at the station, so the map keeps its one meeting point: `collapse`)
      const mapMove = dist(endOf(bw, end, 1), hw.P[1][bone]!), mapShare = mapMove / bw.arc[1][BONES_PER_EDGE - 1]!, mapRadii = mapMove / Math.max(mapRadiusOf(best.h), mapRadiusOf(v));
      let collapse: 0 | 1 | undefined;
      if (mapShare > MAX_MOVE_SHARE || mapRadii > MAX_MOVE_RADII) {
        const d0 = dist(endOf(bw, end, 1), hw.P[1][0]!), d1 = dist(endOf(bw, end, 1), hw.P[1][BONES_PER_EDGE - 1]!), e: 0 | 1 = d1 < d0 ? 1 : 0;
        if (Math.min(d0, d1) > MAX_MOVE_RADII * Math.max(mapRadiusOf(best.h), mapRadiusOf(v))) continue;   // (the map draws it nowhere near the host's end: no landing, its end eases onto the node)
        if (landings.some((x) => x.host === best!.h.id && x.collapse != null && x.collapse !== e)) continue;
        collapse = e;
      }
      // (two branches within MIN_GAP bones of one another share one node)
      const near = wall ? undefined : landings.find((x) => x.host === best!.h.id && Math.abs(x.bone - bone) < MIN_GAP);
      const rec = { host: best.h.id, branch: v.id, branchEnd: end, bone: near ? near.bone : bone, node: near ? near.node : `${best.h.id}@${v.id}`, ...(collapse != null ? { collapse } : {}) };
      landings.push(rec); landed.add(keyOf(v, end));
    }
  }

  // ---- ease each end onto its node
  const reachOfEnd = new Map<string, number>();
  const note = (v: NetVessel, end: 0 | 1, node: string, pose: 0 | 1, delta: Vec3, total: number, reach: number, rad: number) =>
    report.ends.push({ edge: v.id, end, node, pose, move: len(delta), reach, share: len(delta) / total, radii: len(delta) / rad, planar: Math.hypot(delta[0], delta[1]) / rad });
  const nodeRadius = (l: { v: NetVessel }[], pose: 0 | 1): number => Math.max(...l.map((e) => radius(e.v, pose)));
  for (const [id, l] of groups) {
    if (l.length < 2) continue;
    for (const { v, end } of l) {
      const w = work.get(v.id)!, key = keyOf(v, end);
      for (const pose of [0, 1] as const) {
        if (landed.has(key)) continue;   // (a landing's branch is eased onto the host's bone below, once the host is final)
        if (pose === 1 && filleted.has(key)) continue;
        const P = w.P[pose], delta = sub(nodePos.get(id)![pose], endOf(w, end, pose)), move = len(delta);
        if (move <= 0) continue;
        let reach = reachOf(move, w.arc[pose][P.length - 1]!);
        const hid = pose === 0 ? hiddenTail(v.id, P, w.arc[0], end) : { n: 0, d: 0 };
        if (hid.n >= 1) { reach = Math.min(reach, hid.d); layTail(P, end, hid.n, nodePos.get(id)![0]); }   // (an end in a faded tail goes to its node inside it, on one smooth turn: nothing drawn moves, nothing folds)
        else easeEnd(P, w.arc[pose], end, delta, reach);
        reachOfEnd.set(`${key}|${pose}`, reach);
        note(v, end, id, pose, delta, w.arc[pose][P.length - 1]!, reach, nodeRadius(l, pose));
      }
    }
  }
  // ---- run-ons: one shared direction at the node (the body; the map where its course carries straight on), one shared radius
  const runOnAt = new Map<string, { a: string; ea: 0 | 1; b: string; eb: 0 | 1 }>();
  for (const [id, pr] of pairsAt) for (const p of pr) {
    const wa = work.get(p.a)!, wb = work.get(p.b)!, opposed: [boolean, boolean] = [false, false];
    for (const pose of [0, 1] as const) {
      opposed[pose] = dot(intoOf(wa.P[pose], p.ea), intoOf(wb.P[pose], p.eb)) < RUN_COS;
      if (pose === 1 && !opposed[1]) opposed[1] = filleted.has(keyOf(wa.v, p.ea));   // (a rounded corner: its tangent is shared by construction)
    }
    report.runOns.push({ node: id, a: p.a, b: p.b, opposed });
    // a node's one run-on: the first opposed in the body
    if (dot(intoOf(wa.P[0], p.ea), intoOf(wb.P[0], p.eb)) < RUN_COS && !runOnAt.has(id)) runOnAt.set(id, p);
    for (const pose of [0, 1] as const) {
      if (pose === 1 && filleted.has(keyOf(wa.v, p.ea))) continue;
      if (dot(intoOf(wa.P[pose], p.ea), intoOf(wb.P[pose], p.eb)) >= RUN_COS) continue;
      const oa = intoOf(wa.P[pose], p.ea), ob = intoOf(wb.P[pose], p.eb), m = unit(sub(oa, ob));
      const reach = (w: Work, end: 0 | 1) => reachOfEnd.get(`${keyOf(w.v, end)}|${pose}`) ?? reachOf(0, w.arc[pose][w.P[pose].length - 1]!);
      aimEnd(wa.P[pose], wa.arc[pose], p.ea, m, reach(wa, p.ea));
      aimEnd(wb.P[pose], wb.arc[pose], p.eb, scale(m, -1), reach(wb, p.eb));
    }
  }

  // the landings: the host is final (its ends eased and aimed): each landing branch's end eases onto the host's bone, in both poses
  const landNode = new Map<string, [Vec3, Vec3]>(), landedAt = new Map<string, string>();
  for (const host of new Set(landings.filter((x) => x.collapse != null).map((x) => x.host))) {
    const mine = landings.filter((x) => x.host === host && x.collapse != null), e = mine[0]!.collapse!, hw = work.get(host)!, orig = hw.P[1].slice(), n = BONES_PER_EDGE;
    const at = e ? Math.min(...mine.map((x) => x.bone)) : Math.max(...mine.map((x) => x.bone));
    for (let k = 0; k < n; k++) {
      if (e ? k >= at : k <= at) { hw.P[1][k] = orig[e ? n - 1 : 0]!; continue; }
      hw.P[1][k] = atBone(orig, e ? (k / at) * (n - 1) : (n - 1) - ((n - 1 - k) / (n - 1 - at)) * (n - 1));
    }
    hw.arc[1] = arcOf(hw.P[1]);
    report.collapses.push({ host, hostEnd: e, bone: at });
  }
  for (const L of landings) {
    landedAt.set(keyOf(byId.get(L.branch)!, L.branchEnd), L.node);
    const hw = work.get(L.host)!, bw = work.get(L.branch)!, pos = landNode.get(L.node) ?? ([hw.P[0][L.bone]!, hw.P[1][L.bone]!] as [Vec3, Vec3]);
    landNode.set(L.node, pos);
    for (const pose of [0, 1] as const) {
      const P = bw.P[pose], delta = sub(pos[pose], endOf(bw, L.branchEnd, pose)), move = len(delta);
      if (move <= 0) continue;
      const total = bw.arc[pose][P.length - 1]!, reach = reachOf(move, total);
      easeEnd(P, bw.arc[pose], L.branchEnd, delta, reach);
      note(bw.v, L.branchEnd, L.node, pose, delta, total, reach, Math.max(pose ? mapRadiusOf(hw.v) : hw.v.radius, pose ? mapRadiusOf(bw.v) : bw.v.radius));
    }
    report.landings.push({ host: L.host, branch: L.branch, branchEnd: L.branchEnd, bone: L.bone, node: L.node });
  }
  // exactly on the node (the fade is 1 at the end, to the last bit)
  for (const [id, l] of groups) for (const { v, end } of l) for (const pose of [0, 1] as const) {
    const P = work.get(v.id)!.P[pose], L = landings.find((x) => x.branch === v.id && x.branchEnd === end);
    if (l.length < 2 && !L) continue;
    P[end ? P.length - 1 : 0] = L ? landNode.get(L.node)![pose] : nodePos.get(id)![pose];
  }
  // ---- radii: the body's own rule (taper to the shared width), the map's likewise with the map's widths
  const mapTaper = new Map<string, [number, number]>();
  for (const p of RUN_PAIRS) {
    const va = byId.get(p.a), vb = byId.get(p.b);
    if (!va || !vb) continue;
    const ra = mapRadiusOf(va), rb = mapRadiusOf(vb), m = (ra + rb) / 2;
    const ta = mapTaper.get(p.a) ?? [1, 1], tb = mapTaper.get(p.b) ?? [1, 1];
    ta[p.ea] = m / ra; tb[p.eb] = m / rb;
    mapTaper.set(p.a, ta); mapTaper.set(p.b, tb);
  }
  for (const w of work.values()) {
    const g = COURSES.get(w.v.id)!, r0 = mapRadiusOf(w.v), tp = mapTaper.get(w.v.id), rm: number[] = [];
    for (let i = 0; i < BONES_PER_EDGE; i++) rm.push(radiusAtU({ pts: w.v.pts, radius: r0, ...(tp ? { taper: tp } : {}) }, i / (BONES_PER_EDGE - 1), g.lenC));
    w.r = [bodyRadii(w.v, g.lenA, w.v.taper), rm];
  }

  // ---- frames: parallel transport in the body, carried across the run-ons so a chain of vessels is framed as one (a split host is framed whole, then cut)
  const frames = new Map<string, [Vec3, Vec3, Vec3][]>();
  const partner = new Map<string, { id: string; end: 0 | 1; at: 0 | 1 }[]>();   // edge -> run-on partners (its own end, theirs)
  for (const r of runOnAt.values()) {
    (partner.get(r.a) ?? partner.set(r.a, []).get(r.a)!).push({ id: r.b, end: r.eb, at: r.ea });
    (partner.get(r.b) ?? partner.set(r.b, []).get(r.b)!).push({ id: r.a, end: r.ea, at: r.eb });
  }
  for (const v of order) {
    if (frames.has(v.id)) continue;
    frames.set(v.id, transport(work.get(v.id)!.P[0], 0, null));
    const queue = [v.id];
    while (queue.length) {
      const cur = queue.shift()!, fr = frames.get(cur)!;
      for (const p of partner.get(cur) ?? []) {
        if (frames.has(p.id)) continue;
        frames.set(p.id, transport(work.get(p.id)!.P[0], p.end, fr[p.at ? fr.length - 1 : 0]![1]));
        queue.push(p.id);
      }
    }
  }

  // ---- split the hosts at their landings: each piece is a stretch of the host's own bones, the two pieces sharing the bone at the node
  const cuts = new Map<string, number[]>();
  for (const L of landings) { const c = cuts.get(L.host) ?? []; if (!c.includes(L.bone)) c.push(L.bone); cuts.set(L.host, c.sort((a, b) => a - b)); }
  const nodeAt = new Map<string, string>(), pieceIds = new Map<string, string[]>();   // landing bone -> node id (per host); host -> piece ids
  for (const L of landings) nodeAt.set(`${L.host}|${L.bone}`, L.node);
  const edges: SkelEdge[] = [], bones: Bone[] = [], first = new Map<string, number>(), last = new Map<string, number>();
  for (const v of order) {
    const w = work.get(v.id)!, fr = frames.get(v.id)!, hc = hiddenCounts(v.id), c = cuts.get(v.id) ?? [], marks = [0, ...c, BONES_PER_EDGE - 1], ids: string[] = [];
    for (let j = 0; j + 1 < marks.length; j++) {
      const i0 = marks[j]!, i1 = marks[j + 1]!, idx = edges.length, id = c.length ? `${v.id}#${j}` : v.id;
      ids.push(id);
      edges.push({ id, from: j ? nodeAt.get(`${v.id}|${i0}`)! : landedAt.get(keyOf(v, 0)) ?? nodeIdOf(v, 0), to: j + 2 < marks.length ? nodeAt.get(`${v.id}|${i1}`)! : landedAt.get(keyOf(v, 1)) ?? nodeIdOf(v, 1), bones: [bones.length, i1 - i0 + 1], tone: v.tone, tier: v.tier, hidden: [j === 0 ? Math.min(hc.both[0], i1 - i0) : 0, j + 2 === marks.length ? Math.min(hc.both[1], i1 - i0) : 0], hiddenBody: [j === 0 ? Math.min(hc.body[0], i1 - i0) : 0, j + 2 === marks.length ? Math.min(hc.body[1], i1 - i0) : 0] });
      for (let i = i0; i <= i1; i++) bones.push({ edge: idx, u: (i - i0) / (i1 - i0), pos: [w.P[0][i]!, w.P[1][i]!], r: [w.r[0][i]!, w.r[1][i]!], frame: fr[i]! });
      if (j === 0) first.set(v.id, idx);
      if (j + 2 === marks.length) last.set(v.id, idx);
    }
    pieceIds.set(v.id, ids);
  }
  const edgeIdx = (id: string): number => edges.findIndex((e) => e.id === id);
  const pieceAt = (v: string, end: 0 | 1): number => (end ? last : first).get(v)!;

  // ---- nodes
  const nodes: SkelNode[] = [];
  for (const [id, l] of groups) {
    const ls = l.filter(({ v, end }) => !landed.has(keyOf(v, end)));
    if (!ls.length) continue;
    const node: SkelNode = { id, pos: nodePos.get(id)!, edges: ls.map(({ v, end }) => ({ edge: pieceAt(v.id, end), end })) };
    const r = runOnAt.get(id);
    if (r) {
      const ia = node.edges.findIndex((x) => x.edge === pieceAt(r.a, r.ea) && x.end === r.ea), ib = node.edges.findIndex((x) => x.edge === pieceAt(r.b, r.eb) && x.end === r.eb);
      if (ia >= 0 && ib >= 0) node.runOn = [ia, ib];
    }
    nodes.push(node);
  }
  for (const [nid, pos] of landNode) {
    const mine = landings.filter((L) => L.node === nid), host = mine[0]!.host, ids = pieceIds.get(host)!, j = cuts.get(host)!.indexOf(mine[0]!.bone);
    const a = edgeIdx(ids[j]!), b = edgeIdx(ids[j + 1]!);
    nodes.push({ id: nid, pos, edges: [{ edge: a, end: 1 }, { edge: b, end: 0 }, ...mine.map((L) => ({ edge: pieceAt(L.branch, L.branchEnd), end: L.branchEnd }))], runOn: [0, 1] });
  }
  return { skeleton: { nodes, edges, bones }, report };
}

let cached: { skeleton: Skeleton; report: SkeletonReport } | null = null;
/** The network's skeleton (built once: it is data, and nothing changes it at run time). */
export function skeleton(): Skeleton { return (cached ??= buildSkeletonWithReport()).skeleton; }
export function skeletonReport(): SkeletonReport { return (cached ??= buildSkeletonWithReport()).report; }

/** The bones of edge `e`. */
export const bonesOf = (s: Skeleton, e: number): Bone[] => s.bones.slice(s.edges[e]!.bones[0], s.edges[e]!.bones[0] + s.edges[e]!.bones[1]);
