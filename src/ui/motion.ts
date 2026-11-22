// The motion scale in TS: the face of 2D's tokens.css (--d-flip, --d-small, --d-surface; --ease-arrive, --ease-move, --ease-in). Every TS file that times or eases a
// thing in the page imports from here, and the CSS reads the custom properties: there is no third copy. tests/ui-vocabulary.test.ts parses tokens.css and fails when
// the two differ, and fails a `cubic-bezier(` literal anywhere else in the 3D-only UI. Pure: no DOM, no imports, so a node test loads it.
//   D_FLIP     a state changes: pressed, lit, on, a colour swap, a hover, a close
//   D_SMALL    a word, a chip, a row, a tooltip, a text swap, a popover
//   D_SURFACE  a card, a sheet, a menu, the figure's dim, a lens crossfade
//   EASE_ARRIVE for what comes in (quick off the mark, settling gently), EASE_MOVE for what travels (symmetric), EASE_IN for what leaves.
// A time that is deliberately its own pace is named where it lives and carries an "own pace" comment (tokens.css describes the rule).

/** ms, = tokens.css --d-flip. */
export const D_FLIP = 120;
/** ms, = tokens.css --d-small. */
export const D_SMALL = 240;
/** ms, = tokens.css --d-surface. */
export const D_SURFACE = 420;
/** = tokens.css --ease-arrive. */
export const EASE_ARRIVE = 'cubic-bezier(.2, .8, .2, 1)';
/** = tokens.css --ease-move. */
export const EASE_MOVE = 'cubic-bezier(.5, 0, .5, 1)';
/** = tokens.css --ease-in. */
export const EASE_IN = 'cubic-bezier(.4, 0, 1, 1)';
/** own pace: the card rail's curve (2D's rail: old cards ride out, new ones come in; cards/rail.ts easeRail is the same curve as a function). */
export const EASE_RAIL = 'cubic-bezier(.32, .72, 0, 1)';
/** own pace: a frame or two on top of a leave's CSS time before its element is unmounted, so the leave is never cut short by the unmount. */
export const LEAVE_SLACK_MS = 60;
