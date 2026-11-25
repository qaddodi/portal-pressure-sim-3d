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
- EVERY slide uses the column (Mohammad, 23 Nov, from the bbe955e5 review: "make every slide use the stacked column"). A slide with one card (a chart, a table, the outline, the quick check, a case) stands it alone in the column, centred top to bottom, as tall as the screen allows; the figure stays in view beside it with no veil. The copyright is in that card's foot too.
- The pill is the 32 px phone pill (Back, count, Next, settings, Exit), centred in the figure's column on every slide.
- Type: title 20, body 13.5, small words 12, numbers 26 px; text never shrinks to fit; card padding 16 px.

Rejected: side columns with a swipe-right tuck and a strip handle (a4cb17c1); the 2D-style wallet (one wide card, the other a 48 px strip); the copyright in the free strip or hidden.
Tests: `tests/landscape-phone-plan.test.ts`, `tests/ui-layout.test.ts`, `tests/credit-clear-of-drawer.test.ts`, `tests/deck-phone-chrome.test.ts`, `tests/deck-pair-centred.test.ts`.

Update 24 Nov 2026 (capture 4fb2f869 review). Mohammad: "i feel the landscape iphone card afford to be wider ... like the deck slides cards". The column is `sideColW` = 38 % of the screen, 290 to 360 px (321 at 844, 354 at 932; it was 32 %, 250 to 310). The figure keeps at least 40 % of the screen (`tests/landscape-phone-plan.test.ts`). Every other trait above stands.
A summary table or chart slide (`visual: 'table'`) no longer stands alone in the column on a phone on its side: it was one card (title, line and the table) far taller than the column's room, clipped at the foot with the © line on the table (Lobule 10, Gradients 13, Where is the resistance? 12, Lowering pressure 9). It is the pair every slide with an instrument is: the words card, the table or chart under it, the swipe (`src/ui/cards/phone-panel.ts`, `tests/capture-4fb2f869.test.ts`). The outline, the quick check and a case still stand alone.


**Anatomy cut-over (25 Nov 2026):** approved on the 2D figure's placement; its last default commit is f17b151a. Since the cut-over the app draws the approved placement (docs/approved/anatomy-placement.md).
