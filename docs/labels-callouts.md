# Labels, callouts and the HVPG subtraction (B6)

Everything the figure writes on itself lives in `src/scene/labels/`. This note is about the catheter's reading cards and the organ names.

## The catheter's cards (FHVP, WHVP, the stack)
- `cath.ts` is the pure layout and the 2D numbers (card size, one-shape outline, `placePills`, `placeStack`, `leadersOf`, `sumFlow`). Its placing files `cath2d/*.copied.js` are the 2D app's, copied by `scripts/copy-label-names.mjs`.
- `cath-show.ts` (`CathShow`) is the state machine: which cards stand for a catheter state (`calloutsFor`: free = FHVP; wedge = FHVP + WHVP; result = the stack), where (in the figure's free band, clear of cards and the key), and how they come and go with the 2D timings: a card in 420 ms with a 6 px rise, out in 240 ms; the result's readings travel 420 ms from where their cards stood, the bracket and leaders follow at 650 ms and the HVPG at 750 ms with a rise.
- `cath-dom.ts` builds the DOM once and writes only `transform` and `opacity` per frame. Opacity goes on a card's children, never on the card, so the blur sees the figure. The glass is `.cl-glass`, clipped from one path (the card and its pointer are one shape) with its 1 px hairline stroked inside; its tint and blur are `src/ui/glass.css`.
- The stack box is never shorter than 150 px (`STACK_MIN_H`): in 2D the bracket's `<svg>` has the default 150 px height, which sets the box's height. Copied, not corrected.
- The stack's row order and leaders are 2D's planner (`cath-leads.js`, copied by `scripts/copy-cath-leads.mjs` into `cath2d/`): the lower point's reading is the lower row, the other order only when the first crosses its leaders; `cath.ts planLeaders`.
- The cards stand steady (`tests/cath-cards-steady.test.ts`, Mohammad 20 Nov: they "keep flashing in and out"): a small move of the tip or the point ahead (a tilt, the camera following the tip, the scope bending) is carried, not a cut. The controller calls `show.ride(tip, ahead)` every frame and each card is drawn at its solved place plus how far its point has moved since; only a jump of more than `FOLLOW_JUMP` px (or a point appearing or vanishing) hides the cards. A card placed again with the same side and size glides to its new place (`GLIDE_TAU_MS`); only a card that flips side or changes size fades out and in. Its `key` is the glass shape, never the place.
- Under the catheter the figure's names are hidden, as in 2D (`cath-on`): `HIDE_UNDER_CATHETER` in `controller.ts` (kept on purpose: Mohammad, 19 Nov, "hide, 2D style, we can change stuff later").
- Tests: `tests/labels-cath.test.ts` (numbers), `tests/labels-cath-show.test.ts` (states, timings), `tests/labels-slice.test.ts` (every slide on every screen).

## Organ names
- `scripts/copy-organ-names.mjs --from <2D checkout> [--check]` copies the organ outlines and `organ-names.js` into `organ2d/`. `organ-screen.ts` projects the outlines to the canvas each solve (the silhouettes), so a name that stands beside its organ is judged by them and every name keeps off the other organs where it can; the solver steps a name under a vessel to the next spot of its own organ (`nameSpots`) and never leaves a name off for standing on another organ.

## Not done
- The monitor's WHVP - FHVP trace callout (B11 owns it; `trace-callouts.js`).
- On the sideways phone the figure is framed in a strip of about 150 px beside the centred wallet card, so the least important station names drop there, as 2D's do.
