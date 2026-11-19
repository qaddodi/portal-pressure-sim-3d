// The lens as the scene holds it: two lens states on the GPU (the one leaving and the one arriving), a crossfade between them on the one clock,
// and the colours recomputed from the engine's frames. Nothing here draws or loops; the scene's update() steps it and says whether to go on.
//   setLens('velocity')   starts the crossfade (420 ms, the 2D app's surface time); a lens switched again before it has landed finishes at once
//   onFrame(frame)        the engine has a newer frame: the arriving lens is worked out again (at most every 90 ms)
import { DataTexture, FloatType, NearestFilter, RGBAFormat } from 'three';
import { type FrameLike, type LensContext, type LensData, type LensId, DEFAULT_LENS, LENS_EDGE_COUNT, computeLens, firstPassColours, newLensData, originColours } from './model.ts';
import { type LensShared, createLensShared } from '../vessels/vessel-object.ts';
import type { LookId } from '../palette.ts';
import { easeInOutCubic } from '../../clock/tween.ts';

export const LENS_MS = 420;
export const LENS_RECOMPUTE_MS = 90;
const NEEDS_FRAME = new Set<LensId>(['pressure', 'delta', 'heat', 'drop', 'flow', 'velocity', 'direction', 'oxygen', 'origin', 'firstpass', 'since']);
/** Lenses whose colour eases into the junction at the downstream end (the streams and the oxygen), not along the whole vessel. */
export const TAIL_LENSES = new Set<LensId>(['origin', 'firstpass', 'oxygen']);

function texturesFor(data: LensData): { grad: DataTexture; lanes: DataTexture } {
  const make = (a: Float32Array) => { const t = new DataTexture(a, LENS_EDGE_COUNT, 2, RGBAFormat, FloatType); t.minFilter = t.magFilter = NearestFilter; t.generateMipmaps = false; t.needsUpdate = true; return t; };
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
  private t0 = -1;
  private lastCompute = -1e9;
  private dirty = true;
  private fade = 1;

  constructor() {
    this.shared.lensGradA.value = this.texFrom.grad; this.shared.lensLaneA.value = this.texFrom.lanes;
    this.shared.lensGradB.value = this.texTo.grad; this.shared.lensLaneB.value = this.texTo.lanes;
    this.shared.lensMix.value = 1;
  }

  get lens(): LensId { return this._lens; }
  get fading(): boolean { return this.fade < 1; }
  /** The colours the arriving lens gives (a copy-free view, valid until the next recompute): for tests and labels. */
  get data(): LensData { return this.to; }

  setContext(ctx: LensContext): void { this.ctx = ctx; this.dirty = true; }
  setLook(look: LookId): void { this.look = look; this.dirty = true; }

  /** Switch lens. The old one fades out as the new one fades in (420 ms); a switch before it has landed finishes it first. */
  setLens(lens: LensId, now: number, instant = false): void {
    if (lens === this._lens && !this.dirty) return;
    // what is showing becomes the leaving state
    this.from.lens = this.to.lens; this.from.mode = this.to.mode; this.from.grad.set(this.to.grad); this.from.lanes.set(this.to.lanes);
    this.shared.lensModeA.value = this.shared.lensModeB.value;
    for (let i = 0; i < 5; i++) this.shared.laneColA.value[i]!.copy(this.shared.laneColB.value[i]!);
    this.texFrom.grad.needsUpdate = this.texFrom.lanes.needsUpdate = true;
    this._lens = lens;
    this.compute(now);
    if (instant) { this.fade = 1; this.shared.lensMix.value = 1; } else { this.fade = 0; this.t0 = now; this.shared.lensMix.value = 0; }
  }

  onFrame(frame: FrameLike | null): void { this.frame = frame; this.dirty = true; }

  private compute(now: number): void {
    this.lastCompute = now; this.dirty = false;
    if (this.frame) computeLens(this._lens, this.frame, this.look, this.ctx, this.to);
    else { this.to.lens = this._lens; this.to.mode = 0; this.to.grad.fill(0); this.to.lanes.fill(0); }
    const palette = this._lens === 'firstpass' ? firstPassColours() : originColours();
    for (let i = 0; i < 5; i++) this.shared.laneColB.value[i]!.set(palette[i]![0], palette[i]![1], palette[i]![2]);
    this.shared.lensModeB.value = this.to.mode;
    this.shared.lensTail.value = TAIL_LENSES.has(this._lens) ? 1 : 0;
    this.texTo.grad.needsUpdate = this.texTo.lanes.needsUpdate = true;
  }

  /** Steps the crossfade and any recompute. Returns true while it moves (the scene goes on asking for frames). */
  step(now: number): boolean {
    if (this.dirty && NEEDS_FRAME.has(this._lens) && now - this.lastCompute >= LENS_RECOMPUTE_MS) this.compute(now);
    else if (this.dirty && !NEEDS_FRAME.has(this._lens)) this.compute(now);
    if (this.fade >= 1) return this.dirty;
    const t = Math.min(1, (now - this.t0) / LENS_MS);
    this.fade = t;
    this.shared.lensMix.value = easeInOutCubic(t);
    return t < 1 || this.dirty;
  }

  /** Whether the arriving lens still has a recompute waiting (the scene draws once more when it lands). */
  get pending(): boolean { return this.dirty; }

  dispose(): void { for (const t of [this.texFrom.grad, this.texFrom.lanes, this.texTo.grad, this.texTo.lanes]) t.dispose(); }
}
