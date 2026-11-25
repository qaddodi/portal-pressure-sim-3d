# Approved: the Doppler card (Tests > Doppler), mock Q (25 Nov 2026)

Reference: `/mnt/project-files/doppler-card-mocks-25nov/round-3/Q.png` (contact sheet `doppler-mocks-3-sheet.png`, parts sheets `top-parts.png` and `bottom-parts.png`; the node render is `round-3/render.mts`). Picked by Mohammad, 25 Nov: "Q".
Complaint it answered: "This card needs some minimalism and elegance" (iPhone, 8de0ca39), then "the bottom tiles suck, I don't like the bar, it needs to look cleaner, and the top bar with selections needs a cleaner look".
Today's card is the base ("Today is better"): the tab strip, the spectrum, its reading strip and its foot line are unchanged. Only the selection row and the figures change. Tests card only: a slide's data card keeps its own strip and gauge.

Traits (keep every one):
- Selection row: the vessel is its name (16 px, 600) with a chevron right after it, no box and no border (the select is as wide as the chosen name, measured in code, so it never depends on `field-sizing`); the display is the one raised control the app already allows (Spectrum, Color, Variance: the chosen word full ink on the raised cell, the others in the third ink, every word 600 so a choice never moves the row, the change eases); ⇅ and the sweep window are quiet words in the third ink (⇅ in full ink while it is on); the clock is one ink.
- Figures: ruled rows, name left (14 px, 500, third ink) and number right (16 px, 600, with a 12 px unit), a hairline above each row, two columns of three rows (Speed, Max, Trough | Pulsatility, CI or RI, Usual speed); no rules between the columns, no tile, no bar. A stent's three places take the same rows; the chosen one is told by weight.
- The usual speed is words in the last row ("15 to 40", "≥30"), quiet (14 px, 500, third ink); it fades with the range.
- Three rows of 24 px always, so the card's height does not depend on how many figures a vessel has. A short window (under 700 px high: a small phone, a phone on its side) has three columns and two rows, no units, no usual-speed row.

Differences from the picture (told in the push report): the raised control keeps today's width and padding (the picture's was 35 px wider and would not fit a 375 px phone beside the two small controls); the chosen display word keeps weight 600 like the others; rows are 24 px (the picture's were 25); a stent's chosen place is told by weight (nothing marked it before); the clock is one ink (it showed the leftover toward/away gradient as blue).

Rejected (same sheets, never rebuild): round 1 (A Quiet, B The reading first, C The instrument face): "None, hate the bar"; round 2 (D The reading first, E The instrument face, F The ledger): "Not good. Today is better but the bottom tiles suck. I don't like the bar and needs to look cleaner"; round 3's P (Words + five figures) and R (The name as title + one line). Also rejected as a look: the range bar (track, band and mark) under Speed, and the spectrum drawn as bars.

Tests: `tests/doppler-card-q.test.ts` (the pane renders with the usual-speed row and no gauge on the Tests card, a slide keeps its gauge; our stylesheet decides every property it sets on a laptop, a phone and a tablet at the side; three fixed rows).
Code: `src/ui/tests/doppler/doppler-card.css`, `DopplerPane.tsx` (`dop-usual`), `model.ts` (`usualSpeed`).
