// The slides the 3D app holds that the 2D deck does not: put in by a review of the owner's (scripts/source-edits.mjs, VARICES_REVIEW, 24 Nov 2026).
// The 2D inventory has no row for them, so, like the figure's pictures (b4-rows.ts), they keep rows of their own: the batch that carries the deck
// claims them (b13c.ts) and the score reads the rows beside the inventory's. tests/decks-rw-copy.test.ts holds this list to the patches,
// so a new one is named here or that test fails.
import type { Row } from './score.ts';

export const OWN_3D_SLIDES: readonly string[] = ['varices/gastric', 'varices/redwale', 'varices/primary', 'varices/secondary'];
export const OWN_SLIDE_ROWS: readonly Row[] = OWN_3D_SLIDES.map((id) => (
  { id: `slide:${id}`, area: 'slide', batch: 'B13c', label: `${id.split('/')[1]} (a slide the 3D talk adds)` }
));
