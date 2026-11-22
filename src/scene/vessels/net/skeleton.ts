// WP0 of the vessel-geometry plan (recs-22nov/vessel-geometry-review.md): the network as DATA. One node per junction with exactly one position per pose (the body and the Circuit's
// map), and every edge a centreline of 64 bones that starts and ends exactly on its nodes, so continuity is true by construction and no runtime code has to keep it true.
//
// The courses are read as they are (vessels/network.ts for the body, circuit/course.ts for the two poses sampled at the same 64 steps of arc length); nothing is redrawn. What this
// file adds: (1) a node's position, the radius-weighted mean of the ends that meet there (in the map the ends already agree, 2D's stations); (2) each end's last stretch eased onto
// its node, by the one fade the course code already uses for a joint (network.ts `jointFade`); (3) where two vessels carry straight on into each other (network.ts RUN_PAIRS) one shared
// tangent at the node and one shared radius (the pair rule's taper); (4) a parallel-transport frame along every edge that runs on across those joins.
//
// The skeleton is pure data: nothing here is read by the old path (the default), and nothing in the scene imports it until WP4 (`?geom=net`).
import type { Vec3 } from '../../anatomy/vessels.ts';
import { COURSES, N_TRACK } from '../../circuit/course.ts';
import { frameN } from '../../circuit/frame.ts';
import { MAP_K } from '../../circuit/map.ts';
import { circuitWidthMap } from '../../circuit/width.ts';
import { MAPPED, RUN_PAIRS, jointFade, type NetVessel } from '../network.ts';
import { radiusAtU } from '../tubes.ts';
import type { Bone, SkelEdge, SkelNode, Skeleton } from './types.ts';

/** Bones to an edge: the Circuit's N_TRACK (the 2D morph's sample count), so sample i of the body course is sample i of the map course. */
export const BONES_PER_EDGE = N_TRACK;
/** An end's easing reach: 6 times its move (a slope of one in six, under 10 degrees of lean), but at least this share of the course and at most 45 % (the two ends of a short vessel never overlap). */
export const REACH_MIN = 0.12, REACH_MAX = 0.45, REACH_PER_MOVE = 6;
/** Two courses run on into one another when their outward directions at the node are within this of opposite (network.ts `joined`: cos < -0.9, about 25 degrees). */
export const RUN_COS = -0.9;

export interface SkelEnd { edge: string; end: 0 | 1; node: string; pose: 0 | 1; /** how far the end moved onto its node (scene units) */ move: number; /** the length it eased over (scene units) */ reach: number; /** the move as a share of the whole course */ share: number }
/** What building the skeleton found: every end that had to move (to read the cost of the snap), and which run-ons carry straight on in each pose. */
export interface SkeletonReport { ends: SkelEnd[]; runOns: { node: string; a: string; b: string; opposed: [boolean, boolean] }[] }

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

