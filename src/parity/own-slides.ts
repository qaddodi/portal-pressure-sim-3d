// The slides the 3D app holds that the 2D deck does not: put in by a review of the owner's (scripts/source-edits.mjs, VARICES_REVIEW, 24 Nov 2026). The 2D inventory has no row for them, so the
// parity tracker (which measures the 3D app against the 2D one) claims none; tests/decks-rw-copy.test.ts holds this list to the patches, so a new one is named here or the test fails.
export const OWN_3D_SLIDES: readonly string[] = ['varices/gastric', 'varices/redwale', 'varices/primary', 'varices/secondary'];
