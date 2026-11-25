# Ascites surface (23 Nov 2026)

Approved look: **mock C, "soft meniscus + faint sag"** (`/mnt/project-files/ascites-surface-mocks/ascites-surface-A-B-C.png`). Mohammad picked it ("C") on 23 Nov.
Complaint it answers: the fluid was a flat-topped tray with hard corners where its top meets the wall (capture 86fc123e, Ascites 15, Albumin 4).

Traits (keep every one):
- The surface climbs the wall in a soft concave meniscus: `CLIMB_PX` 20 over `CLIMB_FALL_PX` 28 (ascites-pool.ts), no hard corner.
- Between the walls the surface sags a little: `SAG_PX` 5, easing in over `SAG_FALL_PX` 90 from each wall. Not flat, not a bowl.
- Volumetric and organic, real front-to-back depth (hull unchanged); the ink line, colour and ripple are unchanged.

Rejected: A (the flat top with sharp corners, the old look).
Tests: `tests/ascites-living.test.ts`, `tests/ascites-hull-integration.test.ts`.

## Low-fill contour (24 Nov 2026)
Complaint (screenshot, build 46f79700, Decomp cirrhosis ~1.5 L): at low fill the pool's side walls lean in and the tips point sideways, as if the water will not include the colon; even at the start the walls should head a little outward.
Root cause: 2D's wall closes in 26 deg at its lower belly (y 954) and its floor curve turns in at 29 deg, so the wall leaned in 63 / 39 / 27 deg at the waterline at 0.3 / 1 / 1.5 L, with the colon (left edge x 416) outside the tips.
Fix: `roundedFoot` (ascites-pool.ts, `FOOT`): below y 760 the wall eases to a near-vertical tangent (`endSlope` 0.15, about 9 deg) at y 962, then rounds into 2D's floor bottom. Above y 760 (fuller than about 5 L) nothing moves; the meniscus, sag, hull depth, ink and ripple are untouched.
Now: 1 L 20 deg, 1.5 L 9 deg, 2.5 L 12 deg at the waterline; the waterline at 1.5 L sits about 25 units outside the colon's edge. A 0.3 to 0.6 L film is still a shallow lens (it is under the 70 units the floor is deep).
Tests: `tests/ascites-belly-curve.test.ts`. Side by side: /mnt/project-files/ascites-lowfill-24nov/before-after-1500ml-4x.png (headless node render of the 2D contour, not a device shot).

## Round belly for the placed anatomy (24 Nov 2026)
Approved look: **B, "round belly"** of `/mnt/project-files/ascites-new-anatomy-24nov/ascites-options-A-B-C.png`. Mohammad picked it ("B") on 24 Nov. Complaint it answers: with `?anatomy=new` the ascites was a flat-walled yellow tub around the gut (the old 2D outline, drawn for the old organs).
Root cause: `polyOf` returned 2D's fixed outline (x 336..1088, floor 1041). The placed gut spans x 453..1038 and its rectum reaches y 1098, so the tub stood 117 units wider than the gut each side and the rectum stuck out under the floor.
Traits (keep every one):
- The wall is the gut's own edge (colon and small bowel silhouettes) plus a margin that grows with the volume (36 empty to 58 full), smoothed (SIGMA 70), bowed out 56 at mid height, flared 14 at the top corners (the costal margin), and rounded into a floor that starts just under the rectum: 12 under the gut's lowest row, 14 under the rectum's lowest point (`src/scene/disease/ascites-cavity.ts`, `CAVITY`; ruling below).
- The low-fill flare is kept: the wall closes in no faster than 0.3 per unit going down and eases to upright at the join (y 980), so at 1.5 L the waterline stands out past the colon's lower flank with sides leaning about 5 degrees.
- Everything else on this sheet holds: mock C meniscus and sag, volumetric hull, real AP depth, ink, colour and ripple (only the polygon changed). Today's anatomy still uses 2D's outline with the belly curve and rounded foot until the cut-over deletes it.
Rejected: A "wraps the gut" (a pelvic funnel), C "full belly" (a wide basin); the old tub.
Tests: `tests/ascites-cavity.test.ts`; `tests/ascites-hull-integration.test.ts` (the floor is six bands under the placed anatomy). Side by side: `/mnt/project-files/ascites-new-anatomy-24nov/before-mock-built.png` and `overlay-mock-vs-built.png` (built vs picked mock: 11 units at most), headless node renders from the app's own code.

Floor ruling (25 Nov, Mohammad on capture 349aee92: "make the ascites start a little bit higher place? its initial base a bit higher, just a bit lower than the rectum basically"): the floor's lowest point is 14 units under the rectum (`FLOOR_PAD` 12, it was 40, so 42 under). Only the floor rose; the wall, the bow, the flare, the surface and the depth are as above. Test: `tests/ascites-cavity.test.ts` (6 to 25 units under the rectum). Side by side: `/mnt/project-files/ascites-new-anatomy-24nov/floor-before-after.png`.
