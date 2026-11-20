// REAL FLOW THROUGH JUNCTIONS (Mohammad, 20 Nov: "the streaks still break between vessels, they don't flow"; "it has to be real, not like chevrons"). Every particle of the dust keeps ONE identity through the
// whole network: its SOURCE (the vessel it came in by, the "root"), its place in the root's cross-section (its lane), and its distance along the root's stream. Each vessel maps its own lanes and arc onto those, so the
// same particle is drawn in the next vessel at the very place it left the last one; nothing restarts at a joint.
//
//   lanes        y in -1 .. 1 across a vessel, to the LEFT of its course (the 2D figure's own course, start to end; in 3D the figure's normal z crossed into the tangent: dust-glsl.ts dustFrame). At each node the arms are taken
//                in turn round the node (by angle) and the flow's stream function psi is laid along them: rising over the inflows, falling over the outflows. A level of psi is one streamline, so a branch takes the lanes of its
//                parent whose share of the flow is its own (the dividing streamline of a fork), and a merge stacks its inflows side by side by flow (the splenic blood on one side of the portal vein: portal streaming).
//   segments     a vessel's lanes come from up to SEG_MAX roots: each segment is a range [y0, y1) of its own lanes, the root it carries, the affine map to the root's lanes (yRoot = c0 + c1 y) and the root's arc
//                se = A + B s (B the root's display speed over this vessel's, the chevrons' own chain rule, blood/chain.ts).
//   turns        the swirl (a stenosis's, a fast vessel's) twists a particle round the axis a WHOLE number of turns over a vessel (dust-glsl.ts), so at every joint it is back where its lane says: the twist can never
//                carry a particle across a branch's dividing line. The count eases (TURN_EASE_S), so a stenosis coming on winds the twist up, never in one step.
//   easing       when the layout's structure changes (a reversal, a vessel starting or stopping, a link made or let go) the new table fades in over FADE_S while the old one fades out (two sets in the texture); while the
//                structure holds, the lanes and arcs glide with the flows. Nothing pops.
// One NE x ROWS float texture goes to the GPU. Nothing is made per frame once the items exist.
import { DataTexture, FloatType, NearestFilter, RGBAFormat } from 'three';
import { EDGES } from '../../engine/hales/portal/topology.js';
import { displaySpeed } from './blood.copied.js';
import { INFO } from './chain.ts';
import { NETWORK_BY_ID as NET } from '../vessels/network.ts';
import { NETWORK_BY_ID } from '../vessels/network.ts';
import type { Streams } from './streams.ts';
import { STREAK } from './streak-glsl.ts';
import { DUST_UNIFORMS } from './dust-spec.ts';
import { UNITS_PER_SCENE } from '../frame2d.ts';

export const SEG_MAX = 6;
/** A segment narrower than this (of the -1 .. 1 lane span) is dropped and its neighbours take its lanes. */
export const SEG_MIN = 0.02;
/** A root's arc runs in a vessel at B (the root's speed over the vessel's); past these bounds the lattice would crowd or thin too far, so that share of the vessel carries its own particles instead. */
export const B_MIN = 1 / 8, B_MAX = 8;
/** The new layout fades in over this long when its structure changes (seconds). */
export const FADE_S = 0.6;
/** The swirl's turn count eases at this rate (turns a second). */
export const TURN_RATE = 1.2;
/** Rows of the texture: 0 (nCur, mix, nPrev, turns), then SEG_MAX segments of 2 texels for the current set, then the same for the previous one. */
export const ROWS = 1 + 4 * SEG_MAX;

const edges = EDGES as { id: string; from: string; to: string; kind: string }[];
const NE = edges.length;
const RADIUS: readonly number[] = edges.map((e) => NETWORK_BY_ID.get(e.id)?.radius ?? 0);
/** EVERY vessel with a course carries its particles on (Mohammad, 20 Nov: "can we do everywhere please"): the veins the chevrons' chain leaves out (the cava's stretches cut where the DIPS joins it, NO_CHAIN) and the
 *  arteries too. Only a feeder (a decorative tributary with no flow of its own) keeps its own particles. */
