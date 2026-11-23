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
