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
Rule now: a switch on a view is never seen. The veil goes with the organs' own fade (`veilShare`); the ground comes in with the body's dissolve (`groundStays` in micro3d/lobule3d.ts: none while the body is whole, then what the body leaves). Test: `tests/dive-nothing-switches.test.ts` flies Anatomy to Lobule and back on a Mac and a phone, and Anatomy to the Circuit and back, and bounds every frame's step.

## 26 Nov 2026 (later): the camera never flies through anything drawn (Mohammad's screen recording: "there still seems to be a black flicker")
The recording, frame by frame: four frames after the camera went through the liver's surface (itself a one-frame step from the liver's brown to the lobules' grey), one frame showed a straight-edged dark sheet over most of the screen, and the mirror of it on the way out. Root cause: the body was still about a third drawn when the camera reached the figure (it was gone only at a few lobule-fits from the lobule), so the camera flew through the liver's surface and then a vessel inside it, and each surface was cut by the camera's near plane for a frame.
Rule now: the body is gone before the camera reaches the figure's front plane (`FIGURE_FRONT_Z`, 0.26: every organ's front face and every vessel lies behind it), with a margin of 1.15 (`diveIn` in parts/dive.ts, `frontAt`). The dissolve runs from 1.9 to about 0.45 scene units from the lobule (10 frames on a Mac), the field and its ground fill the screen by then, and the lobule grows out of them as before. Test: `tests/dive-nothing-switches.test.ts` (no frame has any of the body drawn with the camera inside the figure; the organs by the dive's line lie behind the plane).
