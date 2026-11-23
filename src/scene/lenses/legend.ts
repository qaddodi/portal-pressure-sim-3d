// The colour key of each lens (the 2D top bar's #legend, main.js renderLegend): a title and unit, a two-word caption for narrow screens,
// a bar with its numbers and ticks, or dots and short names for the stream lenses, and the sentence a screen reader gets. The words are the
// 2D app's (tests/lens-legend.test.ts finds every one in main.js when PPS_2D_REPO is set). Pure data: Legend.tsx draws it.
import { LENS_SHARED, LENS_TOKENS } from './tokens.copied.ts';
import { LENS_WORDS } from './words.copied.ts';
import { type LensId, HEAT_MAX, flowPos, oxygenPos, rampOf } from './model.ts';
import { type Rgb, delta3, hexToRgb01, rgb01ToHex, sampler } from './oklab.ts';
import type { LookId } from '../palette.ts';
import { figureHex } from '../vessels/cel-ink.ts';
import { RAW_LENSES } from './pressure-ramp.ts';

export interface LegendNum { at: number; text: string; optional?: boolean }
export interface LegendDot { colour: string; name: string; title: string }
export interface LegendSpec {
  lens: LensId;
  /** The lens's name for the top bar's pill ("Anatomy" for none). */
  name: string;
  /** title + unit (shown wide) and caption (shown narrow); absent for the category keys */
  title?: [string, string];
  caption?: [string, string];
  /** a bar: CSS gradient stops (colour, percent) and the numbers and ticks under it, in percent of its length */
  bar?: { stops: [string, number][]; nums: LegendNum[]; ticks: number[] };
  /** category dots with short names (Blood origin, First pass, direction, anatomy) */
  dots?: LegendDot[];
  note?: string;
  /** words for the dots' row as a hover title, not printed (2D's First pass: `LG_FP_DOTS title`; printing it wrapped the lens bar to a second row) */
  dotsTitle?: string;
  aria: string;
}

export const LG_MAX = 30;
const at = (p: number) => (p / LG_MAX) * 100;
const lensTitle = (id: string) => LENS_WORDS.find((w) => w[0] === id)?.[1] ?? id;

/** The reference's words: Congestion and Change name what they count from ("healthy", or the moment pinned, or a slide's name). */
export function refWords(ref: string) {
  return {
    heatUnit: `mmHg above ${ref}`,
    heatAria: `Legend: pressure above ${ref}, 0 to 15 millimeters of mercury, gray to yellow to deep red, with a glow where congestion is highest`,
    deltaTitle: `Change from ${ref}`,
    deltaAria: `Legend: change in pressure from ${ref}, blue lower, red higher, up to 12 millimeters of mercury`,
  };
}

/** Gradient stops (css colour, percent) of a ramp in a look, 11 evenly (the 2D bar), in OKLab. `max` is the ramp position at the bar's right end. Every colour is run through the vessels' own transform (figureHex,
 *  cel-ink.ts celTubeBase: saturated, deep, capped) AFTER the ramp is read, so a key never shows a colour the vessels do not wear (the pale end of the pressure ramp, the dark looks' brighter caps): ONE place for the bar,
 *  the lens menu's swatch and the action card's strip. */
export function rampStops(look: LookId, name: 'pressure' | 'flow' | 'velocity' | 'heat' | 'drop' | 'oxygen', max: number, n = 11): [string, number][] {
  const raw = RAW_LENSES.has(name);   // (the pressure and velocity ramps are authored as drawn: pressure-ramp.ts, velocity-ramp.ts, no transform)
  const s = sampler(rampOf(look, name));
  return Array.from({ length: n }, (_, i) => [figureHex(rgb01ToHex(s.at((i / (n - 1)) * max, [0, 0, 0])), look, raw), (i / (n - 1)) * 100]);
}
/** The Change lens's bar: the figure's own three-colour scale (sRGB, as delta3), read at 11 steps and put through the same transform as the vessels (the three stops alone would be blended AFTER the caps). */
export function deltaStops(look: LookId, n = 11): [string, number][] {
  const lo = hexToRgb01(LENS_SHARED.deltaLow), mid = hexToRgb01(LENS_SHARED.deltaMid), hi = hexToRgb01(LENS_SHARED.deltaHigh), c: Rgb = [0, 0, 0];
  return Array.from({ length: n }, (_, i) => [figureHex(rgb01ToHex(delta3(lo, mid, hi, (i / (n - 1)) * 2 - 1, 1, c)), look), (i / (n - 1)) * 100]);
}

