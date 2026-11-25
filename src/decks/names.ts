// THE NAME TABLE: every name a slide, a chip, a chart or a table shows for a cause of portal hypertension, for one of the three places along the blood's route, and for an
// abbreviation, is written here once. (Capture 36b7deac review, items 3 and 6: "PRE / INTRA / POST over the chart clash with the Pre- / Intra- / Post-sinusoidal axis"; "right heart failure is
// also Heart, Heart failure and Cardiac; SOS is also Sinusoidal obstr. synd.; abbreviations are used before they are defined".)
//
// Who reads it: the two profile charts' zone strip (their generators put these words in: scripts/names-edits.mjs), every deck generator (the same module walks each deck's words and puts the
// cause's long or short name in wherever a chip, a plane point, a ladder or a table row names that cause, and spells an abbreviation out where the deck first uses it), and
// tests/names-table.test.ts, which fails when a copied deck, a chart or the table disagree. Pure data: no import, so the generators in node can read it as the app does.
//
// A clinical term is not changed here: the long names are the ones the decks already used in full ("Portal vein thrombosis", "Sinusoidal obstruction syndrome", "Budd–Chiari syndrome",
// "Right heart failure"); the short names are the ones the decks already used where room is short, made one per cause.

/** The three places along the route, over the pressure profile and the same words the first slide's outline says ("Before the liver", "In the liver", "After the liver").
 *  `one`: the whole name, set on one line when all three fit; `word`: the one word that stands alone where they do not (never a bare Pre-, Intra- or Post-, which read as
 *  the stations' own sub-labels under the axis); `second`: what follows `word` on a second line; `clinical`: the term the kickers and the tables keep. */
export interface LiverZone { readonly id: 'before' | 'in' | 'after'; readonly one: string; readonly word: string; readonly second: string; readonly clinical: string }
export const LIVER_ZONES: readonly [LiverZone, LiverZone, LiverZone] = [
  { id: 'before', one: 'Before the liver', word: 'Before', second: 'the liver', clinical: 'Pre-hepatic' },
  { id: 'in', one: 'In the liver', word: 'Liver', second: 'the liver', clinical: 'Intrahepatic' },
  { id: 'after', one: 'After the liver', word: 'After', second: 'the liver', clinical: 'Post-hepatic' },
];

/** The words the chart's axis puts under the three liver stations. A zone's header may never be one of these (nor the other way round). */
export const STATION_SUBLABELS: readonly string[] = ['Pre-', 'Intra-', 'Post-', 'Pre', 'Intra', 'Post'];

/** A cause, by name: `long` where the room is, `short` where it is not (a chip, a point on the plane); `abbr` when `short` is an abbreviation, which a deck spells out where it first uses it.
 *  `site`: the level the cause lies at (the table's tab). `aliases`: every other spelling the 2D decks used for it, all folded into `long` and `short` when a deck is copied. */
export interface Cause { readonly id: string; readonly long: string; readonly short: string; readonly abbr?: string; readonly site: string; readonly aliases: readonly string[] }
export const CAUSES: readonly Cause[] = [
  { id: 'pvt', long: 'Portal vein thrombosis', short: 'PVT', abbr: 'PVT', site: 'Pre-hepatic', aliases: ['Clot'] },
  { id: 'schisto', long: 'Schistosomiasis', short: 'Schisto', site: 'Presinusoidal', aliases: [] },
  { id: 'cirrhosis', long: 'Cirrhosis', short: 'Cirrhosis', site: 'Sinusoidal', aliases: [] },
  { id: 'sos', long: 'Sinusoidal obstruction syndrome', short: 'SOS', abbr: 'SOS', site: 'Postsinusoidal', aliases: ['Sinusoidal obstruction', 'Sinusoidal obstr. synd.'] },
  { id: 'bcs', long: 'Budd–Chiari syndrome', short: 'Budd–Chiari', site: 'Post-hepatic', aliases: [] },
  { id: 'rhf', long: 'Right heart failure', short: 'Heart failure', site: 'Cardiac', aliases: ['Heart failure', 'Heart'] },
];

/** A cause's name, any spelling in (a long name, a short name, an alias), or undefined. Exact, whole-string, and case as written. */
export function causeOfName(name: string): Cause | undefined {
  return CAUSES.find((c) => c.long === name || c.short === name || c.aliases.includes(name));
}

/** The abbreviations the app prints, each with the words it stands for. A card that prints one defines it, once, where its talk first uses it (the generators spell the cause
 *  abbreviations out; tests/abbreviations-first-use.test.ts counts the others and lets that count only fall). */
export const ABBREVIATIONS: Readonly<Record<string, string>> = {
  SOS: 'sinusoidal obstruction syndrome',
  PVT: 'portal vein thrombosis',
  PV: 'portal vein',
  RHV: 'right hepatic vein',
  IVC: 'inferior vena cava',
  RA: 'right atrium',
  HVPG: 'hepatic venous pressure gradient',
  PPG: 'portal pressure gradient',
  WHVP: 'wedged hepatic venous pressure',
  FHVP: 'free hepatic venous pressure',
  SAAG: 'serum–ascites albumin gradient',
  CSPH: 'clinically significant portal hypertension',
  TIPS: 'transjugular intrahepatic portosystemic shunt',
  PSVD: 'porto-sinusoidal vascular disorder',
  LSM: 'liver stiffness measurement',
};
