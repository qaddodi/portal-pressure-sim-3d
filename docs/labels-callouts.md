# Labels, callouts and the HVPG subtraction (B6)

Everything the figure writes on itself lives in `src/scene/labels/`. This note is about the figure's reading tags (the catheter's, a caliper's, a bracket's) and the organ names.

## No speech bubbles, no cards (Mohammad, 22 and 23 Nov)
Every reading on the figure is a **tag** (`tag-dom.ts`): a name, a number and a unit on one line, each letter in the labels' halo, in the station labels' own sizes (`cath.ts tagType`, `tagSize`), with a thin leader (`TagLead`, maths in `tag-lead.ts`) and a dot where the words stand away from what they name. There is no glass, rim, fill, clip or pointer in the code to draw a box with: the old primitive (`pillGlass`, `makeCard`, 2D's `callout-ptr` and `callout-outline`, the solver's callout mode, the `site` card kind) is deleted, and `tests/no-bubble-callouts.test.ts` fails the source, the stylesheets, the DOM of every slide and the catheter, and the legibility of every ink if one comes back. A step's number stands on a plain round `.cl-disc` (the one face of the figure). A new reading on the figure is a tag; never add a card.
- A caliper's reading stands in line with it, 6 px past its far tick, no leader (`caliperSpot`); a bracket's 4 px under the middle of its line (`spanSpot`); only where that place is taken does `placeCards` stand it elsewhere, with a leader that stops 1 px short.
- A reading still unknown ("…") stays hidden until the number is in.

## The catheter's tags (FHVP, WHVP, the stack)
- `cath.ts` is the pure layout and the 2D numbers (tag size, `placePills`, `placeStack`, `leadersOf`, `sumFlow`). Its placing files `cath2d/*.copied.js` are the 2D app's, copied by `scripts/copy-label-names.mjs`.
- `cath-show.ts` (`CathShow`) is the state machine: which cards stand for a catheter state (`calloutsFor`: free = FHVP; wedge = FHVP + WHVP; result = the stack), where (in the figure's free band, clear of cards and the key), and how they come and go with the 2D timings: a card in 420 ms with a 6 px rise, out in 240 ms; the result's readings travel 420 ms from where their cards stood, the bracket and leaders follow at 650 ms and the HVPG at 750 ms with a rise.
- `cath-dom.ts` builds the DOM once and writes only `transform` and `opacity` per frame. Opacity goes on a tag's children, never on the tag. Each standing reading has a leader and a dot to its point; the stack's rows are tags and keep the 2D bracket and leaders.
- The stack box is never shorter than 150 px (`STACK_MIN_H`): in 2D the bracket's `<svg>` has the default 150 px height, which sets the box's height. Copied, not corrected.
- The stack's row order and leaders are 2D's planner (`cath-leads.js`, copied by `scripts/copy-cath-leads.mjs` into `cath2d/`): the lower point's reading is the lower row, the other order only when the first crosses its leaders; `cath.ts planLeaders`.
- The cards stand steady (`tests/cath-cards-steady.test.ts`, Mohammad 20 Nov: they "keep flashing in and out"): a small move of the tip or the point ahead (a tilt, the camera following the tip, the scope bending) is carried, not a cut. The controller calls `show.ride(tip, ahead)` every frame and each card is drawn at its solved place plus how far its point has moved since; only a jump of more than `FOLLOW_JUMP` px (or a point appearing or vanishing) hides the cards. A card placed again with the same side and size glides to its new place (`GLIDE_TAU_MS`); only a card that flips side or changes size fades out and in. Its `key` is the glass shape, never the place.
- Under the catheter the figure's names are hidden, as in 2D (`cath-on`): `HIDE_UNDER_CATHETER` in `controller.ts` (kept on purpose: Mohammad, 19 Nov, "hide, 2D style, we can change stuff later").
- Tests: `tests/labels-cath.test.ts` (numbers), `tests/labels-cath-show.test.ts` (states, timings), `tests/labels-slice.test.ts` (every slide on every screen).

## Organ names
- `scripts/copy-organ-names.mjs --from <2D checkout> [--check]` copies the organ outlines and `organ-names.js` into `organ2d/`. `organ-screen.ts` projects the outlines to the canvas each solve (the silhouettes), so a name that stands beside its organ is judged by them and every name keeps off the other organs where it can; the solver steps a name under a vessel to the next spot of its own organ (`nameSpots`) and never leaves a name off for standing on another organ.

## The scope ring and its lens (22 Nov)
- Which slides: 2D's own rule (`scope-lens-rule.js`, copied as it is by `scripts/copy-scope-lens.mjs --from <2D checkout> [--check]` into `scene/disease/copied/`), asked of the slide on show in every deck (`ui/scope/scope-want.ts`: a ported slide as the copied 2D slide, a slide written for 3D as the same fields it has). Nothing is listed per slide.
- The ring is the scene's: one camera-facing GPU quad in world units at the lower esophagus's varix columns (`scene/disease/scope-ring.ts`: 16 round-ended dashes that close into a line while the lens is open, the scope badge, the labels' halo, never under 1.5 px), eased in and out, taken with the body's dissolve (dive, Circuit).
- It stands while the slide wants it and the patient has varices (a lapse, ramp or days slide: from its first frame); it leaves only after 900 ms of none, never under an open lens, and a balloon tamponade takes it at once (`ui/scope/scope-gate.ts`).
- A tap (a 44 px transparent button moved by a transform each frame in the clock's tags phase) opens the lens (`ui/scope/ScopeLens.tsx`): the Tests card's own scope view (`ScopeView`, the slide's own numbers) in a round lens in the nearest free space (`placeLens`: clear of the cards, the bar and the bleed), a cone to the ring laid once the camera is still, a caption of the grade. Ring and lens move as one by a transform; any tap on the figure shuts it.

## Not done
- The monitor's WHVP - FHVP trace callout (B11 owns it; `trace-callouts.js`).
- On the sideways phone the figure is framed in a strip of about 150 px beside the centred wallet card, so the least important station names drop there, as 2D's do.

## Measurement readings on the talk's slides, and the blocked vein (23 Nov 2026)
- The talk's procedure run (`ui/deck/procs-link.ts` `begin`) starts `runCards` (scene/labels/proc-cards.ts) for every kind whose 2D spec has `labels` (EUS-PPG, HVPG catheter, IR IVC and portal pressure, TIPS gradient), feeds it each frame and ends it with the run. Before this only the Tests cards did, so the slides showed no PV, HV or gradient. `tests/talk-measurement-cards.test.ts`.
- A catheter against a blocked hepatic vein (Budd-Chiari, `cath: 'blocked'`) stands one tag at its tip: "Occluded", then "No reading" in the same tag (`BLOCKED_SAYS` in cath-show.ts; words only, caution ink). `tests/blocked-vein-callout.test.ts`.
