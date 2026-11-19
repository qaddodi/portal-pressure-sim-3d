// The frame, the patient's parameters, the healthy reference and the lens now: what a card reads from (null before the model has run).
import { latest, patient } from '../../engine/store.ts';
import { useLens } from '../../scene/lenses/store.ts';
import { currentParams } from './params.ts';
import type { Env } from './read.ts';

export function envNow(): Env | null {
  const f = latest.frame, p = currentParams();
  if (!f || !p) return null;
  return { f, p, ref: patient.reference, lens: useLens.getState().lens };
}
