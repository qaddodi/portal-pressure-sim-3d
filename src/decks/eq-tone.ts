// The colour of an equation's term (owner, 27 Nov 2026: "P left portal vein should be coloured pink like the callout"): a term that names a station wears that station's
// colour wherever the formula is printed, as the figure's callout for it does. ONE place decides it, by what the term NAMES (its words), never by a class a deck's author
// remembered to write: the EUS-PPG's portal-vein term was written with eq-pv and still printed plain, and the PPG's in two decks was written with none. Pure; no imports,
// so the deck reader (hp/deck.ts), the card (cards/TeachingCard.tsx) and tests/eq-term-colours.test.ts all ask it.

/** The tones an equation term can wear: the trace's own five (tokens.css --tr-*-ink). 'free' is the hepatic vein's, as the ladder spells it. */
export type EqTone = 'wedge' | 'free' | 'pv' | 'ivc' | 'var';

/** Each tone's class on the card (app-04-presenter.css `.pz-eq .eq-*`) and the series token it draws, the charts' own table (READING_COLOUR) spelling. */
export const EQ_TONES: Readonly<Record<EqTone, { cls: string; token: string }>> = {
  wedge: { cls: 'eq-wedge', token: '--tr-wedge' },
  free: { cls: 'eq-hv', token: '--tr-hv' },
  pv: { cls: 'eq-pv', token: '--tr-pv' },
  ivc: { cls: 'eq-ivc', token: '--tr-ivc' },
  var: { cls: 'eq-var', token: '--tr-var' },
};

/** A tone's class on the card. */
export const eqClassOf = (tone: EqTone | undefined): string | undefined => (tone ? EQ_TONES[tone].cls : undefined);

/** The tone an authored class asks for (`eq-pv` in a deck's MathML), or none. */
export function eqToneOfClass(cls: string): EqTone | undefined {
  for (const [tone, d] of Object.entries(EQ_TONES) as [EqTone, { cls: string }][]) if (new RegExp(`(^|\\s)${d.cls}(\\s|$)`).test(cls)) return tone;
  return undefined;
}

/** The tone a term's NAME asks for: its subscript when it has one (P with "left portal vein" below), else its text (WHVP). Resistances take their tracts' (liver the sinusoids', collaterals the varices'). */
export function eqToneOfName(text: string, sub?: string): EqTone | undefined {
  const name = (sub ?? text).toLowerCase();
  if (text === 'R' && sub) return /^liver$/i.test(sub) ? 'wedge' : /^collaterals?$/i.test(sub) ? 'var' : undefined;
  if (/\bwhvp\b|\bwedge[d]?\b/.test(name)) return 'wedge';
  if (/\bfhvp\b|hepatic ven|^[lrm]?hv$/.test(name)) return 'free';
  if (/portal vein|^[lr]?pv$/.test(name)) return 'pv';
  if (/\bivc\b|vena cava/.test(name)) return 'ivc';
  return undefined;
}

/** A term's tone: what it names, else the class its author wrote. */
export const eqToneOf = (text: string, sub: string | undefined, cls: string): EqTone | undefined => eqToneOfName(text, sub) ?? eqToneOfClass(cls);

/** A stretch of a printed formula: its words, and the tone of the station they name (none for a sign, a gradient or a plain word). */
export interface EqSeg { s: string; tone?: EqTone }
/** A caption's plain stretch with the station names in it (LPV, LHV, PV, IVC, WHVP, FHVP, HV) cut out in their tones: a printed formula's terms wear their callouts' colours, as the teaching card's do. */
export function toneWords(text: string): EqSeg[] {
  return text.split(/\b([LRM]?PV|[LRM]?HV|IVC|WHVP|FHVP)\b/).map((s, i): EqSeg => {
    const tone = i % 2 ? eqToneOfName(s) : undefined;
    return tone ? { s, tone } : { s };
  }).filter((x) => x.s);
}
/** A reading's number as the formula prints it, in its station's tone. */
export const toneNumber = (s: string, tone: EqTone): EqSeg => ({ s, tone });
/** The segments as the plain string they were cut from. */
export const segText = (segs: readonly EqSeg[]): string => segs.map((x) => x.s).join('');
