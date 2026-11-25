// Dye injection and its spread (the 2D figure's bolus: blood.js createBolus, copied with displaySpeed): slugs of dyed blood ride every vessel at its display speed, mix at the junctions by flow, and wash out slowly.
// The bolus gives every vessel 48 bins of concentration along it (in the vessel's own direction); here they go into one float texture (a row per vessel, vessels/dye-shared.ts) that the VESSEL'S OWN fragment shader
// (and the junction skin's) reads by uv.x and mixes into its lumen colour, lime as the 2D figure paints it (--blood-dye #C7F533): look A, picked by Mohammad 24 Nov 2026 (docs/approved/dye.md). It was a separate
// shell at the built radius, drawn under the vessels, which ignored the vessel's live width, its fades and whether it is drawn at all (capsules past faded ends, strands on the hidden sinusoid beds). Painted in the
// vessel, the dye takes all of that by construction. A vessel that is not drawn (the sinusoid beds in the body view) holds the dye for its timing and mixing, and shows none. Nothing runs until an injection starts.
import { Group } from 'three';
import { EDGES, NODES } from '../../engine/hales/portal/topology.js';
import { DYE_BINS, DYE_SECONDS, createBolus, displaySpeed } from './copied/dye-bolus.js';
import { NETWORK_BY_ID } from '../vessels/network.ts';
import { DYE_COLOUR, dyeShared } from '../vessels/dye-shared.ts';
import type { VesselObject } from '../vessels/vessel-object.ts';

export { DYE_COLOUR };

interface FrameArrays { Qf?: ArrayLike<number>; Q: ArrayLike<number>; D: ArrayLike<number> }
interface Overlay { obj: VesselObject; k: number; has: boolean }

/** A vessel's mean velocity in cm/s from its flow (mL/s) and diameter (mm). */
export const velocityOf = (q: number, dmm: number): number => q / (Math.PI * (Math.max(dmm, 0.1) / 20) ** 2);

export class DyeLayer {
  /** (empty: the dye is painted in the vessels; the group stays for the scene's layer lists) */
  readonly group = new Group();
  private bolus = createBolus(EDGES as never, NODES as never);
  private E = (EDGES as { id: string }[]).length;
  private rows = dyeShared.rows;
  private row = new Float32Array(DYE_BINS);
  private overlays: Overlay[] = [];
  private net: { Q: Float64Array; vd: Float64Array; len: Float64Array };
  private index = new Map<string, number>((EDGES as { id: string }[]).map((e, i) => [e.id, i]));

  /** `vessels`: each drawn vessel's engine edge id and its object (uv.x along the flow). */
  constructor(vessels: readonly { id: string; obj: VesselObject }[]) {
    this.net = { Q: new Float64Array(this.E), vd: new Float64Array(this.E), len: new Float64Array(this.E) };
    for (const v of vessels) {
      const k = this.index.get(v.id);
      if (k != null) this.overlays.push({ obj: v.obj, k, has: false });
    }
    // the length of a drawn vessel in the figure's units; an undrawn one is one second's travel (blood.js: hidden vessels)
    for (const [id, i] of this.index) { const v = NETWORK_BY_ID.get(id); this.net.len[i] = v ? pathLen(v.pts) * 300 : 0; }
  }

  /** The body's dissolve (disease/index.ts setFade): the dye is laid on the anatomy's vessels, so the Circuit does not keep it. */
  setFade(f: number): void { dyeShared.amount.value = f; }

  /** Injects into a vessel (edge ID) at `at` (0..1 along the flow) for DYE_SECONDS, or until release() with `hold`. False for a vessel that does not exist. */
  inject(edgeId: string, at = 0, opts: { seconds?: number; hold?: boolean } = {}): boolean {
    const k = this.index.get(edgeId);
    if (k == null) return false;
    this.bolus.inject(k, at, { seconds: opts.seconds ?? DYE_SECONDS, hold: !!opts.hold });
    return true;
  }
  release(): void { this.bolus.release(); }
  clear(): void { this.bolus.clear(); for (const o of this.overlays) { o.obj.setDye(-1, null); o.has = false; } this.rows.fill(0); dyeShared.tex.needsUpdate = true; }
  get active(): boolean { return this.bolus.active; }

  /** Steps the bolus by `dt` seconds on the engine's latest flows; true while any dye is in the body (the clock keeps drawing). */
  step(dt: number, f: FrameArrays): boolean {
    if (!this.bolus.active) return false;
    const Q = f.Qf ?? f.Q, { net } = this;
    for (let i = 0; i < this.E; i++) {
      net.Q[i] = Q[i]!;
      net.vd[i] = displaySpeed(velocityOf(Q[i]!, f.D[i] ?? 1));
      if (!net.len[i]) net.len[i] = Math.max(1, Math.abs(net.vd[i]!));   // (an undrawn vessel: one second's travel)
    }
    this.bolus.step(dt, net);
    for (const o of this.overlays) {
      const has = this.bolus.field(o.k, net, this.row);
      if (has) { this.rows.set(this.row, o.k * DYE_BINS); o.obj.setDye(o.k, this.row); }
      else if (o.has) { this.rows.fill(0, o.k * DYE_BINS, (o.k + 1) * DYE_BINS); o.obj.setDye(-1, null); }
      o.has = has;
    }
    dyeShared.tex.needsUpdate = true;
    return true;
  }
  dispose(): void { this.clear(); }
}

function pathLen(pts: readonly (readonly number[])[]): number { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i]![0]! - pts[i - 1]![0]!, pts[i]![1]! - pts[i - 1]![1]!, pts[i]![2]! - pts[i - 1]![2]!); return l; }
