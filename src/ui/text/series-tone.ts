// One colour per number (owner's ruling L13, 27 Nov 2026, review 3531bdfa F-D6): a reading wears its SERIES colour wherever it is printed or drawn: the words, the data card's tile and header,
// the chart and the figure's label. The series colours are the charts' own table (charts/plot/reading-colours.generated.js READING_COLOUR: one token per reading, the 2D app's);
// this module is the one place the words, the tiles and the figure ask it, so a number cannot stand in two colours. Its rating is told by its word, its bar and its arrow, never
// by the number's colour. Pure; tests/one-colour-per-number.test.ts judges it over every deck.
import { READING_COLOUR } from '../charts/plot/reading-colours.generated.js';

const TABLE = READING_COLOUR as Record<string, string | undefined>;

/** A reading's series colour token (with its leading dashes, '--tr-hvpg'), or null for a reading no chart draws in a colour of its own (a rating word, a count). */
export const seriesToken = (k: string): string | null => TABLE[k] ?? null;
/** The same colour as a text ink (the theme's own mix of the series colour with the text: legible on glass in every look); null where there is no series. */
export const seriesInk = (k: string): string | null => { const t = seriesToken(k); return t ? `var(${t}-ink)` : null; };

/** The figure's stations that print a reading, by the reading they print (2D station ids and the slide-term ids that point at them). */
export const STATION_READING: Readonly<Record<string, string>> = {
  CONF: 'pv', pv: 'pv', SIN_R: 'sin', sin: 'sin', whvp: 'whvp', RHV: 'fhvp', fhvp: 'fhvp', IVCS: 'ivc', ivc: 'ivc', RA: 'ra', ra: 'ra',
};
/** The colour a station's label (and the word that points at it) wears: the series colour of the reading it prints, else the 2D station tone. */
export const labelTone = (target: string, tone: string): string => {
  const r = STATION_READING[target], series = r ? seriesToken(r) : null;
  // (the 2D station tone is spelled 'pv' where the table says '--tr-pv': the same colour keeps the 2D spelling)
  return series && series !== `--tr-${tone}` ? series : tone;
};
/** What a printed number (a tile's, a header's) carries to wear its series ink: `data-series` and `--vc` (nothing for a reading with no series colour, which keeps its rating's ink). */
export const seriesAttrs = (k: string): { 'data-series'?: string; style?: Record<string, string> } => {
  const ink = seriesInk(k);
  return ink ? { 'data-series': '', style: { ['--vc']: ink } } : {};
};