export const ROUTE_INFO: readonly ({ id: string; from: string; to: string; path: readonly (readonly [number, number])[]; len: number } | null)[] = edges.map((e, k) => {
  if (INFO[k]) return INFO[k]!;
  const v = NET.get(e.id);
  if (!v || v.feeder || v.plan?.kind !== 'coil') return null;
  const path = v.plan.base;
  let len = 0;
  for (let i = 1; i < path.length; i++) len += Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]);
  return len > 0 ? { id: e.id, from: e.from, to: e.to, path, len } : null;
});
const BASE_D: readonly number[] = edges.map((e) => NETWORK_BY_ID.get(e.id)?.baseD ?? 0);
const U_IX = (n: string): number => (DUST_UNIFORMS as readonly string[]).indexOf(n);
const IX_SWIRL = U_IX('swirl'), IX_TURB = U_IX('turb'), IX_PITCH = U_IX('pitch');

/** The swirl's whole turns each vessel should carry now (the shader's Hc from its narrowing and speed, over its length in helix pitches): `dust` the dust's uniform values (dust.ts). */
export function turnTargets(streams: Streams, dust: ArrayLike<number>, out: Float32Array): Float32Array {
  const swirl = dust[IX_SWIRL] ?? 0, turb = dust[IX_TURB] ?? 0, pitch = dust[IX_PITCH] ?? 1;
  for (let k = 0; k < NE; k++) {
    const inf = ROUTE_INFO[k], d = streams.diamOf(k), bd = BASE_D[k]!;
    const nar = d > 0 && bd > 0 ? d / bd : 1;
    const Hc = swirlHc(nar, streams.speedOf(k), swirl, turb, STREAK.T_STENOSIS, STREAK.T_FLOW);
    const rFig = RADIUS[k]! * UNITS_PER_SCENE, len = inf?.len ?? 0;
    out[k] = len > 0 ? turnsFor(Hc, len, pitch * rFig) : 0;
  }
  return out;
}

export interface Seg { y0: number; y1: number; root: number; c0: number; c1: number; A: number; B: number }
/** One vessel as the builder sees it: its 2D course (start to end), its ends' nodes, whether it carries blood now, which way (fwd: start to end), its display speed (signed with the flow) and its flow. */
export interface RouteEdge { k: number; from: string; to: string; path: readonly (readonly [number, number])[]; len: number; fwd: boolean; m: number; q: number }

const own = (k: number): Seg[] => [{ y0: -1, y1: 1, root: k, c0: 0, c1: 1, A: 0, B: 1 }];

/** The unit direction leaving `node` along the course (outward from the node), in the 2D figure's units. */
function outward(e: RouteEdge, atStart: boolean): [number, number] {
  const P = e.path, n = P.length, j = Math.min(4, n - 1);
  const a = atStart ? P[0]! : P[n - 1]!, b = atStart ? P[j]! : P[n - 1 - j]!;
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
}

interface Arm { e: RouteEdge; atStart: boolean; inflow: boolean; ang: number; q: number; /** psi at the arm's right edge (y_out -1) and its slope over y_out (+q/2 an inflow, -q/2 an outflow, scaled) */ ps: number; dp: number }

/** The arms at every node, with psi laid round the node (see the header). */
export function nodeArms(list: readonly RouteEdge[]): Map<string, Arm[]> {
  const at = new Map<string, Arm[]>();
  for (const e of list) {
    if (!(e.q > 0) || !e.m) continue;
    for (const atStart of [true, false]) {
      const node = atStart ? e.from : e.to;
      const d = outward(e, atStart);
      // blood enters the node from this arm when it runs toward the node: forward and this is the end, or backward and this is the start
      const inflow = atStart ? !e.fwd : e.fwd;
      const a: Arm = { e, atStart, inflow, ang: Math.atan2(d[1], d[0]), q: e.q, ps: 0, dp: 0 };
      (at.get(node) ?? at.set(node, []).get(node)!).push(a);
    }
  }
  for (const arms of at.values()) {
    arms.sort((a, b) => a.ang - b.ang);
    const n = arms.length;
    // start the walk at an inflow that follows an outflow (going round by angle), so the inflows come as one block where the geometry allows it (the interleaved case keeps its order: rare, and it still conserves)
    let s = arms.findIndex((a, i) => a.inflow && !arms[(i - 1 + n) % n]!.inflow);
    if (s < 0) s = Math.max(0, arms.findIndex((a) => a.inflow));
    const ord = arms.slice(s).concat(arms.slice(0, s));
    const ins = ord.filter((a) => a.inflow), outs = ord.filter((a) => !a.inflow);
    const qIn = ins.reduce((t, a) => t + a.q, 0), qOut = outs.reduce((t, a) => t + a.q, 0);
    const sc = qOut > 0 ? qIn / qOut : 1;
    let psi = 0;
    for (const a of ins) { a.ps = psi; a.dp = a.q / 2; psi += a.q; }
    for (const a of outs) { a.ps = psi; a.dp = -sc * a.q / 2; psi -= sc * a.q; }
  }
  return at;
}

