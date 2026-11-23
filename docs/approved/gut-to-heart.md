# Approved: Gut to Heart chart spacing (the pressure profile card)

**Reference:** option 4, "All three together", of the Gut to Heart mocks (`/mnt/project-files/gut-to-heart-mocks/gut-to-heart-spacier-options.png`); the built result is `before-after-real-code.png` beside it, commit 7d02d669. Mohammad, 23 Nov 2026: "this top card can use some space somehow ... without fucking the card height", then "do all".

## Traits
- The card's height and the chart's height floor (`need`) are the 2D tool's, unchanged; fonts unchanged. The room goes to the plot (about 55 %) and to air between the bracket rows (about 45 %). `profileGeo` in `src/ui/charts/profile/model.ts` wraps the 2D layout.
- Zone names are one word on one line: PRE, INTRA, POST ("HEPATIC" dropped).
- "sinusoidal" stands in a bracket on the row under the station names (ticks up at the ends, the bar broken round the word, like HVPG and PPG), replacing the curly brace and its row.
- No "mmHg" and no axis numbers; the gridlines stay, bare, every other one (the 10s). Every point carries its own number.
- No "Healthy" word on the line when the line is the healthy one (the dashed line lies under it); any other state still names it.
- Chart words keep the outline halo, never a box.

## Rejected / not built
- Options 1 to 3 alone (zones only; zones plus quiet axis; sinusoidal bracket only): he took all of them together.

## Never
- A box behind a word, a pill or chip, a taller card to buy space, a smaller font.
