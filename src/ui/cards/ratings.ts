// What a data-card tile may say about its number (owner, 27 Nov 2026, rulings C1 and C2 on the external review of capture 3531bdfa). The 2D tables (ui/deck/from2d/table-marks.js, kept
// character for character) rate every reading with a word; three of those ratings have no guideline behind them, and one is stated for a single use of the drug:
//   - the portal vein, wedged and sinusoidal pressures are absolute pressures nobody grades ("High", "Severe" were the model's own bands): they print the plain number and a plain bar;
//   - the platelet count says only "<150", the one line Baveno VIII uses (the CSPH rule-out needs ≥150), never "Low" or "Severe";
//   - the HVPG, and the EUS-PPG read on its lines, says "CSPH" only where CSPH can be said: a liver with no sinusoidal scar (SOS, portal vein thrombosis, schistosomiasis, PSVD) has portal
//     hypertension, not cirrhotic CSPH, so its tile keeps the plain number;
//   - the HVPG response is a fall of ≥10% in primary prophylaxis and ≥20% (or an HVPG ≤12 mmHg) after a bleed: the slide says which (`hvpgRule`, decks/overlay/controls.ts).
// Every place that reads a tile's rating (the tile, its bar, the colour of a number in the words) asks here, never the 2D table directly, so the rule is one rule.
import { rateOf as rateOf2d, rateShown as rateShown2d, tileOf, tileShown, SCALE as SCALE2d } from '../deck/from2d/table-marks.js';
import { lsmContext } from '../../engine/hales/portal/lsm-cuts.js';

export type Rating = readonly [string | null, string];
type Fp = Readonly<Record<string, number | null | undefined>>;
type Scale = readonly [number, number, readonly number[]];

/** Pressures no guideline grades: a plain number (and a bar with no bands). */
export const UNGRADED: ReadonlySet<string> = new Set(['pv', 'whvp', 'sin']);
/** The one platelet line Baveno VIII draws: ≥150 ×10³/µL is half of the CSPH rule-out (with an LSM ≤15 kPa). */
export const PLT_RULE_OUT = 150;
/** The HVPG fall that marks a response, by use: primary prophylaxis (and the acute IV propranolol test) ≥10%, secondary prophylaxis after a bleed ≥20%. */
export const RESPONSE_CUT = { primary: 10, acute: 10, secondary: 20 } as const;
export type ResponseRule = keyof typeof RESPONSE_CUT;

const NONE: Rating = Object.freeze([null, '']) as Rating;
const PLT_BELOW: Rating = Object.freeze(['info', `<${PLT_RULE_OUT}`]) as Rating;

/** The tile's rating of a reading in state `f` (the 2D table's, less the three ratings above). */
export function rateOf(k: string, f: Fp | null | undefined): Rating {
  if (UNGRADED.has(k)) return NONE;
  const v = f?.[k];
  if (k === 'plt') return v == null ? NONE : v < PLT_RULE_OUT ? PLT_BELOW : NONE;
  if (k === 'hvpgFall') {
    const cut = typeof f?.respCut === 'number' ? f.respCut : RESPONSE_CUT.primary;
    return v == null ? NONE : v >= cut ? ['ok', `≥${cut}%`] : f?.respAt != null && f.respAt <= 12 ? ['ok', '≤12 mmHg'] : ['hi', `<${cut}%`];
  }
  const r = rateOf2d(k, f) as Rating;
  // (a scar-free liver's HVPG at 10 or more is portal hypertension, not CSPH: the word, and its red, stay off)
  return (k === 'hvpg' || k === 'eus') && r[0] === 'hi' && lsmContext(f as Record<string, number>) === 'vascular' ? NONE : r;
}

/** The rating of the number as its tile prints it (a tile's word judges the number it shows, 2D rateShown). */
export const rateShown = (k: string, f: Fp | null | undefined): Rating => {
  if (!UNGRADED.has(k) && k !== 'plt' && k !== 'hvpgFall' && k !== 'hvpg' && k !== 'eus') return rateShown2d(k, f) as Rating;
  return f && f[k] != null ? rateOf(k, { ...f, [k]: tileShown(k, f[k]) }) : rateOf(k, f);
};

/** A tile's scale: from, to and the cut-off ticks between its bands, the 2D table's except where a rating was taken off
 *  (no bands on a plain pressure, the one platelet line, the response's own cut). */
export function scaleOf(k: string, f?: Fp | null): Scale | undefined {
  const s: Scale | undefined = (SCALE2d as unknown as Record<string, Scale | undefined>)[k];
  if (!s) return s;
  if (UNGRADED.has(k)) return [s[0], s[1], []];
  if (k === 'plt') return [s[0], s[1], [PLT_RULE_OUT]];
  if (k === 'hvpgFall') return [s[0], s[1], [typeof f?.respCut === 'number' ? f.respCut : RESPONSE_CUT.primary]];
  return s;
}

/** A bar's bands over `scaleOf`: each from a to b (shown units) and m, its middle in the model's units (what the rating reads); [] for a plain track, null for no bar. */
export function bandsOf(k: string, f?: Fp | null): { a: number; b: number; m: number }[] | null {
  const s = scaleOf(k, f);
  if (!s) return null;
  if (!s[2].length) return [];
  const x = tileOf(k)?.x ?? 1, e = [s[0], ...s[2], s[1]];
  return e.slice(0, -1).map((a, i) => ({ a, b: e[i + 1]!, m: (a + e[i + 1]!) / 2 / x }));
}