export function legendFor(lens: LensId, look: LookId, ref = 'healthy'): LegendSpec {
  const w = refWords(ref);
  const hex = (r: Rgb) => rgb01ToHex(r);
  const flowDot = (c: string) => figureHex(hex(hexToRgb01(c)), look);
  const dot = (c: string) => (c ? figureHex(c, look) : c);   // (a dot is a vessel's colour: the figure's, not the raw token)
  switch (lens) {
    case 'pressure':
      return { lens, name: lensTitle('pressure'), title: ['Mean venous pressure', 'mmHg'], caption: ['Pressure', 'mmHg'],
        bar: { stops: rampStops(look, 'pressure', LG_MAX), nums: [0, 10, 20, 30].map((p) => ({ at: at(p), text: String(p) })), ticks: [0, 10, 20, 30].map(at) },
        aria: 'Legend: mean venous pressure at each vessel, 0 to 30 millimeters of mercury, pale blue through violet to dark plum' };
    case 'drop':
      return { lens, name: lensTitle('drop'), title: ['Pressure drop', 'mmHg'], caption: ['Drop', 'mmHg'],
        bar: { stops: rampStops(look, 'drop', 1), nums: [{ at: 0, text: '0' }, { at: 100, text: '≥12' }], ticks: [] },
        aria: 'Legend: pressure drop across each vessel, 0 to 12 or more millimeters of mercury, pale to deep purple' };
    case 'flow':
      return { lens, name: lensTitle('flow'), title: ['Flow volume', 'L/min · width ∝ √flow'], caption: ['Flow', 'L/min'],
        bar: { stops: rampStops(look, 'flow', 1), nums: [[0.02, '0.02'], [0.5, '0.5'], [5, '5']].map(([v, t]) => ({ at: flowPos(v as number) * 100, text: t as string })), ticks: [flowPos(0.5) * 100] },
        aria: 'Legend: flow volume from 0.02 to 6 liters per minute on a log scale, pale mint to deep blue; line width grows with flow' };
    case 'velocity':
      return { lens, name: lensTitle('velocity'), title: ['Velocity', 'vs normal'], caption: ['Velocity', 'vs normal'],
        bar: { stops: rampStops(look, 'velocity', 1), nums: [{ at: 0, text: 'Slow' }, { at: 100, text: 'Fast' }], ticks: [33.3, 66.7] },
        aria: "Legend: each vessel's mean velocity against its normal range: a continuous scale from indigo (slower than normal) through teal (normal) to coral (faster), stronger the further from normal; collaterals stay gray" };
    case 'heat':
      return { lens, name: lensTitle('heat'), title: ['Congestion', w.heatUnit], caption: ['Congestion', 'mmHg'],
        bar: { stops: rampStops(look, 'heat', 1), nums: [[0, '0'], [5, '5'], [10, '10', 1], [15, '≥15']].map(([v, t, o]) => ({ at: ((v as number) / HEAT_MAX) * 100, text: t as string, optional: !!o })), ticks: [] },
        aria: w.heatAria };
    case 'oxygen':
      return { lens, name: lensTitle('oxygen'), title: ['Oxygen saturation', '%'], caption: ['Oxygen', '%'],
        bar: { stops: rampStops(look, 'oxygen', 1), nums: [60, 80, 100].map((p) => ({ at: oxygenPos(p / 100) * 100, text: String(p) })), ticks: [oxygenPos(0.8) * 100] },
        aria: 'Legend: oxygen saturation of the blood in each vessel, 60 to 100 percent, blue (hepatic venous blood, about 65) to red (arterial, 98); portal blood is about 85' };
    case 'direction':
      return { lens, name: lensTitle('direction'), dots: [{ colour: flowDot(LENS_TOKENS[look].flowNormal), name: 'Physiological', title: '' }, { colour: flowDot(LENS_TOKENS[look].flowReversed), name: 'Reversed', title: '' }],
        aria: 'Legend: teal is physiological flow direction, orange is reversed' };
    case 'origin': {
      const names: [string, string][] = [['SMV', 'Superior mesenteric vein (and the coronary vein)'], ['IMV', 'Inferior mesenteric vein'], ['SV', 'Splenic venous blood'], ['HA', 'Hepatic arterial blood'], ['Sys', 'Systemic venous blood']];
      const order = [0, 1, 2, 4, 3];
      return { lens, name: lensTitle('origin'), dots: order.map((i) => ({ colour: dot(LENS_SHARED.origin[i]!), name: names[i]![0], title: names[i]![1] })),
        aria: 'Legend: blood colored by where it comes from, as streams side by side: amber SMV (with the coronary vein), teal IMV, violet SV (splenic vein), slate blue Sys (systemic), crimson HA (hepatic artery)' };
    }
    case 'firstpass':
      return { lens, name: lensTitle('firstpass'), dotsTitle: 'Splanchnic blood by its route: Raw has not passed the sinusoids, Clear has. Not an ammonia level',
        dots: [
          { colour: dot(LENS_SHARED.firstPassRaw), name: 'Raw', title: 'Splanchnic blood that has not passed the sinusoids: it keeps this color in a collateral, a shunt or a stent' },
          { colour: dot(LENS_SHARED.firstPassClear), name: 'Clear', title: 'Splanchnic blood after the sinusoids' },
          { colour: dot(LENS_SHARED.origin[3]), name: 'HA', title: 'Hepatic arterial blood' },
          { colour: dot(LENS_SHARED.origin[4]), name: 'Sys', title: 'Systemic venous blood' }],
        aria: 'Legend: splanchnic blood colored by whether it has passed through the liver. Orange Raw: splanchnic blood that has not passed the sinusoids, including blood that took a collateral, a shunt or a stent. Teal Clear: splanchnic blood after the sinusoids. Crimson HA: hepatic artery blood. Slate blue Sys: systemic venous blood. This shows the route the blood took, not an ammonia level' };
    case 'neutral':
      return { lens, name: 'Anatomy', dots: [{ colour: '', name: 'Portal veins', title: '' }, { colour: '', name: 'Systemic veins', title: '' }], note: 'Pressures unmeasured',
        aria: 'Legend: violet portal veins, blue systemic veins. Pressures are unmeasured in this case: investigate with the tools.' };
    case 'system':
      return { lens, name: 'System', dots: [{ colour: dot(LENS_TOKENS[look].trPv), name: 'Portal', title: '' }, { colour: dot(LENS_TOKENS[look].trIvc), name: 'Systemic', title: '' }, { colour: dot(LENS_TOKENS[look].trVar), name: 'Collateral or shunt', title: '' }],
        aria: 'Legend: the three vein systems: portal, systemic, and the collaterals and shunts between them' };
    default: // 'delta' and 'since': Change
      return { lens, name: lensTitle('delta'), title: [w.deltaTitle, 'mmHg'], caption: ['Change', 'mmHg'],
        bar: { stops: deltaStops(look), nums: [{ at: 0, text: '−12' }, { at: 50, text: '0' }, { at: 100, text: '+12' }], ticks: [50] },
        aria: w.deltaAria };
  }
}