/** psi at the arm's lane y (the vessel's own lanes: left of its course). Leaving the node along the course (its start) the arm's left is the vessel's left; at its end, its right. */
const yOut = (a: Arm, y: number): number => (a.atStart ? y : -y);
const psiAt = (a: Arm, y: number): number => a.ps + a.dp * (yOut(a, y) + 1);
/** The vessel's lane y where the arm's psi is `p` (the inverse). */
const yAt = (a: Arm, p: number): number => { const yo = (p - a.ps) / a.dp - 1; return a.atStart ? yo : -yo; };

/** The segments of every vessel: whose particles each range of its lanes carries, and where. Pure: the scene's wrapper (StreamRoutes) and the tests call it. */
export function buildRoutes(list: readonly RouteEdge[], dropped?: Set<number>): Map<number, Seg[]> {
  const byK = new Map(list.map((e) => [e.k, e]));
  const arms = nodeArms(list);
  const out = new Map<number, Seg[]>();
  const busy = new Set<number>();
  const go = (k: number): Seg[] => {
    const done = out.get(k);
    if (done) return done;
    const e = byK.get(k)!;
    if (busy.has(k) || !(e.q > 0) || !e.m) { const o = own(k); if (!busy.has(k)) out.set(k, o); return o; }   // (a loop back on itself carries its own particles)
    busy.add(k);
    const node = e.fwd ? e.from : e.to;
    const here = arms.get(node) ?? [];
    const me = here.find((a) => a.e === e && a.atStart === e.fwd)!;
    const parents = here.filter((a) => a.inflow);
    const segs: Seg[] = [];
    if (me && parents.length) {
      // my lanes run from psi(-1) to psi(1) (falling: an outflow); each parent covers its own psi interval
      const pA = psiAt(me, -1), pB = psiAt(me, 1), lo = Math.min(pA, pB), hi = Math.max(pA, pB);
      for (const pa of parents) {
        const qa = pa.ps, qb = pa.ps + 2 * pa.dp, plo = Math.max(lo, Math.min(qa, qb)), phi = Math.min(hi, Math.max(qa, qb));
        if (!(phi > plo)) continue;
        const pe = pa.e;
        const s0 = e.fwd ? 0 : e.len, sj = pe.fwd ? pe.len : 0;   // my arc where the blood comes in, the parent's where it leaves
        // my lane y maps to the parent's lane linearly: y_p = al + be y (both through psi)
        const yp0 = yAt(pa, psiAt(me, -1)), yp1 = yAt(pa, psiAt(me, 1)), al = 0.5 * (yp0 + yp1), be = 0.5 * (yp1 - yp0);
        const ylo = Math.min(yAt(me, plo), yAt(me, phi)), yhi = Math.max(yAt(me, plo), yAt(me, phi));
        if (busy.has(pe.k)) dropped?.add(k);   // (a loop in the flow: no real pressure field makes one; the parent's own particles stand in)
        for (const ps of go(pe.k)) {
          // the parent's segment [ps.y0, ps.y1) in my lanes
          const ya = (ps.y0 - al) / be, yb = (ps.y1 - al) / be;
          const y0 = Math.max(ylo, Math.min(ya, yb)), y1 = Math.min(yhi, Math.max(ya, yb));
          if (!(y1 > y0)) continue;
          const B = ps.B * pe.m / e.m;
          if (!(Math.abs(B) >= B_MIN && Math.abs(B) <= B_MAX) || ps.root === k) { segs.push({ y0, y1, root: k, c0: 0, c1: 1, A: 0, B: 1 }); continue; }
          segs.push({ y0, y1, root: ps.root, c0: ps.c0 + ps.c1 * al, c1: ps.c1 * be, A: ps.A + ps.B * sj - B * s0, B });
        }
      }
    }
    busy.delete(k);
    const res = tidy(segs, k, dropped);
    out.set(k, res);
    return res;
  };
  for (const e of list) go(e.k);
  return out;
}

