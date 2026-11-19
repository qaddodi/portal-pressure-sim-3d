// How a vessel fades at a free end, as the 2D figure does it (tables copied by scripts/copy-b3-data.mjs): the veins that end in the organ they drain (the splenic hilum, the bowel, the
// colon, the kidney) fade in from nothing over the first part of their length; the hepatic artery fades in at its start and its branches out at their ends, where they turn into
// sinusoids; the veins that run on out of the plate fade out down it. A fading tip is solid to its end while a collateral attaches there (TIP_CONNECT).
import { y3 } from '../frame2d.ts';
import { ART_FADE_2D, FADE_DOWN_Y_2D, TIP_CONNECT_2D, TIP_FADE_2D } from './fades.copied.ts';

export interface TipFade {
  /** 1: along the vessel (0 to 1), 2: down the figure (scene y) */
  mode: 1 | 2;
  from: number; to: number;
  /** alpha at `from` and at `to` */
  a0: number; a1: number;
  /** the Circuit does not let go of it (the artery's fades hold in both views) */
  keep: boolean;
  /** the collaterals whose being open makes the tip solid */
  connect: readonly string[];
}

/** The fade of a vessel, or null for one that has none. */
export function fadeOf(id: string, isArtery: boolean): TipFade | null {
  const art = ART_FADE_2D[id];
  if (art?.in) return { mode: 1, from: 0, to: art.in, a0: 0, a1: 1, keep: true, connect: [] };
  if (art?.out) return { mode: 1, from: 1 - art.out, to: 1, a0: 1, a1: 0, keep: true, connect: [] };
  const tip = TIP_FADE_2D[id];
  if (tip && !isArtery) return { mode: 1, from: 0, to: tip, a0: 0, a1: 1, keep: false, connect: TIP_CONNECT_2D[id] ?? [] };
  const down = FADE_DOWN_Y_2D[id];
  if (down) return { mode: 2, from: y3(down[0]), to: y3(down[1]), a0: 1, a1: 0, keep: false, connect: [] };
  return null;
}
