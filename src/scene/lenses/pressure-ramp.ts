// THE pressure colour ramp: the one place its colours are written down (S1 "ramp v2", Mohammad, 22 Nov 2026: "take the new ones").
// Every reader takes it from here: the vessels (lenses/model.ts samplerFor), the legend bar and its swatches (legend.ts), the charts' pressure colours
// (charts/profile/pressure-colour.ts, tests/profile/model.ts), the ladder, the Lobule and the Sinusoid (samplerFor). `tests/pressure-ramp-source.test.ts` fails on a second reader of the 2D ramp.
//
// These are the colours the figure DRAWS, authored in OKLCH with the lightness falling in a straight line with pressure, so the vessels wear them as they are (no saturation step, no caps:
// cel-ink.ts celTubeBase `raw`, cel-glsl.ts tubeRawK) and a legend swatch, a chart line and a vessel are the same colour. The 2D app's own ramp stays in tokens.copied.ts as the reference it was copied from.
// Hues are the app's (blue, violet at the CSPH line, magenta, wine). Measured per look in tests/pressure-ramp.test.ts: lightness strictly falls; two pressures 2.5 mmHg apart differ by 3.5 or more
// (OKLab x100) for normal, deutan and protan vision (Machado 2009, full strength); 9 against 13 mmHg by 7.5 or more; no stop within 10 of the artery red; the lit tone is 1.6:1 or more against the page.
import type { Ramp } from './tokens.copied.ts';
import type { LookId } from '../palette.ts';
import type { LensId } from './model.ts';

/** Stops [colour, mmHg] per look. Light and Dark from the design review (visual-design-fable.md 2); the pale end of Light is a little deeper than the review's (#98C3E8, #70A9E8 gave 1.57:1 on the page);
 *  Soft is its own (its ground is a tan 0.64 bright, so the whole ramp sits deeper: found by search against the same limits); Navy and Black take Dark's (their grounds are darker still). */
export const PRESSURE_RAMP: Readonly<Record<LookId, Ramp>> = (() => {
  const light: Ramp = [['#92BDE2', 0], ['#6FA7E6', 5], ['#5D80EF', 10], ['#8859E3', 12], ['#9C0766', 20], ['#5F011F', 30]];
  const soft: Ramp = [['#769EBF', 0], ['#4C83BE', 5], ['#4868D2', 10], ['#6A2BC6', 12], ['#8E015C', 20], ['#510019', 30]];
  const dark: Ramp = [['#D3ECFE', 0], ['#A6D3FF', 5], ['#8CAFFE', 10], ['#AC8BFE', 12], ['#E11F97', 20], ['#B90635', 30]];
  return { light, soft, dark, navy: dark, black: dark };
})();

/** The stops as css text ("#92BDE2 0, #6FA7E6 5, ..."), the form the 2D charts' token tables hold. */
export const pressureRampText = (look: LookId): string => PRESSURE_RAMP[look].map(([c, p]) => `${c} ${p}`).join(', ');

/** The ramp's 12 and 20 mmHg stops as flat colours (the HVPG against PPG plane's violet and wine zones): the same stops, never a second typed copy. */
export const pressureViolet = (look: LookId): string => PRESSURE_RAMP[look][3]![0];
export const pressureWine = (look: LookId): string => PRESSURE_RAMP[look][4]![0];

/** Lenses whose colours are authored as drawn: the vessels skip the saturation step and the caps for them (cel-ink.ts celTubeBase `raw`). Velocity joined them with ramp F (velocity-ramp.ts, 22 Nov). Every other lens keeps the 2D ramps and the transform. */
export const RAW_LENSES: ReadonlySet<LensId> = new Set<LensId>(['pressure', 'velocity']);
export const isRawLens = (lens: LensId): boolean => RAW_LENSES.has(lens);
