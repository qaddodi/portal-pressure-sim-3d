// Which of the artist's three specimens the patient on the screen is: the organs and the vessels both swap on it. Read from the engine's patient parameters (not the preset's name), so a
// custom patient (a slider, a clotted hepatic vein) gets the right form too.
import type { Specimen } from './types.ts';

export interface SpecimenParams { cirrhosis?: number; thrombus?: Record<string, number>; occluded?: Record<string, boolean> }

/** The hepatic veins whose block is Budd–Chiari (scenario.js: the preset clots all three). */
export const HEPATIC_VEINS = ['RHV_IVC', 'MHV_IVC', 'LHV_IVC'] as const;
/** Cirrhosis from here on is the decompensated study's liver (the presets: 0.4 compensated stays healthy; CSPH 0.6, decompensated 0.85 and TIPS 1 take the nodular liver). */
export const CIRRHOSIS_FROM = 0.5;
/** A hepatic vein clotted this far counts as blocked. */
export const BLOCKED_FROM = 0.5;

export function specimenOf(p: SpecimenParams | null | undefined): Specimen {
  if (!p) return 'healthy';
  if (HEPATIC_VEINS.some((id) => (p.thrombus?.[id] ?? 0) >= BLOCKED_FROM || p.occluded?.[id] === true)) return 'budd-chiari';
  if ((p.cirrhosis ?? 0) >= CIRRHOSIS_FROM) return 'cirr-decomp';
  return 'healthy';
}
