// The short form of the patient's name that the top pill shows on a phone. A preset's is cut by scenario-names.ts (copied from the 2D app, made for the presets' names:
// it cuts at the first comma, which turned "Cirrhosis, first bleed" into "Cirrhosis" and "Bleed, TIPS in 24 hours" into "Bleed"). A model patient has its own short form in its
// data (courses.ts), shown only while the pill still names the patient (a disease put on the case renames it "Custom"). Pure, so a test can hold every name to two lines.
import { shortName } from './scenario-names.ts';
import { historyName, historyShort } from '../histories/meta.ts';

export const pillShort = (patient: string, patientId: string | null | undefined): string => {
  const own = historyName(patientId);
  return own && patient === own ? historyShort(patientId) : shortName(patient || 'Custom');
};
