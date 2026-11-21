// The measured wedge, one place for both pressure charts (Tests > Pressure and the slides' profile): what a bracket's measured top end is called, which number it takes,
// and the sentence a screen reader gets about the HVPG. The HVPG is the wedged hepatic venous pressure (WHVP) less the free one (FHVP), both read at the catheter, never the
// sinusoid's own pressure. Tests draws the WHVP as a labelled marker at its height (its stations carry the sinusoid's own pressure); the slides' chart has no second label to add,
// because its Intra- station IS the WHVP (layout.generated.js AT_FP: SIN_R reads `whvp`, RHV reads `fhvp`) and the HVPG bracket stands over exactly those two, so the number it
// prints is the same one. tests/charts-profile.test.ts pins that on a presinusoidal case.
import { tenthGap } from '../../../engine/hales/core/gap.js';
import { fmt } from '../fmt.ts';

/** What a bracket's measured top end is called on a chart. */
export const MARK_NAME: Record<string, string> = { whvp: 'WHVP' };

/** The measured value a bracket starts from (the HVPG's WHVP), or null when the frame has none: the bracket is then left out. */
export function measuredTop(d: { hiM?: string }, m: Record<string, number | undefined> | null | undefined): number | null {
  const v = d.hiM ? m?.[d.hiM] : undefined;
  return v != null && Number.isFinite(v) ? v : null;
}

const one = (v: number): string => fmt(v, 1);

/** The HVPG's sentence for a screen reader, from the two measured pressures (null when either is not measured). */
export function hvpgSentence(whvp: number | null | undefined, fhvp: number | null | undefined, name = 'HVPG'): string | null {
  if (whvp == null || fhvp == null || !Number.isFinite(whvp) || !Number.isFinite(fhvp)) return null;
  return `${name} ${one(tenthGap(whvp, fhvp, whvp - fhvp)!)}: wedged hepatic venous pressure ${one(whvp)} minus free hepatic venous pressure ${one(fhvp)}, measured at the catheter, not the sinusoid's own pressure`;
}
