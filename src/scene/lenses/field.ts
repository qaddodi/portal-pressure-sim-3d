// The lens as the scene holds it: two lens states on the GPU (the one leaving and the one arriving), a crossfade between them on the one clock,
// and the colours recomputed from the engine's frames. Nothing here draws or loops; the scene's update() steps it and says whether to go on.
//   setLens('velocity')   starts the crossfade (420 ms, the 2D app's surface time); a lens switched again before it has landed finishes at once
//   onFrame(frame)        the engine has a newer frame: the arriving lens is worked out again (at most every 90 ms)
import { DataTexture, FloatType, NearestFilter, RGBAFormat } from 'three';
import { type FrameLike, type LensContext, type LensData, type LensId, DEFAULT_LENS, LENS_EDGE_COUNT, computeLens, firstPassColours, newLensData, originColours } from './model.ts';
import { type LensShared, createLensShared } from '../vessels/vessel-object.ts';
import type { LookId } from '../palette.ts';
import { easeInOutCubic } from '../../clock/tween.ts';
import { ChevronInk } from './chevron-ink.ts';
import { isRawLens } from './pressure-ramp.ts';
import { writeStentProfiles } from './stent-lens.ts';

export const LENS_MS = 420;
export const LENS_RECOMPUTE_MS = 90;
const NEEDS_FRAME = new Set<LensId>(['pressure', 'delta', 'heat', 'drop', 'flow', 'velocity', 'direction', 'oxygen', 'origin', 'firstpass', 'since']);
export { TAIL_LENSES } from './model.ts';   // (moved to model.ts: the tail is written into each gradient texture with its colours)

function texturesFor(data: LensData): { grad: DataTexture; lanes: DataTexture } {
  const make = (a: Float32Array) => { const t = new DataTexture(a, LENS_EDGE_COUNT, a.length / (LENS_EDGE_COUNT * 4), RGBAFormat, FloatType); t.minFilter = t.magFilter = NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; return t; };
  return { grad: make(data.grad), lanes: make(data.lanes) };
}

export class LensField {
  readonly shared: LensShared = createLensShared();
  private from = newLensData();
  private to = newLensData();
  private readonly texFrom = texturesFor(this.from);
  private readonly texTo = texturesFor(this.to);
  private _lens: LensId = DEFAULT_LENS;
  private look: LookId = 'light';
  private ctx: LensContext = { healthy: null, ref: null };
  private frame: FrameLike | null = null;
  /** The patient's params as shown (the stents' geometry, for their colour along them: stent-lens.ts). */
  private params: unknown = null;
  private t0 = -1;
  private lastCompute = -1e9;
  private dirty = true;
  private fade = 1;
  /** The flow heads' tone per vessel: latched and eased (chevron-ink.ts), written into the arriving lens's colour texture. */
  private readonly ink = new ChevronInk();
  private lastStep = -1;
  /** The network the Since lens counts its change from (2D: stage.js sinceP, set by a slide through changeRef; until one is set, the state the figure showed as the lens came in). */
  private since: Float32Array | null = null;
  /** True while `since` is that arrival state (taken by the lens itself) and not one a slide set. */
  private sinceAuto = false;
  /** True while Compare's pinned moment is the reference (it outranks the Since reference, as in 2D REF()). */
  private refIsCompare = false;
  private readonly sinceCtx: LensContext = { healthy: null, ref: null };

  constructor() {
    this.shared.lensGradA.value = this.texFrom.grad; this.shared.lensLaneA.value = this.texFrom.lanes;
    this.shared.lensGradB.value = this.texTo.grad; this.shared.lensLaneB.value = this.texTo.lanes;
    this.shared.lensMix.value = 1;
  }

  get lens(): LensId { return this._lens; }
  get fading(): boolean { return this.fade < 1; }
  /** The colours the arriving lens gives (a copy-free view, valid until the next recompute): for tests and labels. */
  get data(): LensData { return this.to; }

  setContext(ctx: LensContext): void { this.ctx = ctx; this.refIsCompare = false; this.dirty = true; }
  /** The pressures Change and Congestion count from: the healthy patient's, or a pinned moment's (Compare); null = healthy. */
  setRef(ref: ArrayLike<number> | null): void { this.refIsCompare = ref != null; this.ctx = { ...this.ctx, ref: ref ?? this.healthyRef }; this.dirty = true; }
  /** A slide hands the Since lens the network it counts from (the state of the slide before, or a named one; a lapse's start). Null puts the arrival state back in its place. */
  setSinceRef(P: ArrayLike<number> | null): void {
    this.since = P ? Float32Array.from(P) : null; this.sinceAuto = false; this.dirty = true;
  }
  /** The node pressures the Since lens counts from now (a copy-free view): a slide's, else the state the lens came in on, else the healthy patient's. */
  get sinceReference(): ArrayLike<number> | null {
    if (this.refIsCompare) return this.ctx.ref;
    if (!this.since && this.frame && this._lens === 'since') { this.since = Float32Array.from(this.frame.Pf ?? this.frame.P); this.sinceAuto = true; }
    return this.since ?? this.ctx.ref;
  }
  private get healthyRef(): ArrayLike<number> | null { return this.ctx.healthy?.P ? Float32Array.from(this.ctx.healthy.P) : null; }
  /** The patient's params as shown now: the stents' shape. */
  setParams(params: unknown): void { if (params !== this.params) { this.params = params; this.dirty = true; } }
  setLook(look: LookId): void { this.look = look; this.dirty = true; }

