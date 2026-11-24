// How smooth the anatomy is, measured the same way for every vessel, join and organ (Mohammad, 24 Nov 2026: "make sure all the joins are smooth and all blood vessels run organically
// smoothly obviously, and organs look smooth"). Pure geometry on what is drawn: vessels on their drawn centrelines (vessels/centreline.ts), joins where vessels run on into one another
// (network.ts RUN_ONS), organs on their finished meshes. tests/anatomy-smooth.test.ts holds every number under its ceiling.
import { MAPPED, RUN_ONS } from '../../src/scene/vessels/network.ts';
import { centrelineOf } from '../../src/scene/vessels/centreline.ts';
import type { BufferGeometry } from 'three';

type V = [number, number, number];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const len = (a: V) => Math.hypot(a[0], a[1], a[2]);
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const ang = (a: V, b: V) => { const l = len(a) * len(b); return l < 1e-12 ? 0 : (Math.acos(Math.max(-1, Math.min(1, dot(a, b) / l))) * 180) / Math.PI; };

/** The arc step the vessels are judged on: 0.01 scene units (about 2.4 mm), finer than any drawn bend. */
export const STEP = 0.01;

export interface VesselSmooth { id: string; length: number; /** the sharpest turn over one step, degrees */ turn: number; /** the biggest change of turn between neighbouring steps, degrees (a bend that starts abruptly) */ jerk: number; /** the biggest change of radius over one step, as a share of the radius */ widen: number }

export function vesselSmoothness(): VesselSmooth[] {
  const out: VesselSmooth[] = [];
  for (const v of MAPPED) {
    const c = centrelineOf(v.id);
    if (!c || c.length < 4 * STEP) continue;
    const n = Math.max(4, Math.ceil(c.length / STEP));
    const P = Array.from({ length: n + 1 }, (_, i) => c.pointAt(i / n) as V);
    const R = Array.from({ length: n + 1 }, (_, i) => c.radiusAt(i / n));
    const T: number[] = [];
    for (let i = 1; i < n; i++) T.push(ang(sub(P[i]!, P[i - 1]!), sub(P[i + 1]!, P[i]!)));
    let jerk = 0, widen = 0;
    for (let i = 1; i < T.length; i++) jerk = Math.max(jerk, Math.abs(T[i]! - T[i - 1]!));
    for (let i = 1; i <= n; i++) widen = Math.max(widen, Math.abs(R[i]! - R[i - 1]!) / Math.max(1e-6, Math.min(R[i]!, R[i - 1]!)));
    out.push({ id: v.id, length: c.length, turn: Math.max(0, ...T), jerk, widen });
  }
  return out;
}

export interface JoinSmooth { a: string; b: string; /** the gap between the two ends, scene units */ gap: number; /** the angle between their headings, degrees */ turn: number; /** the radius step, as a share */ step: number;
  /** over a window of WINDOW either side of the join, on the joined path: the sharpest turn per step, the biggest change of turn, and the biggest change of radius per step (a share): the join judged by the vessel bar, so a size jump with no taper fails (Mohammad, 24 Nov: "a big step change in size from small to large, without smooth transition") */
  wturn: number; wjerk: number; widen: number }

/** How far either side of a join it is judged as one path: 0.1 scene units (about 2.4 cm). */
export const WINDOW = 0.1;

export function joinSmoothness(): JoinSmooth[] {
  const out: JoinSmooth[] = [];
  for (const r of RUN_ONS) {
    const a = centrelineOf(r.a), b = centrelineOf(r.b);
    if (!a || !b) continue;
    const ua = r.ia, ub = r.ib;
    const pa = a.pointAt(ua) as V, pb = b.pointAt(ub) as V;
    // headings pointing out of each end: at the end the flow leaves, along the tangent; at the start, against it
    const ta = a.tangentAt(ua) as V, tb = b.tangentAt(ub) as V;
    const outA: V = ua === 1 ? ta : [-ta[0], -ta[1], -ta[2]], outB: V = ub === 1 ? tb : [-tb[0], -tb[1], -tb[2]];
    const ra = a.radiusAt(ua), rb = b.radiusAt(ub);
    // the joined path: a's last WINDOW walked toward the join, then b's first WINDOW walked away from it
    const side = (c: NonNullable<ReturnType<typeof centrelineOf>>, u: 0 | 1, into: boolean) => {
      const w = Math.min(WINDOW, c.length) / c.length, n = Math.max(2, Math.ceil(Math.min(WINDOW, c.length) / STEP));
      const us = Array.from({ length: n + 1 }, (_, i) => (u === 1 ? 1 - w + (w * i) / n : w - (w * i) / n));
      const pts = (into ? us : us.slice().reverse()).map((x) => ({ p: c.pointAt(x) as V, r: c.radiusAt(x) }));
      return pts;
    };
    const path = [...side(a, ua, true), ...side(b, ub, false).slice(1)];
    const T: number[] = [];
    for (let i = 1; i < path.length - 1; i++) T.push(ang(sub(path[i]!.p, path[i - 1]!.p), sub(path[i + 1]!.p, path[i]!.p)));
    let wjerk = 0, widen = 0;
    for (let i = 1; i < T.length; i++) wjerk = Math.max(wjerk, Math.abs(T[i]! - T[i - 1]!));
    for (let i = 1; i < path.length; i++) { const r0 = path[i - 1]!.r, r1 = path[i]!.r; widen = Math.max(widen, Math.abs(r1 - r0) / Math.max(1e-6, Math.min(r0, r1))); }
    out.push({ a: r.a, b: r.b, gap: len(sub(pa, pb)), turn: 180 - ang(outA, outB), step: Math.abs(ra - rb) / Math.max(1e-6, Math.min(ra, rb)), wturn: Math.max(0, ...T), wjerk, widen });
  }
  return out;
}

