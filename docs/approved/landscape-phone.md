# Landscape phone: side columns (an iPhone held sideways, 23 Nov 2026)

Approved look: **Mock 1, then "A + 1"** (`/mnt/project-files/landscape-phone-mocks/01-both-open-trials.png`, `02-instrument-tucked-trials.png`, `03-chart-slide-*.png`, `05-copyright-and-pill-placement.png`). Mohammad: "Mock 1 yes", then picked handle A and copyright spot 1.
Complaint it answers: held sideways, the slide card covered 60 to 70 % of the screen, the PRESSURES drawer sat on the copyright, and some slides showed no card.

Traits (keep every one):
- Two cards on opposite sides, the figure between them. The story (words) card is the left column, the instrument (data) card the right one. Same height, top 12 px, foot on the home-bar line; each 27 % of the screen wide (220 to 260 px, `sideColW`). One width: a card never widens, a long card pages.
- Tuck like the upright phone's up and down, along x: a swipe right on the instrument slides it away to a 30 px strip at the right edge; a swipe left on the strip (or a tap on it) brings it back. The figure takes the room it left, and the pill follows the figure's column.
- The handle is the strip, not a tab: the card's whole height, a grip bar, and its name turned to read down it, "PRESSURES · HVPG 6.1" (the instrument's own name and its live reading, as the upright drawer's).
- The copyright stands in the foot of the words card, one line centred, as upright (`.pz-cred`). The floating copyright fades while a card stands on its row (`Credit.tsx`, `footClear`); no drawer ever stands on it.
- The pill (Back, Next, step) is the 32 px phone pill, at the foot of the figure column; it eases to the new column when the instrument tucks. A slide with one card (a table) keeps it centred and the pill to its right.
- A swipe sideways anywhere else still moves the talk. Type: title 20, body 13.5, small words 12, numbers 26 px; text never shrinks to fit, a long card pages.

Rejected: the 2D-style wallet (one wide card in front, the other a 48 px strip at the foot); a tab-only handle (02b); the copyright in the free strip or hidden.
Known deviations from the mock (told to Mohammad): the mock's 52 px insets are the real safe areas in code; the table panel's width is the room left by the pill, not the mock's fixed 496.
Tests: `tests/landscape-phone-plan.test.ts`, `tests/ui-layout.test.ts`, `tests/credit-clear-of-drawer.test.ts`, `tests/deck-phone-chrome.test.ts`.
