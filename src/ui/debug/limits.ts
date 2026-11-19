// The owner's standing numbers that the judges hold the screen to, named once with their date, their exceptions and their words (the 2D app's
// selfcheck/limits.js, with the 3D app's own sources: layout/device.ts FLOORS and the labels' DIM_ALPHA). A judge imports its number from here; the words in
// a finding are made from the same numbers, so they cannot disagree. `npm run debug -- limits` and docs/debug.md print the table. Pure: no DOM, no page.
import { FLOORS } from '../layout/device.ts';
import { DIM_ALPHA } from '../../scene/labels/alpha.ts';

export { DIM_ALPHA };
/** Data-card lettering is never under this (owner, 17 Nov 2026, ffa2bfba): no exception since the wallet replaced the Shuffle on a sideways phone. */
export const WORDS_MIN_PX = FLOORS.data;
/** A slide title is at least this many times its words (owner, 17 Nov 2026, 0dcbf220). */
export const TITLE_RATIO = FLOORS.titleRatio.floating;
/** A phone's stacked or sideways slide may stand at this (owner, 19 Nov 2026: "1.33 is OK if text needs more space"). */
export const PHONE_TITLE_RATIO = FLOORS.titleRatio.stacked;
/** Sizes are measured to a tenth of a pixel: the least ratio that passes is a hair under the rule. */
export const RATIO_TOLERANCE = 0.02;
/** The teaching card's body, shrunk to fit, is a failure (owner, 17 Nov 2026, 2a8217e3): it may stand at most this far under its role size (rounding). */
export const BODY_SHRINK_TOLERANCE_PX = 0.3;
/** Empty glass allowed above the first line or below the last of a card. */
export const BLANK_MAX = 24;
/** A text colour against the surface it stands on (WCAG 2.2 AA, docs/accessibility.md). */
export const CONTRAST_TEXT = 4.5;

export const wording = {
  small: `lettering under ${WORDS_MIN_PX} px`,
  ratio: `the title is under ${TITLE_RATIO} times the words (${PHONE_TITLE_RATIO} on a phone)`,
};

export interface Limit { id: string; value: number; unit: string; since: string; rule: string; exceptions: string }
export const LIMITS: readonly Limit[] = Object.freeze([
  { id: 'words-floor', value: WORDS_MIN_PX, unit: 'px', since: '17 Nov 2026', rule: 'Lettering on a card is never under this on the screen (data-card text, ffa2bfba).', exceptions: 'none (the wallet replaced the Shuffle, 19 Nov 2026)' },
  { id: 'title-ratio', value: TITLE_RATIO, unit: 'x the body', since: '17 Nov 2026', rule: 'A slide title is at least this many times its words (0dcbf220).', exceptions: `A phone's slide: ${PHONE_TITLE_RATIO} when the words need the space (19 Nov 2026).` },
  { id: 'body-never-shrinks', value: BODY_SHRINK_TOLERANCE_PX, unit: 'px under the role size', since: '17 Nov 2026', rule: "The teaching card's body text never shrinks to fit (2a8217e3): the figure and the top card yield instead.", exceptions: 'none' },
  { id: 'label-dim', value: DIM_ALPHA, unit: 'alpha', since: '16 Nov 2026', rule: 'Dim labels step back to one value everywhere (scene/labels/alpha.ts).', exceptions: 'none' },
  { id: 'blank-glass', value: BLANK_MAX, unit: 'px', since: '18 Nov 2026', rule: 'A card stands no more empty glass than this above its first line or below its last.', exceptions: 'none' },
  { id: 'text-contrast', value: CONTRAST_TEXT, unit: ': 1', since: '11 Nov 2026', rule: 'Every text colour measures at least this against every surface it sits on, in every look (WCAG 2.2 AA).', exceptions: 'Faint potential-collateral ghosts are decorative until switched on (docs/accessibility.md).' },
]);