export interface OrganSmooth { id: string; /** the sharpest fold between neighbouring triangles of the shading normals, degrees (a crease or a facet) */ crease: number; /** the 99.9th percentile of it */ p999: number }

/** Folds between neighbouring vertices' shading normals along every edge of the mesh (the normal the picture is shaded by: what a person sees as a crease). */
export function organSmoothness(id: string, g: BufferGeometry, normal = 'normal'): OrganSmooth {
  const N = g.getAttribute(normal), I = g.getIndex();
  const folds: number[] = [];
  const nv = (i: number): V => [N.getX(i), N.getY(i), N.getZ(i)];
  const tri = I ? (k: number) => I.getX(k) : (k: number) => k;
  const count = I ? I.count : N.count;
  for (let k = 0; k < count; k += 3) {
    const a = tri(k), b = tri(k + 1), c = tri(k + 2);
    folds.push(ang(nv(a), nv(b)), ang(nv(b), nv(c)), ang(nv(c), nv(a)));
  }
  folds.sort((x, y) => x - y);
  return { id, crease: folds[folds.length - 1] ?? 0, p999: folds[Math.floor(folds.length * 0.999)] ?? 0 };
}

/** Where one organ's surface hands over to another's (the stomach to the duodenum's funnel at its cut): every vertex of `a` that `from` picks, against the nearest vertex of `b`, the fold between their shading normals,
 *  as a crease (so it is held to the organs' bar), and the largest distance from such a vertex to `b` (a hole in the hand-off would show as a gap). */
export function handoffSmoothness(id: string, a: BufferGeometry, from: (i: number) => boolean, b: BufferGeometry, normal = 'shadeN'): OrganSmooth & { gap: number; n: number } {
  const PA = a.getAttribute('position'), NA = a.getAttribute(normal), PB = b.getAttribute('position'), NB = b.getAttribute(normal);
  const folds: number[] = []; let gap = 0;
  for (let i = 0; i < PA.count; i++) {
    if (!from(i)) continue;
    let bj = -1, bd = Infinity;
    for (let j = 0; j < PB.count; j++) { const d = Math.hypot(PB.getX(j) - PA.getX(i), PB.getY(j) - PA.getY(i), PB.getZ(j) - PA.getZ(i)); if (d < bd) { bd = d; bj = j; } }
    gap = Math.max(gap, bd);
    folds.push(ang([NA.getX(i), NA.getY(i), NA.getZ(i)], [NB.getX(bj), NB.getY(bj), NB.getZ(bj)]));
  }
  folds.sort((x, y) => x - y);
  return { id, crease: folds[folds.length - 1] ?? 0, p999: folds[Math.floor(folds.length * 0.999)] ?? 0, gap, n: folds.length };
}

/** The largest step of a per-vertex fade (`esoA`, the rectum's) between two vertices of one triangle: a fade that pops shows as a big step. */
export function fadeStep(g: BufferGeometry, attr = 'esoA'): number {
  const A = g.getAttribute(attr), I = g.getIndex()!; let worst = 0;
  for (let k = 0; k < I.count; k += 3) { const a = A.getX(I.getX(k)), b = A.getX(I.getX(k + 1)), c = A.getX(I.getX(k + 2)); worst = Math.max(worst, Math.abs(a - b), Math.abs(b - c), Math.abs(c - a)); }
  return worst;
}

/** The bar every vessel, join and organ is held to (set 24 Nov 2026 from today's smoothest pieces: the portal trunk, the cava, the splenic vein, the liver, the spleen and the kidney all pass it). */
export const BAR = {
  vessel: { turn: 12, jerk: 8, widen: 0.06 },
  join: { gap: 0.002, turn: 5, step: 0.06, wturn: 12, wjerk: 8, widen: 0.06 },
  organ: { crease: 25 },
} as const;

/** What is rougher than the bar today, by how much at most (tests/anatomy/smooth-allow.json). Like the lint allowances it only goes down: a piece that now passes the bar comes off the list. */
export type SmoothAllow = { vessel: Record<string, Partial<Record<'turn' | 'jerk' | 'widen', number>>>; join: Record<string, Partial<Record<'gap' | 'turn' | 'step' | 'wturn' | 'wjerk' | 'widen', number>>>; organ: Record<string, { crease: number }> };

/** Every number over the bar: [kind, name, measure, value]. */
export function overBar(v: VesselSmooth[], j: JoinSmooth[], o: OrganSmooth[]): [keyof SmoothAllow, string, string, number][] {
  const out: [keyof SmoothAllow, string, string, number][] = [];
  for (const x of v) for (const k of ['turn', 'jerk', 'widen'] as const) if (x[k] > BAR.vessel[k]) out.push(['vessel', x.id, k, x[k]]);
  for (const x of j) for (const k of ['gap', 'turn', 'step', 'wturn', 'wjerk', 'widen'] as const) if (x[k] > BAR.join[k]) out.push(['join', `${x.a}>${x.b}`, k, x[k]]);
  for (const x of o) if (x.crease > BAR.organ.crease) out.push(['organ', x.id, 'crease', x.crease]);
  return out;
}
