// What the fluid balance card reads from the 3D engine (2D: tool-fluid.js pin(fp) / update(fr) / paintForces). Pure: the card hands in the slide's fingerprint, the live frame and the patient's params.
import { fluidOf, pinnedForces, sinusoidForces, type Fluid, type Forces } from './model.ts';

export interface FluidParams { albumin?: number; cirrhosis?: number; diuretics?: unknown }
export interface FluidFrameLike { P?: ArrayLike<number>; Pf?: ArrayLike<number>; metrics?: any }

/** The balance and the forces to show. A slide's fingerprint (with the fluid terms) pins both; without one the live frame's metrics and node pressures give them (the live push is the raw one: the card eases it, see `ForcesAverage`). */
export function fluidInputs(fp: Record<string, unknown> | null | undefined, frame: FluidFrameLike | null | undefined, params: FluidParams | null | undefined): { f: Fluid | null; forces: Forces | null; pinned: boolean } {
  const live = () => sinusoidForces(frame?.Pf || frame?.P, params, frame?.metrics?.ascites?.iap);
  const pinnedF = fluidOf(fp);
  if (pinnedF) {
    const p = pinnedForces(fp as { hepLymph?: number; salb?: number }, params);
    return { f: pinnedF, forces: p ?? live(), pinned: !!p };
  }
  return { f: fluidOf(frame?.metrics), forces: live(), pinned: false };
}

/** The live push swings with each breath, as the belly's pressure does: eased over a few seconds (time constant 3 s), so it reads the breath's middle, not its moment. One per card. */
export class ForcesAverage {
  private avg: Forces | null = null;
  private at = 0;
  next(raw: Forces, now: number): Forces {
    const k = this.avg ? 1 - Math.exp(-Math.min(1, (now - this.at) / 1000) / 3) : 1;
    this.at = now;
    this.avg = this.avg ? { out: this.avg.out + k * (raw.out - this.avg.out), pull: this.avg.pull + k * (raw.pull - this.avg.pull) } : raw;
    return this.avg;
  }
}

/** The caveat shows on a slide whose patient is on diuretics, or whose compare buttons give them, or that asks for it (set once for the slide, so the card keeps its size). */
export const wantsCaveat = (o: { caveat?: boolean }, params: FluidParams | null | undefined, compare?: { params?: FluidParams }[] | null): boolean =>
  !!(o.caveat || params?.diuretics || compare?.some((c) => c?.params?.diuretics));
