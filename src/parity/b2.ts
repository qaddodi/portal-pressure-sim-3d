// B2 (patients and model controls): the 20 patients of the menu's Patients tab, derived from the list the menu renders (menu/library.ts patientGroups), each loaded by `loadPatient`
// (ui/patients). History, Compare, Undo and Why? are controls the shell batch (B1) owns rows for: they are wired through their features (ui/shell/features.ts) and B1's claims
// flip with them (parity/b1.ts), so nothing is claimed twice here.
import { patientGroups } from '../ui/menu/library.ts';
import type { Claim } from './claim.ts';

export const claims: readonly Claim[] = patientGroups().flatMap((g) => g.patients.map((p) => ({ id: `preset:${p.id}`, wired: true })));
