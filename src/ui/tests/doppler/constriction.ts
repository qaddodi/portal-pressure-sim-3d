// The hepatic vein's pattern word in constrictive pericarditis (owner, 27 Nov 2026, C12). The copied reading names a hepatic vein "Triphasic" (and says "Normal: the atrial a-wave briefly reverses
// flow each beat") whenever the trace reverses between its forward waves, which a constricted pericardium also does, so the slide that teaches constriction showed the word for a normal vein.
// The model's constricted vein has two forward waves of about the same height (S and D) with a reversal that deepens with the breath (tests/doppler-constriction.test.ts), so it reads
// "W pattern", with its own note. The constriction is the patient's own parameter (0 to 1, `pericardial`), never a slide's name; the cut is the model's, below which nothing is constricted.
export const CONSTRICTED_FROM = 0.3;
export const W_PATTERN = 'W pattern';
export const W_NOTE = 'Constriction: the S and D waves are both prominent and the reversal deepens with each breath, more than the normal a-wave alone.';

interface Words { dir: string; sev: string; pattern: string; note: string; out?: boolean }

/** The reading's words, with the hepatic vein's "Triphasic" replaced by the constricted vein's own word when the patient's pericardium
 *  is constricted. Anything else comes back as it is (no copy made). */
export function hepaticWords<T extends Words>(it: T, kind: string, params: { pericardial?: number } | null | undefined): T {
  if (kind !== 'hepatic' || it.pattern !== 'Triphasic' || !((params?.pericardial ?? 0) >= CONSTRICTED_FROM)) return it;
  return { ...it, pattern: W_PATTERN, note: W_NOTE };
}