/** Builds the skeleton from the drawn network (the vessels with a map course; the fans of tributaries have none and join the skeleton in WP5, with their presence). */
export function buildSkeletonWithReport(): { skeleton: Skeleton; report: SkeletonReport } {
  const work = new Map<string, Work>();
  const order: NetVessel[] = [...MAPPED];
  order.forEach((v) => {
    const g = COURSES.get(v.id)!;
    work.set(v.id, { v, P: [g.A.map((p): Vec3 => [p.x, p.y, p.z]), g.C.map((p): Vec3 => [p.x, p.y, p.z])], arc: [[], []], r: [[], []] });
  });
  for (const w of work.values()) { w.arc = [arcOf(w.P[0]), arcOf(w.P[1])]; }

  // ---- nodes: every end that meets another at one place, per network
  const ends = new Map<string, { v: NetVessel; end: 0 | 1 }[]>();
  for (const v of order) for (const end of [0, 1] as const) { const id = nodeIdOf(v, end), l = ends.get(id) ?? []; l.push({ v, end }); ends.set(id, l); }
  const weight = (v: NetVessel, pose: 0 | 1): number => (pose ? mapRadiusOf(v) : v.radius);
  const nodePos = new Map<string, [Vec3, Vec3]>();
  for (const [id, l] of ends) {
    const pos = [0, 1].map((pose): Vec3 => {
      let s: Vec3 = [0, 0, 0], tot = 0;
      for (const { v, end } of l) { const P = work.get(v.id)!.P[pose]!, wt = weight(v, pose as 0 | 1); s = add(s, scale(P[end ? P.length - 1 : 0]!, wt)); tot += wt; }
      return scale(s, 1 / tot);
    }) as [Vec3, Vec3];
    nodePos.set(id, pos);
  }

  // ---- ease each end onto its node
  const report: SkeletonReport = { ends: [], runOns: [] };
  const reachOfEnd = new Map<string, number>();
  for (const [id, l] of ends) {
    if (l.length < 2) continue;
    for (const { v, end } of l) {
      const w = work.get(v.id)!;
      for (const pose of [0, 1] as const) {
        const P = w.P[pose], at = P[end ? P.length - 1 : 0]!, delta = sub(nodePos.get(id)![pose], at), move = len(delta);
        if (move <= 0) continue;
        const total = w.arc[pose][P.length - 1]!, reach = reachOf(move, total);
        easeEnd(P, w.arc[pose], end, delta, reach);
        reachOfEnd.set(`${v.id}|${end}|${pose}`, reach);
        report.ends.push({ edge: v.id, end, node: id, pose, move, reach, share: move / total });
      }
    }
  }
  // exactly on the node (the fade is 1 at the end, to the last bit)
  for (const [id, l] of ends) for (const { v, end } of l) for (const pose of [0, 1] as const) { const P = work.get(v.id)!.P[pose]; P[end ? P.length - 1 : 0] = nodePos.get(id)![pose]; }

  // ---- run-ons: one shared direction at the node (each pose that carries straight on), one shared radius
  const byId = new Map(order.map((v) => [v.id, v]));
  const runOnAt = new Map<string, { a: string; ea: 0 | 1; b: string; eb: 0 | 1; opposed: [boolean, boolean] }>();
  for (const p of RUN_PAIRS) {
    const va = byId.get(p.a), vb = byId.get(p.b);
    if (!va || !vb) continue;
    const opposed: [boolean, boolean] = [false, false];
    for (const pose of [0, 1] as const) {
      const wa = work.get(p.a)!, wb = work.get(p.b)!;
      opposed[pose] = dot(intoOf(wa.P[pose], p.ea), intoOf(wb.P[pose], p.eb)) < RUN_COS;
    }
    const node = nodeIdOf(va, p.ea);
    report.runOns.push({ node, a: p.a, b: p.b, opposed });
    if (opposed[0] && nodeIdOf(vb, p.eb) === node && !runOnAt.has(node)) runOnAt.set(node, { ...p, opposed });
    for (const pose of [0, 1] as const) {
      if (!opposed[pose]) continue;
      const wa = work.get(p.a)!, wb = work.get(p.b)!;
      const oa = intoOf(wa.P[pose], p.ea), ob = intoOf(wb.P[pose], p.eb), m = unit(sub(oa, ob));
      const move = (w: Work, end: 0 | 1) => reachOfEnd.get(`${w.v.id}|${end}|${pose}`) ?? reachOf(0, w.arc[pose][w.P[pose].length - 1]!);
      aimEnd(wa.P[pose], wa.arc[pose], p.ea, m, move(wa, p.ea));
      aimEnd(wb.P[pose], wb.arc[pose], p.eb, scale(m, -1), move(wb, p.eb));
    }
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
    const g = COURSES.get(w.v.id)!;
    w.r = [bodyRadii(w.v, g.lenA, w.v.taper), (() => {
      const r0 = mapRadiusOf(w.v), tp = mapTaper.get(w.v.id), out: number[] = [];
      for (let i = 0; i < BONES_PER_EDGE; i++) out.push(radiusAtU({ pts: w.v.pts, radius: r0, ...(tp ? { taper: tp } : {}) }, i / (BONES_PER_EDGE - 1), g.lenC));
      return out;
    })()];
  }

  // ---- frames: parallel transport in the body, carried across the run-ons so a chain of vessels is framed as one
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
        const n0 = fr[p.at ? fr.length - 1 : 0]![1];
        frames.set(p.id, transport(work.get(p.id)!.P[0], p.end, n0));
        queue.push(p.id);
      }
    }
  }

  // ---- assemble
  const edges: SkelEdge[] = [], bones: Bone[] = [], edgeIndex = new Map<string, number>();
  order.forEach((v, e) => {
    const w = work.get(v.id)!, fr = frames.get(v.id)!;
    edgeIndex.set(v.id, e);
    edges.push({ id: v.id, from: nodeIdOf(v, 0), to: nodeIdOf(v, 1), bones: [bones.length, BONES_PER_EDGE], tone: v.tone, tier: v.tier });
    for (let i = 0; i < BONES_PER_EDGE; i++) bones.push({ edge: e, u: i / (BONES_PER_EDGE - 1), pos: [w.P[0][i]!, w.P[1][i]!], r: [w.r[0][i]!, w.r[1][i]!], frame: fr[i]! });
  });
  const nodes: SkelNode[] = [];
  for (const [id, l] of ends) {
    const node: SkelNode = { id, pos: nodePos.get(id)!, edges: l.map(({ v, end }) => ({ edge: edgeIndex.get(v.id)!, end })) };
    const r = runOnAt.get(id);
    if (r) {
      const ia = node.edges.findIndex((x) => x.edge === edgeIndex.get(r.a) && x.end === r.ea), ib = node.edges.findIndex((x) => x.edge === edgeIndex.get(r.b) && x.end === r.eb);
      if (ia >= 0 && ib >= 0) node.runOn = [ia, ib];
    }
    nodes.push(node);
  }
  return { skeleton: { nodes, edges, bones }, report };
}

let cached: { skeleton: Skeleton; report: SkeletonReport } | null = null;
/** The network's skeleton (built once: it is data, and nothing changes it at run time). */
export function skeleton(): Skeleton { return (cached ??= buildSkeletonWithReport()).skeleton; }
export function skeletonReport(): SkeletonReport { return (cached ??= buildSkeletonWithReport()).report; }

/** The bones of edge `e`. */
export const bonesOf = (s: Skeleton, e: number): Bone[] => s.bones.slice(s.edges[e]!.bones[0], s.edges[e]!.bones[0] + s.edges[e]!.bones[1]);
