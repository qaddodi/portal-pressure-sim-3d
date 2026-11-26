# Anatomy to Lobule dive (23 Nov 2026)

Complaint (Mohammad, 23 Nov): "the anatomy -> lobule zoom is still not zooming into the correct place; especially when I'm zoomed into a different area in anatomy".

Rule now: the dive always lands on the liver's one anchor (`LIVER_2D` in `src/scene/lobule/frames.ts`, between the right portal vein and the IVC, owner 20 Nov), framed in the room, from whatever zoom and pan the hand had. The place is never chosen from the camera. The flight eases from the picture as it stands (rig.startDiveHand / stepDiveHand), nothing jumps on the first frame.

Rejected: choosing the place from where he looks or the nearest liver point on screen (put the lobule on the liver's rim or on a vein). Test: `tests/dive-always-to-the-liver.test.ts`.

## 24 Nov 2026 rulings (Mohammad)
- Lobule to sinusoid: the camera must not go to "crazy places" before landing. The sinusoid keeps ONE straight line on screen (rig.ts blendDive turns the aim's offset against the camera roll and lets it go linearly in the move's eased share); `tests/camera-roll-dive-path.test.ts` bounds the deviation, both ways, on Mac, iPad, iPad portrait, iPhone.
- The whole-lobule shot (`lobule`, `lobule:fit`) frames the lobule's own bounds (1.12 R by 0.98 R) in the free room, on every screen but a phone, which keeps its own box. Stations (triad, sinusoid, central) unchanged.
- Case slides: the camera stays where the last slide left it while the case card shows and the patient blends in; the slide's move starts at Next on the card (scene-link.ts, `tests/case-card-camera-waits.test.ts`).


**Anatomy cut-over (25 Nov 2026):** approved on the 2D figure's placement; its last default commit is f17b151a. Since the cut-over the app draws the approved placement (docs/approved/anatomy-placement.md).

## 25 Nov 2026 ruling (Mohammad)
- A phone's whole-lobule shot (`lobule`, `lobule:fit`) is the lobule's own bounds wide (1.12 R a side) instead of 2D's 1.05 R: the corners' arteriole and bile-ductule dots and the tract glow were cut at the screen's edge (capture af1c51a0, iPhone Circulation 5 and Ascites 3). The hexagon is about 89 % of the room's width on a phone (was 95 %). Stations are unchanged. Test: `tests/scene-lobule-fit-2d.test.ts`.

## 26 Nov 2026: nothing switches in the dive (Mohammad: "zooming from anatomy to lobule ... some flickering happens")
Stepping the real scene frame by frame (node) found two things that changed in ONE frame, both ways: the organ veil, switched by the view's name (off at the dive's first frame, on at the way out's landing), and the neighbours' ground (the dive frame's backdrop), whole at the frame the dive frame is switched on, so the page behind and around the body turned to the lobules' tone at once (Dark look: grey 26 to 62).
Rule now: a switch on a view is never seen. The veil goes with the organs' own fade (`veilShare`); the ground comes in with the body's dissolve (`groundStays` in micro3d/lobule3d.ts: none while the body is whole, all of it by half-way). Test: `tests/dive-nothing-switches.test.ts` flies Anatomy to Lobule and back on a Mac and a phone, and Anatomy to the Circuit and back, and bounds every frame's step.
