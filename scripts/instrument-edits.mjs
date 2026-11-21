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

/** The deck's JSON text with the instrument words put in. */
export function instrumentEdits(json) {
  let out = json;
  for (const [from, to] of WORD_EDITS) out = out.split(from).join(to);
  return out.replace(TENSE_LINES, '$1"iap"$2IAP$3');
}