/** Sorted, joined where two neighbours carry the same root by the same map, the slivers dropped, at most SEG_MAX, and the lanes covered from -1 to 1 with no gap (a neighbour takes a dropped range: its map simply runs on). */
export function tidy(segs: Seg[], k: number, dropped?: Set<number>): Seg[] {
  if (!segs.length) return own(k);
  let s = segs.slice().sort((a, b) => a.y0 - b.y0);
  const same = (a: Seg, b: Seg): boolean => a.root === b.root && Math.abs(a.c0 - b.c0) < 1e-6 && Math.abs(a.c1 - b.c1) < 1e-6 && Math.abs(a.A - b.A) < 1e-4 && Math.abs(a.B - b.B) < 1e-6;
  const joined: Seg[] = [];
  for (const g of s) { const p = joined[joined.length - 1]; if (p && same(p, g)) p.y1 = Math.max(p.y1, g.y1); else joined.push({ ...g }); }
  s = joined.filter((g) => g.y1 - g.y0 >= SEG_MIN);
  if (s.length !== joined.length || s.length > SEG_MAX) dropped?.add(k);   // (a lane given to a neighbour: its particles there are the neighbour's, not the ones upstream; rare, and the tests count it)
  if (!s.length) s = [joined.reduce((a, b) => (b.y1 - b.y0 > a.y1 - a.y0 ? b : a))];
  while (s.length > SEG_MAX) {
    let w = 0;
    for (let i = 1; i < s.length; i++) if (s[i]!.y1 - s[i]!.y0 < s[w]!.y1 - s[w]!.y0) w = i;
    s.splice(w, 1);
  }
  // no gaps: each boundary at the middle of any gap, the outer ends at -1 and 1
  s[0]!.y0 = -1; s[s.length - 1]!.y1 = 1;
  for (let i = 1; i < s.length; i++) { const m = 0.5 * (s[i - 1]!.y1 + s[i]!.y0); s[i - 1]!.y1 = m; s[i]!.y0 = m; }
  return s;
}

/** The signature of a layout's STRUCTURE (which roots, in which order): while it holds the numbers glide; when it changes the new table fades in. */
export const structure = (s: readonly Seg[]): string => s.map((g) => `${g.root}${g.B < 0 ? '-' : '+'}`).join(',');

/** The swirl's turn count over a vessel (dust-glsl.ts: the twist is a whole number of turns, back to its lane at each end): its strength Hc (0 .. 1) times its length over the helix's pitch, held to a whole number, at least one turn
 *  where the swirl is meant to show at all. The JS twin of the shader's Hc (dust-glsl.ts dustHc). */
export function turnsFor(Hc: number, lenFig: number, pitchFig: number): number {
  const t = Hc * lenFig / Math.max(pitchFig, 1e-3);
  return t < 0.3 ? 0 : Math.max(1, Math.round(t));
}
const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** The shader's swirl strength (dust-glsl.ts): a narrowed vessel, a fast one. `nar` its diameter against its healthy one, `vd` its display speed, `swirl` and `turb` the dust's settings. */
export const swirlHc = (nar: number, vd: number, swirl: number, turb: number, tSten: number, tFlow: number): number =>
  Math.min(1, swirl * turb * Math.min(1, Math.max(0, tSten * (1 - smooth(0.5, 0.85, nar)) + tFlow * smooth(25, 45, Math.abs(vd)))));

/** The scene's side: builds the list from the streams each frame, keeps the last table and the one fading out, and writes the texture. */
export class StreamRoutes {
  readonly texture: DataTexture;
  private readonly data = new Float32Array(NE * ROWS * 4);
  private cur = new Map<number, Seg[]>();
  private prev = new Map<number, Seg[]>();
  private readonly mix = new Float32Array(NE).fill(1);
  private readonly turns = new Float32Array(NE);
  private readonly sig: string[] = new Array(NE).fill('');
  private lastNow = -1;

