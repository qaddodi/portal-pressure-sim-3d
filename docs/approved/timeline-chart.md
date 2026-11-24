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
- "What to graph": grouped by unit (Pressures mmHg, Volume L, Shunt % of splanchnic inflow, Medicines and procedures "bars on the chart", Heart, From the case). A row is the name in its colour, a small history line and the reading at the crosshair; a measure that is off is grey. Tap to turn on or off. "From the case: Not made by the model. Shown only when the case gives a value, as a step on the day it was drawn." (Sodium, Creatinine, Bilirubin, INR, MELD as grey words, no control: the model makes none of them.)
- "What happened": the same events and changes as a ruled list, newest at the foot, paged (nothing scrolls inside a card). The chosen row opens: for a TIPS, route, stent "8 mm × 8 cm", and shunt fraction, PPG, HVPG and ascites before → after.
- Phone: the chart takes the whole card; "What to graph" and "What happened" are two words at the foot that raise a sheet over the chart with its own Done. Mac and iPad: the chooser sits beside the chart and "What happened" swaps into the same column.
- Dark follows the app's look; the same mock in dark is `F-mac-dark.png`.

- **Size (24 Nov 2026):** the card is capped at 1340 × 800 px and centred in the room it had, so the figure shows around it on a big screen; text, every menu and panel keep their size. Where the room is smaller (iPad, phone) the card fills it as before. Picked from four mocks (`/mnt/project-files/chart-card-mocks-24nov/`, option 1, "centered"); the others (bottom dock, right dock, shorter lanes) were not chosen.

## Rejected
- Blurring the figure behind the card (Mohammad, 23 Nov). Pills, chips, dots-with-words, bubbles, a box behind a label. Child-Pugh and MELD stay on their own card.

## Never
- Make up a lab: no value is drawn for sodium, creatinine, bilirubin, INR or MELD unless the case gives one.
- Draw on canvas 2D or SVG; the lines are the chart GPU's, the words its text layer.

## Event-paced day axis (24 Nov 2026)
**Reference:** option 2 of `/mnt/project-files/time-axis-mocks-24nov/` (`o2.png`; generator `gen.py`). Mohammad, 24 Nov: "I like o2". Asked first: "is there a way to kinda break up long stretches without real things happening? like // in the x axis, and when lots of things are happening, the x-axis has more room to breathe".
- The day axis is piecewise: the run is cut into pieces, each with one constant scale set by how many events it holds (a cluster of events: ×1, ×3, ×6 or ×10 by how many fall per day; days between clusters fold to ⅓; `src/ui/bigtime/pace.ts`). A piece starts and ends exactly on an event day, never on a bin edge. Inside a piece the scale never changes, so slopes are true; a piece boundary is where the scale changes.
- A compressed piece (under ½) is hatched; a stretched piece (over 1.5×) has a faint warm tint; the scale is said in plain words under the axis ("⅓ scale", "1× scale", "6× scale"), only where the piece is wide enough. Each piece has its own ticks; day numbers never touch.
- The strip below stays a linear 0 to 120 line. Zoom (wheel, pinch, grips) still picks a window of days; the window looks through onto the same paced axis. Pieces come from the whole run's events, so zooming never moves a boundary.
- No `//` break, no cut days, no fisheye (options 1 and 3 were not chosen).
- **Phone (24 Nov, Mohammad: "for iphone chart, the labels on top should be 45 degree not 90 degree"):** event labels are turned 45°, reading up and to the right from their line, long names broken in two; labels whose lines are close are lifted along their lines so none overlaps.
- **Phone label band (24 Nov):** labels sit in one or two rows (lifted along their lines); where a label still would not fit, the unplaced run of events merges into one "+N" tick (words, 45°, no pill). Tap it to open that group's labels; tap again to close. The closed band is capped at about a third of the chart.

## "What to graph" rows (24 Nov 2026)
**Reference:** option A of `/mnt/project-files/graph-rows-mocks-24nov/` (`A.png`). Mohammad, 24 Nov: "it's not obvious that i can tick the stuff on the right to graph and ungraph" and "the choice of font of those on the right seems wrong"; picked "A".
- Each measure row starts with a tick circle: filled in the measure's colour with a tick when graphed, an empty ring when not; an off row is dimmed grey (name, line, reading).
- The names on the right (What to graph rows, What happened list) are Inter 600 like the words beside them, not Source Serif.
- Rejected: chips or pills (standing rule), a colour bar, a switch, a line sample with a hint line (mocked, not picked).

