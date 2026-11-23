# Landscape phone: one card column, swipe up and down (an iPhone held sideways, 23 Nov 2026)

Approved look: **the one-column mock** (`/mnt/project-files/landscape-phone-mocks/07-column-swipe-sheet.png`, frames `07-column-1-teaching-in-view.png`, `-2-mid-swipe.png`, `-3-instrument-in-view.png`). Mohammad, 23 Nov: "yes, good. let's do it".
It replaces the side-column layout (a4cb17c1; mocks 01 to 05), which he "kinda hated".
Complaint it answers: held sideways, the slide card covered 60 to 70 % of the screen, the PRESSURES drawer sat on the copyright, and some slides showed no card.

Traits (keep every one):
- Both cards stand in ONE column at the left safe edge, `sideColW` wide (32 % of the screen, 250 to 310 px), 12 px apart. The words (teaching) card is centred top to bottom. The instrument card stands under it and bleeds off the screen's foot, its top edge showing (at least 36 px).
- A swipe up anywhere on the slide (not on a control) slides BOTH cards up together, following the finger, until the instrument card is centred; the words card then bleeds off the top, its foot showing. A swipe down brings them back. A tap on the card that peeks does the same. The key that swaps the cards does it too. A new slide always starts on its words card.
- Sideways swipes still move the talk. The figure fills the rest of the screen to the right and does not move when the column slides; the pill stands at the foot of the figure's column, centred in it.
- Neither card is ever taller than leaves the other 36 px showing (`maxH` = screen height less 2 x (36 + 12)); a taller one pages (never shrinks, never scrolls).
- The copyright is in the foot of the words card, one 12 px line centred (so it slides away with that card); the floating copyright fades while a card stands on its row.
- No strip, no handle, no tab, no badge. The peeking edge of the other card is the only hint.
- The pill is the 32 px phone pill (Back, count, Next, settings, Exit). A slide with one card (a table) keeps it centred in the room; a slide with a lone words card stands it at the left, centred.
- Type: title 20, body 13.5, small words 12, numbers 26 px; text never shrinks to fit; card padding 16 px.

Rejected: side columns with a swipe-right tuck and a strip handle (a4cb17c1); the 2D-style wallet (one wide card, the other a 48 px strip); the copyright in the free strip or hidden.
Tests: `tests/landscape-phone-plan.test.ts`, `tests/ui-layout.test.ts`, `tests/credit-clear-of-drawer.test.ts`, `tests/deck-phone-chrome.test.ts`, `tests/deck-pair-centred.test.ts`.
