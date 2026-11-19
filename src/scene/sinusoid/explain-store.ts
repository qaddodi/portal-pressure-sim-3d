// A tap on one of the sinusoid's names (2D: label-explain.js through sinusoid-view.js explainHit and lobule-zoom.js explainAt): in a talk, the name under the finger takes one more line saying what
// the part is and its slide term lights (`sinusoid:<target>`); a second tap on it, or a talk that ends, puts it away. Outside a talk the names do nothing, as in 2D. The layer writes the names it
// drew (for the hit) and reads the explained one; the stage's tap gesture calls `sinusoidTap`.
import { create } from 'zustand';
import { type NameKey, type NamePlacement, explainHit } from './names.ts';

export interface SinusoidNamesState {
  /** the names the layer drew last, for a tap to land on */
  placed: readonly NamePlacement[];
  /** the explained name, and the slide term it lights */
  explain: NameKey | null; target: string | null;
  /** the terms the slide lights (a deck sets them; `sinusoid:canaliculus` names the canaliculus on a tall screen) */
  lit: ReadonlySet<string>;
}
export const useSinusoidNames = create<SinusoidNamesState>(() => ({ placed: [], explain: null, target: null, lit: new Set() }));

export const setSinusoidPlaced = (placed: readonly NamePlacement[]): void => useSinusoidNames.setState({ placed });
export const setSinusoidLit = (terms: Iterable<string>): void => useSinusoidNames.setState({ lit: new Set(terms) });
export const clearSinusoidExplain = (): void => useSinusoidNames.setState({ explain: null, target: null });

/** A tap at canvas point (x, y): in a talk, explains the name drawn there (or lets go of it when it is the one explained). True when a name took the tap. */
export function sinusoidTap(x: number, y: number, presenting: boolean): boolean {
  if (!presenting) return false;
  const s = useSinusoidNames.getState(), hit = explainHit(s.placed, x, y);
  if (!hit) return false;
  if (hit.key === s.explain) clearSinusoidExplain(); else useSinusoidNames.setState({ explain: hit.key, target: hit.target });
  return true;
}
