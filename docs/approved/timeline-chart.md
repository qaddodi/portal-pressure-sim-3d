# Approved: the timeline chart ("Over time", full screen)

**Reference:** the F mocks, `/mnt/project-files/timeline-mocks/final/` (`F-mac.png`, `F-mac-dark.png`, `F-ipad.png`, `F-iphone-1-graph.png`, `F-iphone-2-what-to-graph.png`; generator `gen3.mjs.txt`), chosen in two rounds (entry point 2, look C3). Mohammad, 23 Nov 2026: "ok let's build this one; F. also the blur, only card glass blur like any other card; don't blur the figure underneath."

## Traits
- Opens from History: the first row is the plain words "See as a chart". One big card over the figure, the standard card glass of every other sheet. **No extra blur of the figure behind it, no scrim** (the one change from the mocks, which blurred the figure).
- Title "Over time". Header words at the right of the chart: the window ("Days 58 to 112") and "Reset zoom". Above the side column: "What to graph", "What happened", "Done" (blue, accent).
- Stacked lanes on one day axis, one per unit: pressures (mmHg), HVPG (0 to 15, a zone wash green to red, cut-offs "CSPH 10" and "Bleed risk 12" at the right edge), ascites (L, area under the line, "Grade 1 · 0.15 L" and "Grade 2 · 1.5 L"), shunt fraction (%, "Large shunt 30%"), cardiac output when chosen. A lane's title carries the reading at the crosshair (name in plain weight, the number bold, in the series' ink).
- Medicine bars above the lanes: one row per medicine, the name in blue above a 4 px rounded bar with a tick at the start and the stop; "stopped" in grey after the stop; a medicine still running fades out to the right edge.
- Event lines, full height: the model's events in their severity ink, the learner's changes (Carvedilol, TIPS 8 mm, Paracentesis) in the text colour and heavier. Labels in rows above the plot on Mac and iPad, turned upright (reading upwards) on the phone, always with a halo, never a box.
- A crosshair (one thin line at the text colour, 50 %), a dot on every line, "Day 84" bold at the foot of the axis. Pointer over the chart or a finger drag moves it.
- Below the lanes, the overview strip: the whole run as one thin line with the events as ticks, the window drawn between two grips. Drag a grip or the window; wheel or pinch zooms the days; "Reset zoom" shows the whole run.
- "What to graph": grouped by unit (Pressures mmHg, Volume L, Shunt % of splanchnic inflow, Medicines and procedures "bars on the chart", Heart, From the case). A row is the name in its colour, a small history line and the reading at the crosshair; a measure that is off is grey. Tap to turn on or off. "From the case: Not made by the model. Shown only when the case gives a value, as a step on the day it was drawn." (Sodium, Creatinine, Bilirubin, INR, MELD-Na as grey words, no control: the model makes none of them.)
- "What happened": the same events and changes as a ruled list, newest at the foot, paged (nothing scrolls inside a card). The chosen row opens: for a TIPS, route, stent "8 mm × 8 cm", and shunt fraction, PPG, HVPG and ascites before → after.
- Phone: the chart takes the whole card; "What to graph" and "What happened" are two words at the foot that raise a sheet over the chart with its own Done. Mac and iPad: the chooser sits beside the chart and "What happened" swaps into the same column.
- Dark follows the app's look; the same mock in dark is `F-mac-dark.png`.

- **Size (24 Nov 2026):** the card is capped at 1340 × 800 px and centred in the room it had, so the figure shows around it on a big screen; text, every menu and panel keep their size. Where the room is smaller (iPad, phone) the card fills it as before. Picked from four mocks (`/mnt/project-files/chart-card-mocks-24nov/`, option 1, "centered"); the others (bottom dock, right dock, shorter lanes) were not chosen.

## Rejected
- Blurring the figure behind the card (Mohammad, 23 Nov). Pills, chips, dots-with-words, bubbles, a box behind a label. Child-Pugh and MELD stay on their own card.

## Never
- Make up a lab: no value is drawn for sodium, creatinine, bilirubin, INR or MELD-Na unless the case gives one.
- Draw on canvas 2D or SVG; the lines are the chart GPU's, the words its text layer.

## Event-paced day axis (24 Nov 2026)
**Reference:** option 2 of `/mnt/project-files/time-axis-mocks-24nov/` (`o2.png`; generator `gen.py`). Mohammad, 24 Nov: "I like o2". Asked first: "is there a way to kinda break up long stretches without real things happening? like // in the x axis, and when lots of things are happening, the x-axis has more room to breathe".
- The day axis is piecewise: the run is cut into pieces, each with one constant scale set by how many events it holds (none ⅓, one or two 1×, three to five 3×, six or more 6×; `src/ui/bigtime/pace.ts`). Inside a piece the scale never changes, so slopes are true; a piece boundary is where the scale changes.
- A compressed piece (under ½) is hatched; a stretched piece (over 1.5×) has a faint warm tint; the scale is said in plain words under the axis ("⅓ scale", "1× scale", "6× scale"), only where the piece is wide enough. Each piece has its own ticks; day numbers never touch.
- The strip below stays a linear 0 to 120 line. Zoom (wheel, pinch, grips) still picks a window of days; the window looks through onto the same paced axis. Pieces come from the whole run's events, so zooming never moves a boundary.
- No `//` break, no cut days, no fisheye (options 1 and 3 were not chosen).
- **Phone (24 Nov, Mohammad: "for iphone chart, the labels on top should be 45 degree not 90 degree"):** event labels are turned 45°, reading up and to the right from their line, long names broken in two; labels whose lines are close are lifted along their lines so none overlaps.
