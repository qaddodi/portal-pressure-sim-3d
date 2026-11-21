// Where the 3D app's deck words use an instrument the 2D deck has no word for (Mohammad, 22 Nov 2026: the review round's R3, "IAP becomes a reading a slide can name").
// Every deck generator runs its JSON through instrumentEdits() after bavenoEdits() (scripts/baveno-edits.mjs, the wording edits, which this file leaves alone), so a re-copy
// from 2D keeps them. tests/instrument-words.test.ts locks the result.
//
// The IAP: the engine's fingerprint carries it (`iap`, hales-engine a9bf565a) and the tile table has it (scripts/copy-chart-tokens.mjs EXTRA_TILES), so a line can say `{iap}`
// and print the number the abdomen card's dial shows. The four slides that teach APP = MAP − IAP name it now.

/** [text in the 2D deck, the 3D text]: a plain string swap (an edit the deck does not hold is skipped). */
export const WORD_EDITS = [
  // kidney/pressure: the definition's worked case names both numbers it subtracts
  ['At a blood pressure of {map}, the abdominal perfusion pressure (APP) is {rpp}.', 'At a blood pressure of {map} and an IAP of {iap}, the abdominal perfusion pressure (APP) is {rpp}.'],
  // kidney/tense: the story is the IAP rising, so the line says it
  ['Four months later, {asc} of ascites has accumulated, and the APP falls from {rpp@pressure} to {rpp}.', 'Four months later, {asc} of ascites has accumulated. The IAP rises from {iap@pressure} to {iap}, so the APP falls from {rpp@pressure} to {rpp}.'],
  // kidney/tap: draining the ascites brings the IAP down first
  ['drains the ascites to {asc}, so the IAP falls and the APP rises to {rpp}.', 'drains the ascites to {asc}, so the IAP falls to {iap} and the APP rises to {rpp}.'],
  // ascites/tense: the abdomen card's own line gives its two pressures
  ['Tense ascites raises the intra-abdominal pressure (IAP), which compresses the renal veins and lowers the abdominal perfusion pressure (APP).', 'Tense ascites raises the intra-abdominal pressure (IAP) to {iap}, which compresses the renal veins and lowers the abdominal perfusion pressure (APP) to {rpp}.'],
  // kidney/tense's chart: the IAP is the APP's partner (both mmHg, one scale), not the ascites volume
  ['"title": "APP and ascites over four months"', '"title": "APP and IAP over four months"'],
];

/** The flow-time chart of kidney/tense plots the APP and the IAP (its second line was the ascites volume). Matched by its shape, whatever the file's indent. */
const TENSE_LINES = /("rpp",\s*)"asc"(\s*\],\s*"keepTiles": true,\s*"title": "APP and )(?:ascites|IAP)( over four months")/;

// The slides that play a Treat order on the figure (R4: EVL, balloon tamponade, DIPS, DSRS, paracentesis; src/scene/procedures/instrument-specs.ts). Each already has the order's result as its state;
// its `procedure` is what plays it. `deck/slide`: the kind.
export const PROCEDURE_SLIDES = {
  'variceal-bleed/band': 'evl', 'next-bleed/bands': 'evl', 'ten-years/bands': 'evl',
  'variceal-bleed/bridge': 'tamponade',
  'tips-complete/dips': 'dips',
  'shunts/dsrs': 'dsrs',
  'ascites/lvp': 'paracentesis', 'kidney/tap': 'paracentesis', 'albumin/tap': 'paracentesis',
};

/** Puts `procedure` on the slides above (a slide that has one keeps it); the JSON is written back with the indent it came in. */
function procedureEdits(json) {
  let deck;
  try { deck = JSON.parse(json); } catch { return json; }
  if (!deck || !Array.isArray(deck.slides) || typeof deck.id !== 'string') return json;
  let hit = false;
  for (const sl of deck.slides) {
    const kind = PROCEDURE_SLIDES[`${deck.id}/${sl.id}`];
    if (kind && sl.procedure == null) { sl.procedure = kind; hit = true; }
  }
  if (!hit) return json;
  const indent = /^\{\n( +)"/.exec(json)?.[1].length ?? 1;
  return JSON.stringify(deck, null, indent);
}

/** The deck's JSON text with the instrument words and procedures put in. */
export function instrumentEdits(json) {
  let out = json;
  for (const [from, to] of WORD_EDITS) out = out.split(from).join(to);
  return procedureEdits(out.replace(TENSE_LINES, '$1"iap"$2IAP$3'));
}
