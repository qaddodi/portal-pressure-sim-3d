# Framing rules for the camera (25 Nov 2026)

Approved: Mohammad, 25 Nov, "more rules for every scenario", then "Do it" to all six recommendations of the rules-and-audit document (https://claude.ai/artifact/4FqnFnUcLkv6QjwTaLaxAN, "Camera framing rules and zoom audit"; its text is the reference, this sheet is the short form).
Why: "we should look for opportunity for zooming in further when we can (like when we focus on portal triad, we can zoom in more). can we come up with good framing rules for zooms and stuff".

## The rules (keep every one)
- **F1 Subject first.** A slide's frame is built from what it points at, with margin; a named region only when the slide is about the whole region. `FRAME_FIXES` in `src/decks/hp/cams.ts` holds the slides framed on their subject (the 2D deck is never edited; each entry names the 2D camera it replaces, and a test fails if a re-copy moves it).
- **F2 Fill.** The subject fills 92 % of the room's limiting side (`FILL`); the other side is centred, never cropped to zoom.
- **F3 Margins.** Every station a slide labels stands 40 px or more inside the free room on every device. Root cause of the clipped labels: a frame came from the 2D region box alone. `withStations` (cams.ts) carries each label's dot as a `keep` point on the shot (`Shot.keep`), and the room solver (`room.ts`, `KEEP_PX` 40) pulls the camera back until every dot stands 40 px inside the room it is actually given, so the margin holds in any card room, including the real one at run time (`STATION_AIR` 0.05 only recentres).
- **F4 Nothing named is clipped.** Unnamed context may leave the room; a named vessel, organ or station never.
- **F5 Not too close.** The longer half of a frame is at least `CONTEXT_FLOOR` 0.45 units, and no vein is wider than a sixth of the room's short side (phone 65 px, iPad 128, Mac 150), except the declared close-ups (`CLOSE_UPS`: tips-complete/baseline, tips-doppler/jet, varices/burst; Mohammad kept all four he was shown, bridge needs no exemption). The nearest distance (`NEAR` 2.8) already stops the smallest boxes at a vein 105 px wide.
- **F6 Readable.** Outside the whole-figure overview a vein is 8 px or more on a phone upright and 10 px or more on an iPad and a Mac.
- **F7 Devices.** One frame per slide, sized per device by the room solver; a wide subject on a phone is width-bound and leaves vertical slack, accepted; zoom a phone by narrowing the subject, never by cropping. A phone-only variant only for a tall subject.
- **F8 Lobule** is a flat plate: whole lobule = its measured bounds 1.12 R by 0.98 R on every device; a station frame holds the part whole with its ring and glow plus air.
- **F9 Body** is a fixed figure: the frame is the subject's placed bounds plus `SHOT_MARGIN`.
- **F10 Same subject, same frame.** One table of frames, one sweep test: `tests/camera-framing-rules.test.ts` (labels, frame fixes, over-zoom, readable veins, the Circuit).
- **S1 to S16 scenarios** (vessel, junction, organ, lesion, catheter, collateral route, lobule, sinusoid, Circuit, comparison, moving subject, overview, tucked card, the hand, transitions, free play) and **D1 to D4 devices**: as in the document. Answers to its questions, 25 Nov: overviews only for orientation, so a slide that names parts of the body gets a frame on them (yes); long collateral routes go one segment per beat when the thinnest vein would fall under 8 px (yes); comparisons step across two beats when the union would shrink a named vein under 8 px (yes); a lesion is framed with about two of its own lengths of vessel each side and never under the floor (yes); the Circuit measured against S9 (yes, done).

## What was built (pushed, not yet seen)
- 3e70ba35 F3: frames hold every labelled station (27 frames grew of 135 labelled views; worst margin -148 px before, 42 px after).
- c9c17d24 Portal triad frame: zoom 2 to 3.5 (1.75x), centred on the tract at -1 R (it was 0.12 R in), collagen cuff (0.23 R) whole. Teaching changes: none. Slides: hvpg/presin, hvpg/eus-ladder, lobule/lobule, lobule/schisto, ncph/tract, ncph/eus-ladder, ncph/psvd, ncph/path-psvdscore, gradients/psvd, sites/presin, treatment/schisto, two-inflows/meet, where-resistance/a5.
- 3cedcc5e Budd-Chiari dx, ladder, anticoag, agent, response, alf, hcc on the hepatic veins and the caudate (the Outflow talk's `hepatic` size, 0.65 by 0.50 half, moved 0.17 down so the caudate is whole); doppler/a5, tips-doppler/left and warn on the stent and the left portal vein (floor 0.55). Corrected from the proposal: the `hepatic` region alone cut the caudate's foot and does not hold the left portal vein, so those three were not moved to it.
- 28dfc9d9 F5 sweep test and the three declared close-ups.
- c8474f82 The Circuit's nine views measured: all fill 92 % of the limiting side, room-bound, kMax kept (wide strips such as Series and Gut and liver use 28 to 40 % of the other side by their shape). Overview given up on ncph/patient and relation (varices and spleen), gastric-varices/tips (fundus and liver), tipping/injury and its card (liver).

- Margin made pixel-based (root fix): the test measures each slide's own card room (`planLayout().free`, estimated from the card text because real card heights exist only in a browser): 3972 station checks, 3 devices upright and sideways, card up and tucked, all 40 px or more.

## Not done, and why
- Rule 2 (route beats) and rule 4 (lesion framing) are checks, not frames yet. In each slide's own card room on an iPhone, 31 views (about 15 slides) draw a vein under 8 px (thinnest 5.8 px, circulation/series); the test prints the list. Most are heart-to-liver wide frames; the one collateral-route beat is varices/umbilical beat 2 (6.5 px), which needs a split into two beats, and the deck is copied from the 2D app. Waiting for his pick.
- Rule 3 (comparisons) is not built either; I have not yet checked which of the 31 thin views are two-site comparisons (sites/healthy 6.1 px and two-lesions/measure 6.5 px are candidates).
- Whole-figure slides left on the overview because they are about the whole body: pregnancy/weeks and after, day/fluid, sites/overview, ascites/tense.
- Other suggested zoom-ins (gastric-varices fundus, bleed, gut, nograd) stay as numbered suggestions; he has not picked them.

## Rejected
Nothing yet.