## Stiffness rows (24 Nov 2026)
Mohammad, 24 Nov: "Should be able to graph LSM liver and spleen." Built as two more "What to graph" rows in the A look (tick circle, Inter name, history line, reading), nothing else changed.
- Group "Stiffness · kPa": "Liver stiffness" (LSM) and "Spleen stiffness" (SSM), both **off** until chosen, so the card opens as it did. They share one lane (its title reads "LSM 26.8 kPa  SSM 65.6 kPa" at the crosshair); the lane sits under the gradients.
- Read from the model's own `metrics.lsm` and `metrics.ssm` (metrics.js, lsm-cuts.js, ssm-cuts.js), kept per day in the record (`lsm`, `ssm`; day-keys.ts). No spleen (splenectomy) gives no SSM, so no point and no row, never a 0.
- LSM follows the sinusoidal gradient, scar and congestion and not the beta-blocker; SSM follows the pressure as it stands (a TIPS lowers it at once, the remodelling part slowly). That is the model's physiology, not a rule of the chart.
- Cut-offs, dashed at the right edge like every lane, each only while its line is on: "LSM 25" and "SSM 55" (Baveno VIII rule-in values, `LSM_CUTS.ruleIn`, `SSM_CUTS.ruleIn`). Colours: SSM the spleen violet (`tr-sv`), LSM the FibroScan liver's warm brown.
- The saved Histories patients carry both keys (rebaked, `node scripts/gen-histories.mjs`).
- **All the rest the model computes (24 Nov 2026, Mohammad: "Add all available").** Ten more rows in the same A look, all off until chosen, each read from `metrics` and kept in the day record (day-keys.ts): Spleen size (cm) and Platelets (group "Spleen and platelets"; no spleen, no size row), Portal flow (L/min, shares the cardiac output's lane) and Liver perfusion (% of healthy, shares the shunt's lane, which may then run to 140 %) under "Liver blood flow", Arterial pressure (MAP), Perfusion pressure (APP, the metrics' `rpp`) and Heart rate under "Pressure and pulse", Varix size (mm), Encephalopathy risk (index 0 to 1, read as Low / Moderate / High) and Artery response (× resting flow, 1 = none).
- Cut-offs only where the model has one, dashed and worded like the others: Platelets 150, Low liver flow 75 %, MAP 65, Large varix 5 mm and Varix seen 2.5 mm, High 0.45 and Moderate 0.2 (the risk index's own words). No cut for the APP, heart rate, spleen size or artery response: the model has none (kidney-cuts.js says none may be derived for the APP).
- A box too short for every chosen lane keeps each at 34 px or more and leaves the last ones out, with "N more chosen: no room, turn one off" at the right of the last lane's title. Nothing is cut off at the foot.
- Not built (the model makes no labs): albumin, bilirubin, INR, creatinine, sodium, MELD, Child-Pugh.

## Phone panels scroll and pull down (24 Nov 2026)
Mohammad, 24 Nov: "What to graph and what happened don't scroll on iPhone. They should scroll and I can close them by swiping down." (The one exception to "nothing scrolls inside a card": the raised panel on a phone.)
- The panel body scrolls (rows keep the standard 42 px, What happened is one page of every event, no Earlier / Later), with the pull-back kept inside it.
- A pull down from the top of the list, or from the head, closes it like every other sheet (`shell/sheet-swipe.ts`), with the grab bar at its top. The card around it never sees a touch that begins inside the panel, so that pull closes the panel, not the whole chart.
- Mac and iPad keep the fitted list and the paged list.

## Phone openers are raised buttons (24 Nov 2026)
**Reference:** option A of `/mnt/project-files/phone-panel-button-mocks-24nov/options-A-D.png`. Mohammad, 24 Nov: "make them more visibly button like", then picked "A".
- At the foot of the chart card on a phone, "What to graph" and "What happened" are two equal buttons, 46 px tall, 10 px apart: a raised fill (`--surface-2`), a hairline (`--edge`), radius 12, the panel's icon (the atlas's `ic-chart`, `ic-menu`), the name in Inter 600 at 14.5 px, and a chevron pointing up at the right that says the panel rises. The first in the text colour, the second in the quieter text colour.
- A press eases to 98 % and a slightly deeper fill.
- Rejected (mocked, not picked): one solid and one outlined blue (B), one segmented bar (C), soft blue tinted buttons (D).

## Off rows on a phone are full rows (24 Nov 2026)
**Reference:** option A of `/mnt/project-files/phone-panel-button-mocks-24nov/off-rows-options.png`. Mohammad, 24 Nov: "It's still not obvious on iPhone that I can click to graph the disabled variables"; picked "A".
- Root cause: on a phone the chooser listed only the graphed measures as rows and set the rest as one line of grey words with no ring (it hid them to fit a panel that did not scroll). Now every measure is a full row on every device: the empty ring, the dimmed name, the dashed line, the reading. The panel scrolls, so nothing is left out.
- Rejected: a hint line with short rows (B), a ring with a blue "Graph" word (C).

## "MELD", not "MELD-Na" (24 Nov 2026)
Mohammad, 24 Nov: "Why does it say MELD Na just say MELD". The grey "From the case" words in What to graph read Sodium, Creatinine, Bilirubin, INR, MELD. The Child-Pugh and MELD card still prints MELD-Na beside MELD when a case gives a sodium: it is a second, different score there.
