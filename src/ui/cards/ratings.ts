// What a data-card tile may say about its number (owner, 27 Nov 2026, rulings C1 and C2 on the external review of capture 3531bdfa). The 2D tables (ui/deck/from2d/table-marks.js, kept
// character for character) rate every reading with a word; three of those ratings have no guideline behind them, and one is stated for a single use of the drug:
//   - the portal vein, wedged and sinusoidal pressures are absolute pressures no guideline grades, so their words are the plain "Normal", "High" and "Very high", never "Severe" (C1). They keep
//     their BAR (owner, 27 Nov, later the same day: "tiles should always have the normal values in the bars, or what is the point of the bars"): the model's reference bands, the same
//     numbers the summary table's arrows use (table-marks.js RAW, PV_CUTS), so the tile, its bar and the table's arrow always agree;
//   - the platelet count says only "<150", the one line Baveno VIII uses (the CSPH rule-out needs ≥150), never "Low" or "Severe"; at 150 or more it says no word but its bar and number stand in
//     the normal green;
//   - the HVPG, and the EUS-PPG read on its lines, says "CSPH" only where CSPH can be said: a liver with no sinusoidal scar (SOS, portal vein thrombosis, schistosomiasis, PSVD) has portal
//     hypertension, not cirrhotic CSPH, so its tile keeps the plain number;
//   - the HVPG response is a fall of ≥10% in primary prophylaxis and ≥20% (or an HVPG ≤12 mmHg) after a bleed: the slide says which (`hvpgRule`, decks/overlay/controls.ts).
// Every place that reads a tile's rating (the tile, its bar, the colour of a number in the words) asks here, never the 2D table directly, so the rule is one rule.
import { rateOf as rateOf2d, rateShown as rateShown2d, tileOf, tileShown, RAW, SCALE as SCALE2d } from '../deck/from2d/table-marks.js';
import { lsmContext } from '../cuts.ts';

export type Rating = readonly [string | null, string];
type Fp = Readonly<Record<string, number | null | undefined>>;
type Scale = readonly [number, number, readonly number[]];

/** Pressures no guideline grades: they keep the model's reference bands (the 2D table's, the summary arrows' too) and say it in plain words, never the table's "Severe". */
export const MODEL_BANDED: ReadonlySet<string> = new Set(['pv', 'whvp', 'sin']);
/** The right-sided pressures (owner, 27 Nov): amber over the first line, red over the second, the summary table's own (table-marks.js RAW), so the tile, its bar and the table's arrow cannot drift. */
export const OVER_RAW: ReadonlySet<string> = new Set(['fhvp', 'ivc', 'ra']);
const PLAIN_WORD: Readonly<Record<string, string>> = { ok: 'Normal', mid: 'High', hi: 'Very high' };
/** Where a portal flow is judged, in L/min (the summary table's own: ↓ under 0.9, ↑ over 1.3, the fasting range between; table-marks.js dirAbs). */
export const FLOW_NORMAL = [0.9, 1.3] as const;
/** The one platelet line Baveno VIII draws: ≥150 ×10³/µL is half of the CSPH rule-out (with an LSM ≤15 kPa). */
export const PLT_RULE_OUT = 150;
/** The HVPG fall that marks a response, by use: primary prophylaxis (and the acute IV propranolol test) ≥10%, secondary prophylaxis after a bleed ≥20%. */
export const RESPONSE_CUT = { primary: 10, acute: 10, secondary: 20 } as const;
export type ResponseRule = keyof typeof RESPONSE_CUT;

const STENT_WHY = 'a stent\'s readings change with the stent: neither better nor worse (table-marks.js NEUTRAL_CHANGE)';
/**
 * The tiles whose bar has no normal band, and why: a bar draws the normal range for every reading that has one (the test `tile-bars.test.ts` holds every tile of every deck to it), so a
 * tile is listed here only where no normal exists. A reason is required; the test fails when a listed tile does grow a normal band, or an unlisted one has none.
 */
export const NO_NORMAL: Readonly<Record<string, string>> = {
  tp: 'the protein of ascitic fluid is a risk marker (below 1.5 g/dL it no longer guards against infection), not a reading with a normal range',
  rpp: 'no guideline gives the abdominal perfusion pressure a cut-off (kidney-cuts.js)',
  // (the five readings of each stent, TIPS and DIPS)
  ...Object.fromEntries(['tips', 'dips'].flatMap((s) => ['Flow', 'Dp', 'Bench', 'Lumen', 'LocalPct'].map((x) => [s + x, STENT_WHY]))),
};

const NONE: Rating = Object.freeze([null, '']) as Rating;
const PLT_BELOW: Rating = Object.freeze(['info', `<${PLT_RULE_OUT}`]) as Rating;
// (a count at the rule-out line or above is normal: no word, but the green the bar's normal band and the dot wear)
const PLT_NORMAL: Rating = Object.freeze(['ok', '']) as Rating;

/** The tile's rating of a reading in state `f` (the 2D table's, less the three ratings above). */
export function rateOf(k: string, f: Fp | null | undefined): Rating {
  const v = f?.[k];
  if (MODEL_BANDED.has(k)) {
    const r = rateOf2d(k, f) as Rating;
    return r[0] && PLAIN_WORD[r[0]] ? [r[0], PLAIN_WORD[r[0]]!] : r;
  }
  if (OVER_RAW.has(k)) {
    const [amber, red] = RAW[k as 'fhvp'];
    return v == null ? NONE : v > red ? ['hi', PLAIN_WORD.hi!] : v > amber ? ['mid', PLAIN_WORD.mid!] : ['ok', PLAIN_WORD.ok!];
  }
  if (k === 'plt') return v == null ? NONE : v < PLT_RULE_OUT ? PLT_BELOW : PLT_NORMAL;
  // (portal flow: the summary table's arrows give the bands: stasis or reversed red, under 0.9 amber, the fasting range green, over 1.3 neutral gray: the gut being fed, not a disease)
  if (k === 'pvFlow') {
    if (v == null) return NONE;
    const r = rateOf2d(k, f) as Rating;
    return r[0] === 'hi' ? r : v < FLOW_NORMAL[0] ? ['mid', 'Reduced'] : v <= FLOW_NORMAL[1] ? ['ok', r[1]] : ['info', r[1]];
  }
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
  if (!MODEL_BANDED.has(k) && !OVER_RAW.has(k) && k !== 'plt' && k !== 'pvFlow' && k !== 'hvpgFall' && k !== 'hvpg' && k !== 'eus') return rateShown2d(k, f) as Rating;
  return f && f[k] != null ? rateOf(k, { ...f, [k]: tileShown(k, f[k]) }) : rateOf(k, f);
};

/** A tile's scale: from, to and the cut-off ticks between its bands, the 2D table's except the one platelet line, the response's own cut and the portal flow's fasting range. */
export function scaleOf(k: string, f?: Fp | null): Scale | undefined {
  const s: Scale | undefined = (SCALE2d as unknown as Record<string, Scale | undefined>)[k];
  if (!s) return s;
  if (k === 'pvFlow') return [s[0], s[1], [0, ...FLOW_NORMAL]];
  if (OVER_RAW.has(k)) return [s[0], s[1], [...RAW[k as 'fhvp']]];
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
