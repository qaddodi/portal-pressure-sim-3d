// Each engine frame, pressure, flow and width of every vessel go into one small float texture: one texel per vessel (edge), in the
// engine's edge order. Shaders read colour shifts, swelling and flow-mark speed from it by the vessel's index, so a new engine frame
// costs one texture upload and no per-vessel work on the CPU beyond filling this array.
//
//   texel r = pressure at the vessel's upstream end   (mmHg, eased: Pf)
//   texel g = flow                                    (mL/s, signed, eased: Qf; negative = reversed)
//   texel b = diameter                                (mm)
//   texel a = pressure at the downstream end          (mmHg, eased)
//
// The vessel's name is its topology edge id (PV_TRUNK, SMV, SV…); `indexOf(id)` is the mapping from engine to mesh.
import { DataTexture, FloatType, NearestFilter, RGBAFormat } from 'three';
import { EDGES, NODES } from './hales/portal/topology.js';
import type { EngineFrame } from './hales/host/protocol.d.ts';
import { easeInOutCubic } from '../clock/tween.ts';

import { clock } from '../clock/frame.ts';
import { drawnDiameterIds, drawnDiameterVersion, hasDrawnDiameters } from './tract-override.ts';
interface Edge { id: string; from: string; to: string }
const edges = EDGES as Edge[];
const nodeIndex = new Map<string, number>((NODES as { id: string }[]).map((n, i) => [n.id, i]));

export const EDGE_IDS: readonly string[] = edges.map((e) => e.id);
export const EDGE_COUNT = edges.length;
const indexById = new Map(EDGE_IDS.map((id, i) => [id, i]));
export const indexOf = (id: string): number => {
  const i = indexById.get(id);
  if (i === undefined) throw new Error(`no vessel named ${id} in the engine's topology`);
  return i;
};
export const hasVessel = (id: string) => indexById.has(id);

const fromNode = Int16Array.from(edges.map((e) => nodeIndex.get(e.from) ?? -1));
const toNode = Int16Array.from(edges.map((e) => nodeIndex.get(e.to) ?? -1));

/** Width of the data texture: one row, one texel per vessel (a few hundred at most). */
export const TEXTURE_WIDTH = EDGE_COUNT;

/** Fill `out` (length 4 × EDGE_COUNT) from a frame. Pure, allocation-free: tests call it without a GPU. */
export function fillVesselData(f: Pick<EngineFrame, 'Pf' | 'Qf' | 'D'>, out: Float32Array): Float32Array {
  for (let i = 0; i < EDGE_COUNT; i++) {
    const a = fromNode[i]!, b = toNode[i]!;
    out[i * 4] = a >= 0 ? f.Pf[a]! : 0;
    out[i * 4 + 1] = f.Qf[i]!;
    out[i * 4 + 2] = f.D[i]!;
    out[i * 4 + 3] = b >= 0 ? f.Pf[b]! : 0;
  }
  // a vessel a procedure is making is drawn from its own table until the model has it, then at the larger of the two (tract-override.ts)
  if (hasDrawnDiameters()) for (const [id, d] of drawnDiameterIds()) { const k = indexById.get(id); if (k !== undefined && d > out[k * 4 + 2]!) out[k * 4 + 2] = d; }
  return out;
}

/** How long what is drawn takes to travel from the old patient's numbers to the new one's (the 2D app's surface time). */
export const PATIENT_EASE_MS = 420;
const reduced = () => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** The texture the scene's materials sample. Created once; `update` is called from the clock's engine phase.
 *  The model's numbers are never blended (a new patient's first frame is a `jump`: nothing the model reports blends across it). What is DRAWN does: the texture holds the display's copy,
 *  which glides from the old patient's numbers to the new one's (pressure, flow, width) over PATIENT_EASE_MS while the model's own are already the new patient's. */
export class VesselData {
  readonly data = new Float32Array(EDGE_COUNT * 4);
  readonly texture = new DataTexture(this.data, TEXTURE_WIDTH, 1, RGBAFormat, FloatType);
  private readonly target = new Float32Array(EDGE_COUNT * 4);
  private readonly from = new Float32Array(EDGE_COUNT * 4);
  private seen = -1;
  private ovSeen = 0;
  private ovOn = false;
  private last: EngineFrame | null = null;
  private had = false;
  private t0 = 0;
  private gliding = false;
  /** Whether the last `update` took a newer frame (the scene's other layers then read it too), as opposed to only stepping the glide. */
  fresh = false;
  constructor() {
    this.texture.minFilter = NearestFilter; this.texture.magFilter = NearestFilter;
    this.texture.generateMipmaps = false; this.texture.needsUpdate = true;
  }
  /** True while the drawn numbers are still travelling to the new patient's (the clock goes on asking for frames). */
  get easing(): boolean { return this.gliding; }
  /** Adopt a frame if it is newer than the one already in the texture, and step the glide. Returns whether the texture changed. */
  update(frame: EngineFrame | null, version: number, now: number = clock.now()): boolean {
    this.fresh = false;
    let changed = false;
    // (a drawn diameter moved: the width is refilled from the same frame; the scene is told only when a vessel comes or goes, since its presence is the one thing that needs more than the texture)
    const ov = drawnDiameterVersion(), ovMoved = ov !== this.ovSeen && !!frame;
    if (frame) this.last = frame;
    if (frame && (version !== this.seen || ovMoved)) {
      const newer = version !== this.seen, on = hasDrawnDiameters();
      this.seen = version; this.ovSeen = ov; changed = true;
      if (newer || on !== this.ovOn) this.fresh = true;
      this.ovOn = on;
      fillVesselData(frame, this.target);
      if (newer && frame.jump && this.had && !reduced()) { this.from.set(this.data); this.t0 = now; this.gliding = true; }
      else if (!this.gliding) this.data.set(this.target);
      this.had = true;
    }
    if (this.gliding) {
      const k = Math.min(1, Math.max(0, (now - this.t0) / PATIENT_EASE_MS)), e = easeInOutCubic(k);
      for (let i = 0; i < this.data.length; i++) this.data[i] = this.from[i]! + (this.target[i]! - this.from[i]!) * e;
      if (k >= 1) this.gliding = false;
      changed = true;
    }
    if (changed) this.texture.needsUpdate = true;
    return changed;
  }
  dispose() { this.texture.dispose(); }
}
