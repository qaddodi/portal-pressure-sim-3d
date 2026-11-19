// What the Endoscopy readings print for a frame, and a slide's options for the scope (2D instruments.js createEndoscopy update() and configure()). Pure: the pane renders it and the test reads it.
import { fmt } from '../copied/num.copied.js';
import { airRatio } from '../copied/endo-size.copied.js';
import { endoscopyLabel } from '../copied/instrument-aria.copied.js';
import { ENDO_WORDS as W } from '../copied/endo-words.copied.js';
import { metricsOf } from '../frame.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;

/** A slide's options for the scope (2D configure): the air's pressure in the lumen (mmHg; the varix is drawn and measured as seen at that pressure, the grade, the pressure inside it and the model are not touched),
 *  red (true or false: the red wale marks shown or hidden whatever the wall stress; absent: the model's rule) and readings (three more rows: the pressure in the varix, in the lumen and across the wall). */
export interface EndoOpt { air: number; red: boolean | null; readings: boolean }
export const scopeOptions = (t?: Record<string, unknown> | null): EndoOpt => ({
  air: Math.min(20, Math.max(0, +(t?.air as number) || 0)), red: typeof t?.red === 'boolean' ? t.red : null, readings: !!t?.readings,
});
const NO_OPT: EndoOpt = { air: 0, red: null, readings: false };

/** What the readings print for a frame (one place: the pane renders it and the test reads it). */
export function readingsOf(f: Any, opt: EndoOpt = NO_OPT) {
  const m = metricsOf(f), vx = m?.varix;
  if (!vx) return null;
  const nb = Math.round(f.bands || 0), present = !!vx.present;
  const grade: string = vx.grade.label;
  const diam = `${fmt(vx.d * (airRatio(vx.air, opt.air) as number), 1)} mm`;
  const red = !present ? W.red.none : (opt.red ?? vx.redWale) ? `${W.red.word}${W.red.more}` : W.red.none;
  const inV = vx.ptm as number;
  return {
    present, grade, sev: grade === 'Small' ? 'caution' : grade === 'None' ? 'ok' : 'danger', diam, wall: `${fmt(vx.w, 1)} mm`, red, redOn: red !== W.red.none, bands: nb,
    // the three pressures of a lesson slide: the varix's, the lumen's (the air's) and the difference across its wall
    pressures: [fmt(inV, 1), fmt(opt.air, 1), fmt(inV - opt.air, 1)].map((x) => `${x} mmHg`),
    label: endoscopyLabel({ present, grade, diam, red: red !== W.red.none, bands: nb }) as string,
  };
}