  /** Switch lens. The old one fades out as the new one fades in (420 ms); a switch before it has landed finishes it first. */
  setLens(lens: LensId, now: number, instant = false): void {
    if (lens === this._lens && !this.dirty) return;
    // what is showing becomes the leaving state
    this.from.lens = this.to.lens; this.from.mode = this.to.mode; this.from.grad.set(this.to.grad); this.from.lanes.set(this.to.lanes);
    this.shared.lensModeA.value = this.shared.lensModeB.value; this.shared.lensRawA.value = this.shared.lensRawB.value;
    for (let i = 0; i < 5; i++) this.shared.laneColA.value[i]!.copy(this.shared.laneColB.value[i]!);
    this.texFrom.grad.needsUpdate = this.texFrom.lanes.needsUpdate = true;
    if (lens !== 'since' && this.sinceAuto) { this.since = null; this.sinceAuto = false; }   // (the arrival state is only for the lens that took it)
    this._lens = lens;
    if (lens === 'since') void this.sinceReference;   // (takes the state the figure shows as the lens comes in, before any newer frame moves it)
    this.compute(now);
    if (instant) { this.fade = 1; this.shared.lensMix.value = 1; } else { this.fade = 0; this.t0 = now; this.shared.lensMix.value = 0; }
  }

  /** The engine has a newer frame. A `jump` frame (a new patient) is not blended in the model; what is drawn is: the colours showing become the leaving state and cross-fade to the new patient's. */
  onFrame(frame: FrameLike | null, jump = false, now = -1): void {
    this.frame = frame; this.dirty = true;
    if (!jump || !frame || now < 0 || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
    this.from.lens = this.to.lens; this.from.mode = this.to.mode; this.from.grad.set(this.to.grad); this.from.lanes.set(this.to.lanes);
    this.shared.lensModeA.value = this.shared.lensModeB.value; this.shared.lensRawA.value = this.shared.lensRawB.value;
    for (let i = 0; i < 5; i++) this.shared.laneColA.value[i]!.copy(this.shared.laneColB.value[i]!);
    this.texFrom.grad.needsUpdate = this.texFrom.lanes.needsUpdate = true;
    this.compute(now);
    this.fade = 0; this.t0 = now; this.shared.lensMix.value = 0;
  }

  private compute(now: number): void {
    this.lastCompute = now; this.dirty = false;
    if (this.frame) {
      let ctx = this.ctx;
      if (this._lens === 'since') { ctx = this.sinceCtx; ctx.healthy = this.ctx.healthy; ctx.ref = this.sinceReference; }
      computeLens(this._lens, this.frame, this.look, ctx, this.to);
      writeStentProfiles(this.to, this._lens, this.frame, this.look, ctx, this.params);   // (a stent's colour runs along it as the IR card's graph does, not as a blend of its ends)
    }
    else { this.to.lens = this._lens; this.to.mode = 0; this.to.grad.fill(0); this.to.lanes.fill(0); }
    const palette = this._lens === 'firstpass' ? firstPassColours() : originColours();
    for (let i = 0; i < 5; i++) this.shared.laneColB.value[i]!.set(palette[i]![0], palette[i]![1], palette[i]![2]);
    this.shared.lensModeB.value = this.to.mode; this.shared.lensRawB.value = isRawLens(this._lens) ? 1 : 0;   // (the pressure ramp is authored as drawn: pressure-ramp.ts; crossfaded with the colours by lensMix)
    this.ink.decide(this.to, this.look);   // (the heads' ink follows the colours just computed, through a latch)
    this.ink.write(this.to.grad);
    this.texTo.grad.needsUpdate = this.texTo.lanes.needsUpdate = true;
  }

  /** Steps the crossfade and any recompute. Returns true while it moves (the scene goes on asking for frames). */
  step(now: number): boolean {
    const inkWas = this.ink.moving;   // (a head's ink that only starts to change in this frame's recompute begins its ease now: the idle time before it is not part of it)
    if (this.dirty && NEEDS_FRAME.has(this._lens) && now - this.lastCompute >= LENS_RECOMPUTE_MS) this.compute(now);
    else if (this.dirty && !NEEDS_FRAME.has(this._lens)) this.compute(now);
    const dt = !inkWas || this.lastStep < 0 ? 0 : Math.min(250, Math.max(0, now - this.lastStep));
    this.lastStep = now;
    this.ink.instant = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    let inkMoving = false;
    if (this.ink.moving) { inkMoving = this.ink.step(dt); this.ink.write(this.to.grad); this.texTo.grad.needsUpdate = true; }
    if (this.fade >= 1) return this.dirty || inkMoving;
    const t = Math.min(1, (now - this.t0) / LENS_MS);
    this.fade = t;
    this.shared.lensMix.value = easeInOutCubic(t);
    return t < 1 || this.dirty || inkMoving;
  }

  /** Whether the arriving lens still has a recompute waiting (the scene draws once more when it lands). */
  get pending(): boolean { return this.dirty || this.ink.moving; }

  dispose(): void { for (const t of [this.texFrom.grad, this.texFrom.lanes, this.texTo.grad, this.texTo.lanes]) t.dispose(); }
}
