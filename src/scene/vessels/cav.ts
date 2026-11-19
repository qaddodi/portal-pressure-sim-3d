// The cavernoma's channels (periportal collaterals, edge C8), as the 2D figure draws them (cavernoma-strand.js, copied by scripts/copy-b3-data.mjs): each channel leaves the clotted portal trunk at
// its own place, winds about it on its own side and rejoins it at its own place; the more the collaterals are recruited, the more channels grow in and the wider they are.
import { CAV_CHANNELS, cavGrow, cavStrand, trunkFrame } from './cavernoma.copied.js';
import type { P2 } from './coil.ts';

export interface CavChannel { v: number; amp: number; cyc: number; ph: number; a: number; z: number; k: number; r0: number; ramp: number }
/** The channels besides the main one (C8's own course). */
export const CAV: readonly CavChannel[] = (CAV_CHANNELS as Record<string, CavChannel[]>).C8!;

/** The channels' samples (2D units), `n` each, in the frame of the trunk's two pieces end to end; `main` is C8's own drawn course. */
export function cavChannels(trunk: readonly (readonly P2[])[], main: readonly P2[]): P2[][] {
  const F = trunkFrame(trunk);
  return CAV.map((c) => cavStrand(F, c, main.length, 0, main) as P2[]);
}

/** How far channel `i` has grown at recruitment `r` (0 to 1): it begins at its own `r0` and is whole CAV_GROW of the recruitment later. */
export const cavGrowth = (i: number, r: number): number => cavGrow(r, CAV[i]!.r0) as number;
