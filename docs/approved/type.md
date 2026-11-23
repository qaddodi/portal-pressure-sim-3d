# Approved: the type scale (one place; 23 Nov 2026)

**Reference:** `/mnt/project-files/font-audit/` (the audit `README.md`, the contact sheet `contact-sheet.png` with Today, A and B, `deviations.md`, `inventory.csv`). Mohammad's rulings, 23 Nov: "the font for History and Over time is not the one we agreed; go over the whole app and unify it", then "Do all yes" to the seven recommendations (symbols, guard, tidy Over time, serif names, one caps style and three trackings, this doc, the stragglers).

## Traits
- **Two families, no others:** Inter (`--ui`) for everything read or measured (words, numbers, chart words, buttons) and Source Serif 4 (`--display`) for titles and names. JetBrains Mono only for `kbd`. Dev panels keep system fonts.
- **Weights 400, 500, 600.** Deck titles 540 (2D's own). The one 700 is the step numeral, bold with its halo (`docs/approved/step-markers.md`). No 450, 550, 650.
- **Tracking: 0, `--caps-ls` (+.06em, kickers and group titles) or `--ls-tight` (-.015em, serif titles and big numbers).** Nothing else.
- **Spaced capitals are one style:** 12 px, 600, `--caps-ls` (`--t-cap`). They are for kickers and group titles only, never for rows or names.
- **A name is serif:** History row names, Over time event names and its "What to graph" names, like the comparison table's. Serif at `--t-name`, 600. Buttons, words, numbers, units and chart words stay Inter. Settings and the stent rows stay Inter (22 Nov: "keep fonts").
- **Symbols are Inter's own:** `→ ← ≥ ≤ ≈ ≠ ▲ ▼ ✓ ⌘ ⌥ ⇧ ⁴ ₂ √ ∞` come from `inter-symbols.woff2` and `source-serif-4-symbols.woff2` (cut from Inter 4.1 and Source Serif 4.005), so they are never drawn in Arial. The first card waits for them (`src/boot/fonts.ts`).
- **Floor 12 px** for any text. Fitted data cards may shrink down to 12 and no further, then the card pages. Text never shrinks below it.

## The sheet ladder (dock, sheets, menus, History, Histories, Settings, toasts, dialogs and the dense tool cards: Over time, Treat, stent). Tokens in `global.css` and `css2d/tokens.css`.

| Role | Face, weight | Token | Mac | iPad | iPhone, both ways |
|---|---|---|---|---|---|
| Sheet or card title | Serif 600 | `--t-val` | 22 | 21.2 | 16 |
| Big readout | Inter 600, `--ls-tight` | `--t-big` | 32 | 30.4 | 20.1 |
| Name (a row's or event's name) | Serif 600 | `--t-name` | 17 | 16.7 | 15 |
| Name of a button or choice | Inter 600 | `--t-body` | 16 | 15.7 | 14 |
| Words | Inter 400 | `--t-body` | 16 | 15.7 | 14 |
| Small (details, group lines) | Inter 500 | `--t-lab` | 14 | 13.7 | 12 |
| Chart words | Inter 500 | `chartType().sm`, shared by every chart | 13.6 | 17.9 portrait, 13.7 landscape | 13.8, 12 sideways |
| Caption, units, ticks | Inter 500 | `--t-cap` | 12 | 12 | 12 |
| Kicker, group title | Inter 600, caps, `--caps-ls` | `--t-cap` | 12 | 12 | 12 |

## The card ladder (deck cards, data cards, the comparison table): exactly `typeFor()` in `src/ui/layout/device.ts`
Title (serif 540), Body, Data, Kicker, Big number. At 1440 x 900: 49.9 / 20.8 / 18.2 / 15.6 / 41.6; iPad landscape 46.3 / 19.3 / 13.7 / 14.5 / 30.4; iPad portrait 29.5 / 19.1 / 17.9 / 19.1 / 30.4; iPhone 23.3 / 17.4 / 13.8 / 17.4 / 20.1; iPhone sideways 20 / 13.5 / 12 / 12 / 26. Floors: body 17 floating, 16 stacked, 13 sideways; title at least 1.4x the body; data at least 12.

## Rejected
- Any size written as a number or a multiple of a role token (`calc(var(--t-val) * 1.25)`): the Over time titles were 27.5 and 25.3, its open event 19.2. They are 22, 22 and 16/600 now.
- 700 on events, readouts and toasts; 450, 550 and 650 anywhere; 24 different trackings.
- A second serif size or a serif on buttons, words and numbers.

## Never
- Add a stylesheet that the walk in `tests/type-vocabulary.test.ts` skips, or weaken it. It finds every `src/**/*.css` we own (not `css2d/`, `*.copied.*`, `*.generated.*`, debug, parity, perf) and the weights and tracking written in TS.
- Edit the 2D copy (`css2d/`) to match: it keeps 2D's own values (700 in places, its trackings, 540 titles).
- Take away the step numeral's 700, or the deck title's 540.
