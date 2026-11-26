// How the scope's field moves between states (2D instruments.js createEndoscopy draw()): the size, presence and stigmata follow the model's running mean continuously (SIZE_TAU_MS), a banded
// column deflates at once and its knuckle and band cinch in a beat later (DEFLATE_TAU_MS, BAND_TAU_MS, BAND_DELAY_MS), the balloon and the bleed ease in and out. Pure and on the display clock
// (dt in ms), so a paused model still finishes an ease. Nothing is drawn here.
import { endoGrow, airRatio, airFlat } from '../copied/endo-size.copied.js';
import { SIZE_TAU_MS, DEFLATE_TAU_MS, BAND_TAU_MS, BAND_DELAY_MS, glide } from '../copied/endo-motion.copied.js';
import { varixMean } from '../../../scene/disease/copied/varix-look.js';
import { poolFill } from '../copied/blood-slice.copied.js';
import type { FieldState } from './field.ts';
import { bandsPlaced } from '../../action/bands-on.ts';

const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** What the model says (a frame's varix, the bands, the options a slide may give). */
export interface ScopeIn {
  /** metrics.varix: d (mm), ratio (wall stress share of the tear point), air (the diameter at each mmHg of air) */
  d: number; ratio: number; air?: number[];
  bands: number;
  /** the model is paused or jumped: take the new state at once */
  snap: boolean;
  /** a slide's options: the air's pressure in the lumen (mmHg), the red marks forced on or off (null: the model's rule) */
  airOpt?: number; redOpt?: boolean | null;
}

interface Tw { v: number; to: number; at: number; cur: number }
const tw = (v: number): Tw => ({ v, to: v, at: 0, cur: v });
function tween(t: Tw, target: number, wall: number, dtMs: number, tau: number, delay: number): boolean {
  if (target !== t.to) { t.to = target; t.at = wall + delay; }
  if (wall < t.at) return true;
  t.cur = t.v = glide(t.cur, t.to, dtMs, tau);
  return t.cur !== t.to;
}

/** The wall share the scope's field follows: the engine's two-breath mean, the number the event, the Stigmata chip and every card read (B9), never the breath's own index. */
export const scopeRatio = (vx: { ratio: number; ratioMean?: number }): number => (Number.isFinite(vx.ratioMean) ? (vx.ratioMean as number) : vx.ratio);

export class FieldMotion {
  private mv: { d: number; ratio: number; air?: number[] } | null = null;
  private held: { at?: number; m?: number | null; k?: number; snap?: boolean } = {};
  private peak = 0; private peakRed = 0;
  private an: { g: number; v: number; r: number; def: Tw[]; kn: Tw[] } | null = null;
  private lastWall = 0;
  /** what the field is drawn from now */
  readonly state: FieldState & { bands: number; g: number } = { grow: 0, vis: 0, red: 0, def: [0, 0, 0, 0], kn: new Array(16).fill(0), bands: 0, g: 0 };

  /** Take the model's state at `wall` ms (the display clock); returns true while anything still moves. */
  step(inp: ScopeIn, wall: number): boolean {
    const dt = Math.min(0.1, Math.max(0, (wall - (this.lastWall || wall)) / 1000)); this.lastWall = wall;
    const bands = bandsPlaced(inp.bands);
    // (the field shows the varix over the beat, not each beat's swell: the same running mean the figure's varices follow)
    this.held.snap = inp.snap;
    const dMean = varixMean(this.held, inp.d, wall) as number, kb = this.held.k ?? 1;
    if (!this.mv) this.mv = { d: dMean, ratio: inp.ratio, air: inp.air?.slice() };
    else {
      this.mv.d = dMean; this.mv.ratio += (inp.ratio - this.mv.ratio) * kb;
      if (this.mv.air && inp.air) for (let i = 0; i < this.mv.air.length; i++) this.mv.air[i] += ((inp.air[i] ?? this.mv.air[i]!) - this.mv.air[i]!) * kb;
    }
    const mv = this.mv, opt = inp.airOpt ?? 0;
    const gNow = endoGrow(mv.d) as number;
    const kAir = airRatio(mv.air, opt) as number, gAir = gNow * (airFlat(mv.d, kAir) as number);
    this.peak = bands > 0 ? Math.max(this.peak, gAir) : gAir;
    const tg = this.peak, tv = bands > 0 ? 1 : clamp((mv.d * kAir - 2.5) / 1.0, 0, 1);
    // (stigmata follow the modeled wall stress: they start below the red-wale threshold and are full near it; unbanded columns keep what they showed before the first band)
    const rNow = clamp((mv.ratio - 0.55) / 0.35, 0, 1);
    this.peakRed = bands > 0 ? Math.max(this.peakRed, rNow) : rNow;
    const tr = inp.redOpt == null ? this.peakRed : +inp.redOpt;
    // each column is deflated and knuckled once banded (the bands fill the four columns in turn)
    const defT = [0, 0, 0, 0], knT = new Array<number>(16).fill(0);
    for (let c = 0; c < 4; c++) {
      const nb = Math.floor(bands / 4) + (c < bands % 4 ? 1 : 0);
      defT[c] = nb > 0 ? 1 : 0;
      for (let k = 0; k < Math.min(nb, 4); k++) knT[c * 4 + k] = 1;
    }
    if (!this.an) {
      this.an = { g: tg, v: tv, r: tr, def: defT.map((x) => tw(x)), kn: knT.map((x) => tw(x)) };
      if (inp.snap) { /* a first frame lands where it is */ }
    }
    const an = this.an;
    const kf = 1 - Math.exp(-dt * 1000 / SIZE_TAU_MS);
    an.g += (tg - an.g) * kf; an.v += (tv - an.v) * kf; an.r += (tr - an.r) * kf;
    if (Math.abs(tg - an.g) < 0.0008) an.g = tg;
    if (Math.abs(tv - an.v) < 0.0008) an.v = tv;
    if (Math.abs(tr - an.r) < 0.0008) an.r = tr;
    let busy = an.g !== tg || an.v !== tv || an.r !== tr;
    // the banded vein starts deflating at once; its band cinches in from a wide loop a beat later
    for (let c = 0; c < 4; c++) busy = tween(an.def[c]!, defT[c]!, wall, dt * 1000, DEFLATE_TAU_MS, 0) || busy;
    for (let i = 0; i < 16; i++) busy = tween(an.kn[i]!, knT[i]!, wall, dt * 1000, BAND_TAU_MS, knT[i] ? BAND_DELAY_MS : 0) || busy;
    const s = this.state;
    s.grow = an.g; s.g = an.g; s.vis = an.v; s.red = an.r; s.bands = bands;
    for (let c = 0; c < 4; c++) (s.def as number[])[c] = an.def[c]!.cur;
    for (let i = 0; i < 16; i++) (s.kn as number[])[i] = an.kn[i]!.cur;
    return busy;
  }
  /** Forget what was shown (a new patient): the next step lands where the model is. */
  reset(): void { this.mv = null; this.an = null; this.held = {}; this.peak = 0; this.peakRed = 0; this.lastWall = 0; }
}

/** The balloon, the bleed's jet and its pool ease in and out (instruments.js draw(): glide on the display clock; Reduce Motion lands at once). */
export class OverlayMotion {
  bal = 0; shut = 0; jet = 0; pool = 0;
  private last = 0;
  private bleedTotal = 0;
  /** `balloon`: the esophageal balloon is up; `shut`: the gastric balloon presses the tear shut; `bleedNow`: the model bleeds from the varices; `total`: mL lost so far. True while anything moves. */
  step(wall: number, o: { balloon: boolean; shut: boolean; bleedNow: boolean; total: number; still: boolean }): boolean {
    const du = this.last ? Math.min(100, wall - this.last) : 0; this.last = wall;
    if (o.bleedNow) this.bleedTotal = o.total;
    const bleeding = o.bleedNow && !(o.shut && this.shut >= 1);
    const poolT = this.bleedTotal || o.bleedNow ? poolFill(this.bleedTotal) as number : 0;
    if (o.still) { this.bal = +o.balloon; this.shut = +o.shut; this.jet = +bleeding; this.pool = poolT; }
    else {
      this.bal = glide(this.bal, +o.balloon, du); this.shut = glide(this.shut, +o.shut, du); this.jet = glide(this.jet, +bleeding, du);
      this.pool = this.pool ? glide(this.pool, poolT, du, 600) : poolT;
    }
    if (this.jet <= 0 && !bleeding) { this.pool = 0; this.bleedTotal = 0; }
    const moving = this.bal !== +o.balloon || this.shut !== +o.shut || this.jet !== +bleeding;
    if (!moving) this.last = 0;
    return moving;
  }
}
