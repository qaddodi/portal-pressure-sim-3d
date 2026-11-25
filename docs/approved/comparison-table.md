# Comparison tables (the summary `visual: 'table'`, 23 Nov 2026)

Approved look: **mock A, "one line per case"** (`/mnt/project-files/comparison-table-mocks/A-one-line-per-case.png`). Mohammad picked it on 23 Nov ("A").
Complaint it answers: the tables load slowly, the Doppler reads as flat lines, and the table has too much text.

Traits (keep every one):
- One case = one row: name (serif) with its finding as one small grey line under it; Flow and HVPG as arrows (numbers only on the reference row); the Doppler trace at the right.
- No "Doppler finding" sub-rows, no group heading rows (Reference, Portal inflow...), no chips or badges.
- One short legend line under the table: arrows against normal, doubled past the red cut-off, then the units of the top row.
- The trace shows 8 s (two breaths, about nine beats), each row on its own scale (its peak, never under 20 cm/s: a still vein stays a line). Real cm/s in the hover and for a screen reader. Toward the probe above the line, away below.
- Traces are baked at build time (`baked/make.ts`, `waves`), so they are in the card's first frame, and ease in (`dk-fade`).

Rejected: B (wave full width above each case) and C (finding under a full-width wave); a shared 50 cm/s scale; 2 s of trace.
Tests: `tests/deck-presenter-wave.test.ts`, `tests/baked-waves.test.ts`, `tests/deck-table-2d.test.ts`.

Update 23 Nov 2026 (Prehepatic review): the one-line layout holds at EVERY width (it was behind a phone-only media query, so a laptop showed group headings and a wide empty name column). A case with no flow prints "No flow" under its flat line. Every case carries its finding line (`note`). The criteria cards' rule source is plain words, not an outlined chip.

Update 23 Nov 2026 (TIPS Doppler review, items 5 and 6): a table can compare a row with another row (`vs: '<slide id>'` on the row), so the TIPS table compares the stenosed stent with the patent one: a PPG that rose or a portal vein velocity that fell is red, never the green "better" of a comparison with the pre-TIPS row. It carries the stent's Doppler trace in each row (`cols: [..., 'wave']`, `wave: 'TIPS'`; the pre-TIPS row has no stent, so its cell is the empty ring), and the legend gives the velocity column its unit ("portal vein velocity in cm/s"). Numbers stay on the reference row only, as approved.


Update 25 Nov 2026 (capture f23a4c59, iPhone): a table's value columns are never narrower than what they print. The grid gave the name column a fixed least width and every value column an equal share of the rest (least 0), so a 4th numeric column ("0.50", Landmark trials 16) ran to the table's edge and a blood pressure ("113/72 (86)", Precipitants 11) stood on three lines. Each column now starts at its widest unbreakable run (a blood pressure is two lines, "113/72" over "(86)") and the name column gives way, never under its longest word (`gridOf`, `--dk-name-fit`; `tests/table-columns-fit.test.ts`). The heads are judged again when the fonts arrive, so the card is measured on the table as it will stand, and a phone's centred panel ends above the pill, not 22 px under it on a screen with no home-bar inset (`centredBox`). No look changed: the traits above stand.

**Anatomy cut-over (25 Nov 2026):** approved on the 2D figure's placement; its last default commit is f17b151a. Since the cut-over the app draws the approved placement (docs/approved/anatomy-placement.md).
