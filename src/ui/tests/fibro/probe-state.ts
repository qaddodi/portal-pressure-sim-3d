// What the FibroScan pane tells the figure (2D clock.js `fibroReading`): whether the card is on the FibroScan, which organ it reads, and the number it shows, so the scene's FibroScan probe
// (the one on the skin over the liver, or over the spleen) reads the same number as the card, in the card's own frame. The pane writes it; the scene reads it (`useFibroProbe`, or `fibroProbeOn()`).
import { create } from 'zustand';
import { useTests } from '../store.ts';
import type { OrganId } from './model.ts';

export interface FibroProbe {
  /** the number the card prints ("21.4", "–" with no spleen to read), or null while the pane is not up */
  txt: string | null;
  /** the exam the card reads */
  organ: OrganId;
  /** the stiffness the card's wave runs at (kPa), for the probe's own waves */
  kpa: number | null;
}
export const useFibroProbe = create<FibroProbe>(() => ({ txt: null, organ: 'liver', kpa: null }));
/** Whether the probe belongs on the figure now: the Tests card is up and on the FibroScan. */
export function fibroProbeOn(): boolean { const t = useTests.getState(); return t.open && t.pane === 'fibroscan'; }
export const fibroOrgan = (): OrganId => useTests.getState().fibro;
/** The pane's writes: only a change is stored, so a still number costs nothing. */
export function setFibroProbe(p: Partial<FibroProbe>): void {
  const s = useFibroProbe.getState();
  let diff = false;
  for (const k of Object.keys(p) as (keyof FibroProbe)[]) if (s[k] !== p[k]) diff = true;
  if (diff) useFibroProbe.setState(p);
}
