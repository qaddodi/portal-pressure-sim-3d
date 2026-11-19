// The registry entry of the path chart (one file per chart, so the threads that port the charts never edit the same lines of registry.ts).
// Its specimens are the patients of real deck slides (the 2D decks' tool { kind: 'path', of, patient }), with made-up readings: a look, not a patient.
import type { ChartKind, Specimen } from '../registry.ts';
import { pathFrame } from './frame.ts';
import { patientOf } from './model.ts';

const specimen = (id: string, label: string, of: string, patient: Record<string, unknown>, phone = false): Specimen => ({
  id, label, build: (c) => pathFrame({ of, patient: patientOf(of, patient, null), opts: { phone } }, c),
});

export const pathEntry: ChartKind = {
  kind: 'path', what: 'Guideline path map', slides: 33, status: 'done',
  specimens: [
    specimen('first-visit', 'Baveno VIII first visit: stiffness 18 kPa, platelets 128 (indeterminate zone)', 'first-visit', { lsm: 18, plt: 128, bmi: false, ant: false }),
    specimen('holdcarv', 'Carvedilol held for a low pressure: the path lit', 'holdcarv', { held: true, hrs: false }),
    specimen('grid', 'Long-term anticoagulation grid (two questions, one cell)', 'pvtgrid', { r: 'yes', c: 'maj' }),
    specimen('ladder', 'Cirrhosis stages, patient at stage 2', 'ladder', { s: 1, rc: false }),
  ],
};
