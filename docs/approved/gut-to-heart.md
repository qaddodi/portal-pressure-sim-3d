# Approved: Gut to Heart chart spacing (the pressure profile card)

**Round 2 (24 Nov, Mohammad picked option 2, `/mnt/project-files/gut-heart-mocks-24nov/tight-brackets-no-title-eus.png`):** the bracket rows stand about 20 px apart (they stood 29), the card's "GUT TO HEART" title is dropped (it stays in the page, unseen, out of the flow: `.pz-dh.off`), and the chart is as much taller as the title and its gap were, so the card's height is unchanged (ProfileCard measures it). The EUS-PPG bracket shows only on slides that ask for it. The six-ladder summary cells (Mac) draw the same chart: the same box, a taller plot, tight rows. Mohammad, 24 Nov: "2"; "each individual gut to heart graph is good size" on the summary slide.


**Reference:** option 4, "All three together", of the Gut to Heart mocks (`/mnt/project-files/gut-to-heart-mocks/gut-to-heart-spacier-options.png`); the built result is `before-after-real-code.png` beside it, commit 7d02d669. Mohammad, 23 Nov 2026: "this top card can use some space somehow ... without fucking the card height", then "do all".

## Traits
- The card's height and the chart's height floor (`need`) are the 2D tool's, unchanged; fonts unchanged. The room goes to the plot (about 55 %) and to air between the bracket rows (about 45 %). `profileGeo` in `src/ui/charts/profile/model.ts` wraps the 2D layout.
- Zone names are one word on one line: PRE, INTRA, POST ("HEPATIC" dropped).
- "sinusoidal" stands in a bracket on the row under the station names (ticks up at the ends, the bar broken round the word, like HVPG and PPG), replacing the curly brace and its row.
- No "mmHg" and no axis numbers; the gridlines stay, bare, every other one (the 10s). Every point carries its own number.
- No "Healthy" word on the line when the line is the healthy one (the dashed line lies under it); any other state still names it.
- Chart words keep the outline halo, never a box.
- Bracket rows: about 20 px apart at 13.8 px type (`ROW_AIR`, `profileGeo`); never closer than their words need.
- Type scales with the card (24 Nov, Mohammad on the Mac: "the numbers could be larger"): 3.2 % of the chart's width, at most 18 px and what its height holds (`fitType`); a 398 px phone chart stays at its 13.8 px. All words (readings, names, brackets) follow.
- No "GUT TO HEART" title on the data card; the card is as tall as with it.

## Rejected / not built
- Options 1 to 3 alone (zones only; zones plus quiet axis; sinusoidal bracket only): he took all of them together.

## Never
- A box behind a word, a pill or chip, a taller card to buy space, a smaller font.
