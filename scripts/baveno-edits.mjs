// Where the 3D app's deck words depart from the 2D copies on purpose (Mohammad, 21 Nov 2026: "we're good to depart from 2D, because this app is becoming better";
// review findings 6 and 17, Baveno VIII 1.14 to 1.16 and 7.4). Every deck generator (copy-decks.mjs, copy-decks-ag.mjs, port-decks-hp.mjs, port-decks-rw.mjs) runs its
// JSON through bavenoEdits() before it hashes and writes, so a re-copy from 2D keeps them. tests/baveno-wording.test.ts locks the result.
import { sourceEdits } from './source-edits.mjs';
import { namesEdits } from './names-edits.mjs';
const LSM_SCOPE = 'in viral or alcohol-related cACLD and in MASLD-related cACLD with a BMI <30';
const LSM_SHORT = '(viral or alcohol-related cACLD, or MASLD-related cACLD with a BMI <30; otherwise the stiffness pathway)';
const LSM_PAREN = '(only in viral or alcohol-related cACLD, or MASLD-related cACLD with a BMI <30; the stiffness pathway covers other cases)';
const RECOMP = 'The cause is removed, controlled or suppressed; there is no ascites on imaging off diuretics and no clinical HE off HE therapy (lactulose, rifaximin or LOLA), all three for >6 consecutive months (diuretics or HE therapy given for another indication do not count against this); if bleeding was the decompensating event, there is no recurrent variceal bleeding (carvedilol or an NSBB may be continued); and liver function is consistent with Child–Pugh A5 or A6 (Baveno VIII 7.4).';

/** [text in the 2D deck, the 3D text, how many times it must occur in the file that holds it (0 when this deck does not have it)]. */
export const EDITS = [
  ['An HVPG of 1 to 5 mmHg is normal, and 6 to 9 mmHg is subclinical portal hypertension', 'An HVPG of 1 to 5 mmHg is normal, and an HVPG >5 to <10 mmHg is subclinical portal hypertension'],
  ['Normal is 1 to 5 mmHg, and 6 to 9 mmHg is subclinical.', 'Normal is 1 to 5 mmHg, and >5 to <10 mmHg is subclinical.'],
  ['An HVPG of 6 to 9 mmHg is subclinical', 'An HVPG >5 to <10 mmHg is subclinical'],
  ['Noninvasively, an LSM ≥25 kPa by VCTE rules in CSPH;', `Noninvasively, by VCTE an LSM ≥25 kPa rules in CSPH only ${LSM_SCOPE}; for other etiologies or a BMI ≥30 follow the stiffness pathway (Baveno VIII 1.14 to 1.16);`],
  ['and an LSM ≥25 kPa rules in CSPH (Baveno VIII).', `and an LSM ≥25 kPa rules in CSPH ${LSM_SCOPE} (Baveno VIII 1.16; other cases follow the stiffness pathway).`],
  ['and by a liver stiffness ≥25 kPa, varices or collaterals', `and by a liver stiffness ≥25 kPa ${LSM_PAREN}, varices or collaterals`],
  ['so are a liver stiffness measurement (LSM) ≥25 kPa, varices', `so are a liver stiffness measurement (LSM) ≥25 kPa ${LSM_PAREN}, varices`],
  ['an HVPG ≥10 mmHg, or an LSM ≥25 kPa, varices or collaterals (Baveno VIII 3.2).', `an HVPG ≥10 mmHg, or an LSM ≥25 kPa ${LSM_SHORT}, varices or collaterals (Baveno VIII 3.2).`],
  ['an HVPG ≥10 mmHg, an LSM ≥25 kPa, varices or collaterals, or a model such as ANTICIPATE ≥75%.', `an HVPG ≥10 mmHg, an LSM ≥25 kPa ${LSM_SHORT}, varices or collaterals, or a model such as ANTICIPATE ≥75%.`],
  ['The cause is removed, controlled or suppressed; there is no ascites on imaging off diuretics, no clinical HE off lactulose, rifaximin or LOLA and no recurrent variceal bleeding (carvedilol allowed), all for >6 consecutive months; and liver function is back to Child–Pugh A5 or A6.', RECOMP],
  ['Not on the numbers alone. He also needs no ascites off diuretics, no HE off lactulose or rifaximin and no rebleeding for >6 consecutive months, and liver function back to Child–Pugh A5 or A6.', 'Not on the numbers alone. The cause must be controlled, and he needs no ascites off diuretics and no clinical HE off HE therapy for >6 consecutive months, no recurrent variceal bleeding if bleeding was a decompensating event, and liver function consistent with Child–Pugh A5 or A6 (Baveno VIII 7.4).'],
  ['The cause removed, suppressed or cured; no ascites or encephalopathy off treatment and no recurrent variceal bleeding for >6 months; and liver function back to Child–Pugh A.', 'The cause is removed, controlled or suppressed; no ascites on imaging off diuretics and no clinical HE off HE therapy, all three for >6 consecutive months; no recurrent variceal bleeding if bleeding was the decompensating event; and liver function consistent with Child–Pugh A5 or A6 (Baveno VIII 7.4).'],
  ['after a variceal bleed, no recurrent variceal bleeding (carvedilol or an NSBB may be continued); these for >6 consecutive months; and liver function', 'the cause, the ascites and the HE criteria each for >6 consecutive months; after a variceal bleed, no recurrent variceal bleeding (carvedilol or an NSBB may be continued); and liver function'],
  ['no ascites off diuretics, no HE off treatment and no rebleeding for >6 consecutive months, and Child–Pugh A5 or A6 (7.4)', 'no ascites off diuretics and no HE off treatment for >6 consecutive months, no rebleeding if bleeding was a decompensating event, and Child–Pugh A5 or A6 (7.4)'],
];

/** The deck's JSON text with the 3D wording put in (an edit the deck does not hold is skipped; JSON.stringify leaves these strings as they are). */
export function bavenoEdits(json) {
  let out = json;
  for (const [from, to] of EDITS) out = out.split(from).join(to);
  // (then the name table: one long and one short name per cause, a cause's abbreviation spelled out where the talk first uses it; scripts/names-edits.mjs)
  return namesEdits(sourceEdits(out));
}
