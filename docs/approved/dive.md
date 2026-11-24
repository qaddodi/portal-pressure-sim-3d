# Anatomy to Lobule dive (23 Nov 2026)

Complaint (Mohammad, 23 Nov): "the anatomy -> lobule zoom is still not zooming into the correct place; especially when I'm zoomed into a different area in anatomy".

Rule now: the dive always lands on the liver's one anchor (`LIVER_2D` in `src/scene/lobule/frames.ts`, between the right portal vein and the IVC, owner 20 Nov), framed in the room, from whatever zoom and pan the hand had. The place is never chosen from the camera. The flight eases from the picture as it stands (rig.startDiveHand / stepDiveHand), nothing jumps on the first frame.

Rejected: choosing the place from where he looks or the nearest liver point on screen (put the lobule on the liver's rim or on a vein). Test: `tests/dive-always-to-the-liver.test.ts`.

## 24 Nov 2026 rulings (Mohammad)
- Lobule to sinusoid: the camera must not go to "crazy places" before landing. The sinusoid keeps ONE straight line on screen (rig.ts blendDive turns the aim's offset against the camera roll and lets it go linearly in the move's eased share); `tests/camera-roll-dive-path.test.ts` bounds the deviation, both ways, on Mac, iPad, iPad portrait, iPhone.
- The whole-lobule shot (`lobule`, `lobule:fit`) frames the lobule's own bounds (1.12 R by 0.98 R) in the free room, on every screen but a phone, which keeps its own box. Stations (triad, sinusoid, central) unchanged.
- Case slides: the camera stays where the last slide left it while the case card shows and the patient blends in; the slide's move starts at Next on the card (scene-link.ts, `tests/case-card-camera-waits.test.ts`).
