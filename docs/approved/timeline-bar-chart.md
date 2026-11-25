# Approved: the Chart button in the phone's timeline bar

**Reference:** option 1 of `/mnt/project-files/timeline-bar-mocks-24nov/` (`iphone-anatomy.png`, `iphone-lobule.png`, `iphone-sinusoid.png`; generator `gen.mjs.txt`). Mohammad, 24 Nov 2026: "also i kinda think the time chart should be a button in the iphone timeline, maybe should only keep HVPG down there and put chart button there"; picked option 1 ("1 yes").

## Traits
- A phone held upright only (`device === 'phone-portrait'`). The bar's readout row keeps its first reading and the Chart button takes the second reading's place, at the right end of the row.
- Anatomy: HVPG stays, PPG goes (PPG stays in Tests and on the chart). Lobule and Sinusoid: Sinusoids stays, Portal in goes.
- The button is the chart glyph and the plain word "Chart" (Inter 600, 12 px, the second text colour), 20 px icon, 5 px between them. No border, no fill, no pill, no dot. Lit (the main text colour) while the chart is up. A 44 pt finger target.
- The jump (fast-forward) menu no longer has "See as a chart" on a phone: the button replaced it.
- Mac, iPad and a phone on its side are unchanged (Chart and Compare in the bar, both readings).

## Rejected
- Option 2, the chart icon alone with both readings kept (9 pt between controls on a 393 phone, about 5 on a 375, and 0 in the lobule: it does not fit).
- Option 3, a trend line in the HVPG reading that opens the chart when tapped (least discoverable).
- Mac trend-line variants A and B (not asked for).

## Also fixed the same day (not a look): the fast-forward and 1x menus put the view pill away
The pill hangs from the dock, above the cards layer the two menus stand in, so it was drawn over their foot. `src/ui/shell/sheets-over-pill.ts` lists them; `tests/sheet-over-pill.test.ts` finds every menu that opens above the timeline bar.


**Anatomy cut-over (25 Nov 2026):** approved on the 2D figure's placement; its last default commit is f17b151a. Since the cut-over the app draws the approved placement (docs/approved/anatomy-placement.md).
