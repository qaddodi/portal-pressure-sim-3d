# Anatomy to Lobule dive (23 Nov 2026)

Complaint (Mohammad, 23 Nov): "the anatomy -> lobule zoom is still not zooming into the correct place; especially when I'm zoomed into a different area in anatomy".

Rule now: the dive always lands on the liver's one anchor (`LIVER_2D` in `src/scene/lobule/frames.ts`, between the right portal vein and the IVC, owner 20 Nov), framed in the room, from whatever zoom and pan the hand had. The place is never chosen from the camera. The flight eases from the picture as it stands (rig.startDiveHand / stepDiveHand), nothing jumps on the first frame.

Rejected: choosing the place from where he looks or the nearest liver point on screen (put the lobule on the liver's rim or on a vein). Test: `tests/dive-always-to-the-liver.test.ts`.
