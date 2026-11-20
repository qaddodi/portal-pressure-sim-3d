// The blood's streams, the 2D app's own (blood.js advanceStream, copied by scripts/copy-b3-data.mjs): one stream a vessel, its speed the time-averaged
// mean velocity (the engine's flow filter, then MEAN_TAU), the display speed 9.5 * sqrt(v) 2D units a second above 0.25 cm/s, a reversal held for a breath
// and then settled, stood still and eased off the other way. The chevrons ride the stream's distance D. D, the display speed and the eased reversed flag go
// to the GPU in one 208 x 1 texture (RGBA float); nothing else is per frame.
import { DataTexture, FloatType, NearestFilter, RGBAFormat } from 'three';
import { EDGES } from '../../engine/hales/portal/topology.js';
import { STASIS_MIN_D, advanceStreamAt, createReversalHold } from './blood.copied.js';
import { flowReversed, meanVel } from '../lenses/vel-normal.copied.js';

interface Stream { vSlow?: number; vFast?: number; D: number; vd: number; hold?: number; settle?: number; sgn?: number; seed?: number; rev?: number }
interface Frame { Q: ArrayLike<number>; Qf?: ArrayLike<number>; D: ArrayLike<number> }

const NE = (EDGES as unknown[]).length;
const edges = EDGES as { id: string; kind: string; d?: number }[];
/** stage-blood.js LARGE: a vein wide enough to stagnate (its smoke). Streams use it for their stasis. */
const LARGE = edges.map((e) => (e.kind === 'vein' || e.kind === 'diode') && (e.d || 0) >= STASIS_MIN_D);
const EASE_S = 0.5;

export class Streams {
  readonly texture: DataTexture;
  private readonly data = new Float32Array(NE * 4);
  private readonly streams: Stream[] = edges.map((_, k) => ({ D: 0, vd: 0, seed: k + 1 }));
  private readonly velQf = new Float64Array(NE);
  private readonly velQ = new Float64Array(NE);
  private readonly scratch = { Q: new Float64Array(NE), D: new Float64Array(NE) };
  private readonly hold = createReversalHold(NE) as { hold: Uint8Array; step(raw: (k: number) => number, t: number, jump: boolean): boolean };
  private frame: (Frame & { t?: number; jump?: boolean }) | null = null;
  private healthy: { Q: ArrayLike<number> } | null = null;
  private fresh = true;
  private last = -1;
  private readonly opts = { phasic: false, speed: 1, large: true, still: false, rev: false, dt: 0, bt: 0 };

  constructor() {
    const t = new DataTexture(this.data, NE, 1, RGBAFormat, FloatType);
    t.minFilter = t.magFilter = NearestFilter; t.generateMipmaps = false; t.needsUpdate = true;
    this.texture = t;
  }

  setHealthy(h: { Q: ArrayLike<number> } | null): void { this.healthy = h; this.fresh = true; }
  onFrame(f: (Frame & { t?: number; jump?: boolean }) | null): void { this.frame = f; this.fresh = true; }

  /** Edge k's stream, for the chain (its time-averaged speed vSlow and its shown direction sgn). */
  stream(k: number): Stream { return this.streams[k]!; }
  /** Edge k's flow's size (the chain's weight for which inflow is the parent). */
  flowOf(k: number): number { return Math.abs(this.frame ? (this.frame.Qf ?? this.frame.Q)[k] ?? 0 : 0); }
  /** Whether any stream moved at the last step (the chain's easing runs slower while the blood is still). */
  moving = false;

  /** The shown direction and speed of edge k: 1 forward, -1 against the edge's own direction. */
  speedOf(k: number): number { return this.streams[k]!.vd; }

  /** Advances every stream to `nowMs`. Returns true while any stream moves (the scene keeps asking for frames). */
  step(nowMs: number, rate = 1): boolean {
    const f = this.frame;
    if (!f) return false;
    const dt = this.last < 0 ? 0 : Math.min(0.1, Math.max(0, (nowMs - this.last) / 1000));
    this.last = nowMs;
    if (this.fresh) {
      this.fresh = false;
      const h = this.healthy;
      this.hold.step((k) => (h && flowReversed((f.Qf ?? f.Q)[k]!, h.Q[k] ?? 0) ? 1 : 0), f.t ?? 0, !!f.jump);
      const sc = this.scratch;
      for (let k = 0; k < NE; k++) sc.D[k] = f.D[k]!;
      for (let k = 0; k < NE; k++) { sc.Q[k] = (f.Qf ?? f.Q)[k]!; this.velQf[k] = meanVel(sc, k); sc.Q[k] = f.Q[k]!; this.velQ[k] = meanVel(sc, k); }
    }
    const o = this.opts, ease = -Math.expm1(-dt / EASE_S);
    o.dt = dt; o.bt = nowMs / 1000; o.speed = rate;   // (the one eased flow rate, scene/flow-rate.ts: a pause eases the distance's advance to a stop, a play eases it back up)
    let moving = false;
    for (let k = 0; k < NE; k++) {
      const rt = this.hold.hold[k]!;
      o.large = LARGE[k]!; o.rev = !!rt;
      const sm = advanceStreamAt(this.streams[k], this.velQf, this.velQ, k, o) as Stream;
      sm.rev = sm.rev == null ? rt : sm.rev + (rt - sm.rev) * ease;
      const i = k * 4;
      this.data[i] = sm.D; this.data[i + 1] = sm.vd; this.data[i + 2] = sm.rev; this.data[i + 3] = 1;
      if ((sm.vd !== 0 && rate > 0.0005) || Math.abs(sm.rev - rt) > 0.002) moving = true;
    }
    this.texture.needsUpdate = true;
    this.moving = moving;
    return moving;
  }
}