  constructor() {
    const t = new DataTexture(this.data, NE, ROWS, RGBAFormat, FloatType);
    t.minFilter = t.magFilter = NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
    this.texture = t;
    for (let k = 0; k < NE; k++) this.put(k, own(k), 0, 1);
  }

  segsOf(k: number): readonly Seg[] { return this.cur.get(k) ?? own(k); }
  mixOf(k: number): number { return this.mix[k]!; }
  turnsOf(k: number): number { return this.turns[k]!; }

  /** `drawn(id)`: the vessel is drawn and carries blood. `turnTarget(k)`: the swirl's whole turns this vessel should carry now. Returns true while anything is still easing. */
  step(nowMs: number, streams: Streams, drawn: (id: string) => boolean, turnTarget: ArrayLike<number>): boolean {
    const dt = this.lastNow < 0 ? 1 : Math.min(0.1, Math.max(0, (nowMs - this.lastNow) / 1000));
    this.lastNow = nowMs;
    const list: RouteEdge[] = [];
    for (let k = 0; k < NE; k++) {
      const inf = ROUTE_INFO[k];
      if (!inf || !drawn(inf.id)) continue;
      const sm = streams.stream(k), sg = sm.sgn || 1;
      const m = displaySpeed(sg * Math.max(0, sg * (sm.vSlow ?? 0))) as number;
      if (!m) continue;
      list.push({ k, from: inf.from, to: inf.to, path: inf.path, len: inf.len, fwd: sg > 0, m, q: streams.flowOf(k) });
    }
    const next = buildRoutes(list);
    let easing = false;
    for (let k = 0; k < NE; k++) {
      const segs = next.get(k) ?? own(k), sg = structure(segs);
      if (sg !== this.sig[k]) {
        // a new structure: what showed (or, mid-fade, the set that was most of it) fades out while this fades in
        if (this.sig[k]) this.prev.set(k, this.mix[k]! >= 0.5 ? (this.cur.get(k) ?? own(k)) : (this.prev.get(k) ?? own(k)));
        this.mix[k] = this.sig[k] ? 0 : 1;
        this.sig[k] = sg;
      }
      this.cur.set(k, segs);
      if (this.mix[k]! < 1) { this.mix[k] = Math.min(1, this.mix[k]! + dt / FADE_S); easing = true; }
      const tt = turnTarget[k] ?? 0, tn = this.turns[k]!;
      if (tt !== tn) { const st = TURN_RATE * dt; this.turns[k] = Math.abs(tt - tn) <= st ? tt : tn + Math.sign(tt - tn) * st; easing = true; }
      this.put(k, segs, this.turns[k]!, this.mix[k]!);
    }
    this.texture.needsUpdate = true;
    return easing;
  }

  private put(k: number, segs: readonly Seg[], turns: number, mix: number): void {
    const d = this.data, row = (r: number): number => (r * NE + k) * 4;
    const prev = this.prev.get(k) ?? own(k);
    let o = row(0);
    d[o] = segs.length; d[o + 1] = mix; d[o + 2] = mix < 1 ? prev.length : 0; d[o + 3] = turns;
    const write = (set: readonly Seg[], base: number): void => {
      for (let i = 0; i < SEG_MAX; i++) {
        const g = set[i];
        o = row(base + 2 * i);
        if (!g) { d[o] = d[o + 1] = d[o + 2] = d[o + 3] = 0; o = row(base + 2 * i + 1); d[o] = d[o + 1] = d[o + 2] = d[o + 3] = 0; continue; }
        d[o] = g.y0; d[o + 1] = g.y1; d[o + 2] = g.root + 1; d[o + 3] = g.c0;
        o = row(base + 2 * i + 1);
        d[o] = g.c1; d[o + 1] = g.A; d[o + 2] = g.B; d[o + 3] = RADIUS[g.root] ?? 0;
      }
    };
    write(segs, 1);
    write(prev, 1 + 2 * SEG_MAX);
  }
}
