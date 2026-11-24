// The twin: a second figure beside the page's, for the split orbit (docs/approved/split-orbit.md). It is a CelScene of its own that reads one fixed patient (the healthy liver) instead of the
// engine's live one, is built only while a split slide is near and is disposed the moment it is left. It draws into the page scene's render target, in its own region (CelScene.drawShared):
// no canvas, no pass of its own. Nothing here asks for a frame; the page's scene steps it from its own update.
import type { WebGLRenderer, WebGLRenderTarget } from 'three';
import { VesselData } from '../../engine/vessel-data.ts';
import type { EngineFrame } from '../../engine/hales/host/protocol.d.ts';
import type { HealthyRef } from '../../engine/store.ts';
import { fixedSource } from '../model-source.ts';
import { CelScene } from '../scene.ts';
import type { LookId } from '../../looks/looks.ts';
import type { Region } from './region.ts';

/** What the engine's `healthyProfile` answers: the healthy patient at rest. */
export interface HealthyProfile { P: ArrayLike<number>; Q: ArrayLike<number>; D: ArrayLike<number>; metrics?: unknown }

/** The healthy patient as the frame a scene reads (the eased and the beat's numbers are the same at rest; nothing is running or pulsing). */
export function healthyFrame(h: HealthyProfile): EngineFrame {
  const P = Float32Array.from(h.P), Q = Float32Array.from(h.Q), D = Float32Array.from(h.D);
  return {
    type: 'frame', changed: true, gen: 0, jump: false, t: 0, day: 0, running: true, speed: 1, clock: 'hemo',
    pulsing: false, morphing: false, settling: false, phase: 0, P, Pf: P, Q, Qf: Q, ext: new Float32Array(0), D,
    metrics: (h.metrics ?? { hvpg: 0, whvp: 0, fhvp: 0 }) as EngineFrame['metrics'], events: [], paramsRev: 0,
  };
}

let alive = 0;
/** How many twins are built now (a test pins that leaving a split slide takes this back to zero). */
export const liveTwins = (): number => alive;

export class Twin {
  readonly source: ReturnType<typeof fixedSource>;
  readonly scene: CelScene;
  private readonly data = new VesselData();
  private version = 0;
  private gone = false;

  constructor(frame: EngineFrame, reference: HealthyRef | null, opts: { look: LookId; phone: boolean }) {
    alive++;
    this.source = fixedSource(frame, null, reference);   // (null parameters: the healthy patient has no disease to draw)
    this.scene = new CelScene({ look: opts.look, phone: opts.phone, source: this.source });
    this.scene.bindData(this.data.texture);
  }

  get disposed(): boolean { return this.gone; }

  /** One step on the page's clock: the numbers into the texture, the scene's own systems. True while it needs another frame. */
  step(now: number): boolean {
    if (this.gone) return false;
    if (this.version === 0) this.version = 1;
    const changed = this.data.update(this.source.frame(), this.version, now);
    if (changed && this.data.fresh) this.scene.dataChanged();
    return this.scene.update(now) || this.data.easing;
  }

  resize(width: number, height: number): void { if (!this.gone) this.scene.resize(width, height); }

  /** Drawn into the page scene's target, in `region` (the page scene's `split.drawTwin`). */
  draw(gl: WebGLRenderer, into: WebGLRenderTarget, region: Region, dpr: number): void { if (!this.gone) this.scene.drawShared(gl, into, region, dpr); }

  /** Everything this twin holds is let go: its scene (geometry, materials, listeners), its texture. Safe to call twice. */
  dispose(): void {
    if (this.gone) return;
    this.gone = true; alive--;
    this.scene.dispose(); this.data.dispose();
  }
}
