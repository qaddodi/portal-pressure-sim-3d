// The slide's own numbers for the Tests instruments in a data card (2D presenter-tools.js pin(fp): the fingerprint of the slide's settled state, the numbers its tiles and words show).
// A reading instrument on a slide shows these, not the beat-to-beat live value, so every screen reads the same number at any moment of the slide. ToolCard writes it when the card comes up and
// whenever the slide's state changes; the panes read it only while `slide` (a data card) is on. Pure state: nothing here draws.
import { create } from 'zustand';
import { NODES } from '../../../engine/hales/portal/topology.js';

import { clock } from '../../../clock/frame.ts';
const VAR = (NODES as { id: string }[]).findIndex((n) => n.id === 'VAR');

export type Fp = Record<string, unknown> | null | undefined;
const num = (x: unknown): number => (typeof x === 'number' && Number.isFinite(x) ? x : NaN);

interface SlidePin { fp: Fp; n: number }
export const useSlidePin = create<SlidePin>(() => ({ fp: null, n: 0 }));

let wallPin = NaN, wallAt = 0;
/** The slide's state (a fingerprint), or null when the card leaves. The wall's stress share eases into the last one when a what-if or a time-lapse pins a new state every few frames (2D createVarixWall pin). */
export function setSlidePin(fp: Fp, now = clock.now()): void {
  const x = num((fp as { wall?: unknown } | null | undefined)?.wall);
  wallPin = !Number.isFinite(x) ? NaN : Number.isFinite(wallPin) && now - wallAt < 1000 ? wallPin + (x - wallPin) * 0.35 : x;
  wallAt = now;
  useSlidePin.setState((s) => ({ fp: fp ?? null, n: s.n + 1 }));
}
export const slideFp = (): Fp => useSlidePin.getState().fp;

/** The wall's stress as a share of its tear point on the slide (NaN: live). */
export const pinnedWall = (): number => wallPin;
/** The slide's varix: its size at rest and the pressure in it (2D createEndoscopy pin: fp.varix and the varix node's pressure of the slide's own state), or null off a slide. */
export function pinnedVarix(): { d: number; ptm: number } | null {
  const fp = slideFp() as { varix?: unknown; at?: { P?: ArrayLike<number> } } | null | undefined;
  if (!fp || !Number.isFinite(num(fp.varix))) return null;
  const P = fp.at?.P;
  return { d: num(fp.varix), ptm: P ? num(P[VAR]) : NaN };
}
/** The slide's stiffness for an organ (fibroscan.js pin): lsm for the liver, ssm for the spleen; null when the slide has none. */
export function pinnedStiff(organ: 'liver' | 'spleen'): number | null {
  const x = num((slideFp() as Record<string, unknown> | null | undefined)?.[organ === 'liver' ? 'lsm' : 'ssm']);
  return Number.isFinite(x) ? x : null;
}
/** The slide's velocity of a vessel as the scanner reads it (doppler.js pinnedVel): given the 2D `dopplerVel` of the slide's flows and widths. */
export const pinnedAt = (): { Q?: ArrayLike<number>; D?: ArrayLike<number>; P?: ArrayLike<number> } | null => (slideFp() as { at?: { Q?: ArrayLike<number>; D?: ArrayLike<number>; P?: ArrayLike<number> } } | null | undefined)?.at ?? null;
