// The short form of the patient's name that the top pill shows on a phone: ONE rule for every name, two lines of 15 characters at most.
//   a preset: scenario-names.ts shortName (copied from the 2D app and made for the presets' names; "Decomp. cirrhosis")
//   a model patient: its own short form in its data (courses.ts `short`), shown only while the pill still names the patient (a disease put on the case renames it "Custom")
//   any other name (a patient you saved, a name nobody planned for): the whole name when it fits two lines; else what comes before its first comma or bracket when that fits;
//     else its words as far as two lines hold, with an ellipsis. Never a cut at the first comma first:
//     that turned "Cirrhosis, first bleed" into "Cirrhosis" and a saved "Mr Smith, 54, TIPS" into "Mr Smith".
// Pure, so a test can hold every name to the rule.
import { shortName, linesOf } from './scenario-names.ts';
import { historyName, historyShort } from '../histories/meta.ts';
import { UI } from '../strings.generated.ts';

/** A name of your own in two lines or fewer: whole, else its head, else as many words as fit with an ellipsis. */
export function fitTwoLines(name: string): string {
  const full = name.trim().replace(/\s+/g, ' ');
  if (linesOf(full) <= 2) return full;
  const head = full.replace(/\s*\(.*\)$/, '').replace(/,.*$/, '');
  if (head && linesOf(head) <= 2) return head;
  let out = '';
  for (const w of full.split(' ')) { if (linesOf(`${out} ${w}…`.trim()) > 2) break; out = `${out} ${w}`.trim(); }
  return `${out || full.split(' ')[0]}…`;
}

export const pillShort = (patient: string, patientId: string | null | undefined): string => {
  const own = historyName(patientId);
  if (own && patient === own) return historyShort(patientId);
  if (!patient) return 'Custom';
  return UI.presets.some((p) => p.label === patient) ? shortName(patient) : fitTwoLines(patient);
};
