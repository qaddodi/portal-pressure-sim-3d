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
