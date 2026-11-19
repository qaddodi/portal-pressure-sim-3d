// Parcels carried through junctions: the 2D app's own stream chain (blood.js createStreamChain, copied by scripts/copy-b3-data.mjs), run on the same items stage-blood.js chainRows
// builds. A vessel whose blood comes on from another (its parent: the largest inflow at the node where its blood enters) draws the parent's heads, carried on at its own speed: the
// shader reads a head's place as se = A + B s along the root's stream, so a head runs out of one vessel and into the next instead of fading at each end. Each link eases its
// weight in and out, so nothing pops. One 208 x 2 float texture goes to the GPU (row 0: root + 1, A, B, weight; row 1: the weights of a link at the vessel's from and to end,
// parent + 1); nothing is made per frame once the items exist.
// What is not here is the 2D's head-run bookkeeping (stage-blood.js headRun: the lattice each row keeps while a link forms, lets go or moves, and the zoom's level swap): the
// weights' easing hides a link changing, and the spacing follows the zoom in the shader (shaders.ts chevOne).
import { DataTexture, FloatType, NearestFilter, RGBAFormat } from 'three';
import { EDGES } from '../../engine/hales/portal/topology.js';
import { createStreamChain, displaySpeed } from './blood.copied.js';
import { NETWORK_BY_ID, isArteryEdge } from '../vessels/network.ts';
import type { Streams } from './streams.ts';

interface Item { key: number; k: number; up: string; down: string; upPt: readonly [number, number]; downPt: readonly [number, number]; s0: number; sj: number; q: number; m: number }
interface Chained { par: number[]; root: number[]; A: number[]; B: number[]; w: number[]; ef: number[]; et: number[]; easing: boolean; step(items: Item[], kW: number, kB: number): Chained }

/** The cava's two stretches below the hepatic veins are one vein cut where the DIPS joins it: they keep their own pattern (stage-blood.js NO_CHAIN). */
export const NO_CHAIN: ReadonlySet<string> = new Set(['IVC_IS', 'IVC_IS_1', 'IVCS_RA']);

interface EdgeInfo { id: string; from: string; to: string; path: readonly (readonly [number, number])[]; len: number }
const edges = EDGES as { id: string; from: string; to: string; kind: string; shunt?: string }[];
const NE = edges.length;

/** Each chainable vessel's 2D course (the figure's own units: the chain's ends sit within CHAIN_NEAR of one another there) and its length. Arteries and the NO_CHAIN veins carry none. */
export const INFO: readonly (EdgeInfo | null)[] = edges.map((e) => {
  const v = NETWORK_BY_ID.get(e.id);
  if (!v || v.feeder || isArteryEdge(e as never) || NO_CHAIN.has(e.id) || v.plan?.kind !== 'coil') return null;
  const path = v.plan.base;
  let len = 0;
  for (let i = 1; i < path.length; i++) len += Math.hypot(path[i]![0] - path[i - 1]![0], path[i]![1] - path[i - 1]![1]);
  return len > 0 ? { id: e.id, from: e.from, to: e.to, path, len } : null;
});

export class StreamChain {
  readonly texture: DataTexture;
  private readonly data = new Float32Array(NE * 8);
  private readonly chain = createStreamChain() as unknown as Chained;
  private readonly items: Item[] = [];
  private last: Chained | null = null;
  private lastNow = -1;

  constructor() {
    const t = new DataTexture(this.data, NE, 2, RGBAFormat, FloatType);
    t.minFilter = t.magFilter = NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
    this.texture = t;
  }

  /** The weight of the link that carries edge k's blood on from its parent now (0: none), for tests and the checks. */
  weightOf(k: number): number { return this.data[k * 4 + 3]!; }
  parentOf(k: number): number { return this.data[NE * 4 + k * 4 + 2]! - 1; }

  /** Works the links out for this frame. `drawn(id)`: the vessel is drawn and carries blood. Returns true while a link is still easing (the figure is kept awake). */
  step(nowMs: number, streams: Streams, drawn: (id: string) => boolean): boolean {
    const dt = this.lastNow < 0 ? 0 : Math.min(0.1, Math.max(0, (nowMs - this.lastNow) / 1000));
    this.lastNow = nowMs;
    const items = this.items;
    let n = 0, changed = !this.last || this.last.easing, moving = false;
    for (let k = 0; k < NE; k++) {
      const inf = INFO[k];
      if (!inf || !drawn(inf.id)) continue;
      const sm = streams.stream(k), sg = sm.sgn || 1, fwd = sg > 0;
      const m = displaySpeed(sg * Math.max(0, sg * (sm.vSlow ?? 0)));
      if (!m) continue;
      let it = items[n];
      if (!it) { it = items[n] = { key: k, k, up: '', down: '', upPt: inf.path[0]!, downPt: inf.path[0]!, s0: 0, sj: 0, q: 0, m: 0 }; changed = true; }
      const P = inf.path, upPt = fwd ? P[0]! : P[P.length - 1]!, downPt = fwd ? P[P.length - 1]! : P[0]!;
      const up = fwd ? inf.from : inf.to, down = fwd ? inf.to : inf.from, s0 = fwd ? 0 : inf.len, sj = fwd ? inf.len : 0, q = streams.flowOf(k);
      if (it.key !== k || it.up !== up || it.down !== down || it.upPt !== upPt || it.downPt !== downPt || it.s0 !== s0 || it.sj !== sj || it.q !== q || it.m !== m) changed = true;
      it.key = k; it.k = k; it.up = up; it.down = down; it.upPt = upPt; it.downPt = downPt; it.s0 = s0; it.sj = sj; it.q = q; it.m = m;
      n++;
    }
    if (items.length !== n) { items.length = n; changed = true; }
    const moves = streams.moving;
    const c = changed ? (this.last = this.chain.step(items, 1 - Math.exp(-dt / (moves ? 0.25 : 0.08)), 1 - Math.exp(-dt / (moves ? 1 : 0.12)))) : this.last!;
    if (changed || c.easing) {
      const d = this.data;
      d.fill(0);
      for (let i = 0; i < n; i++) {
        const k = items[i]!.key, w = c.w[i]!, ef = c.ef[i]!, et = c.et[i]!;
        const o = k * 4, o2 = NE * 4 + k * 4;
        if (w > 0) { d[o] = c.root[i]! + 1; d[o + 1] = c.A[i]!; d[o + 2] = c.B[i]!; d[o + 3] = w; d[o2 + 2] = c.par[i]! + 1; }
        d[o2] = ef; d[o2 + 1] = et;
      }
      this.texture.needsUpdate = true;
    }
    if (c.easing) moving = true;
    return moving;
  }
}
