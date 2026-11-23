# Ascites surface (23 Nov 2026)

Approved look: **mock C, "soft meniscus + faint sag"** (`/mnt/project-files/ascites-surface-mocks/ascites-surface-A-B-C.png`). Mohammad picked it ("C") on 23 Nov.
Complaint it answers: the fluid was a flat-topped tray with hard corners where its top meets the wall (capture 86fc123e, Ascites 15, Albumin 4).

Traits (keep every one):
- The surface climbs the wall in a soft concave meniscus: `CLIMB_PX` 20 over `CLIMB_FALL_PX` 28 (ascites-pool.ts), no hard corner.
- Between the walls the surface sags a little: `SAG_PX` 5, easing in over `SAG_FALL_PX` 90 from each wall. Not flat, not a bowl.
- Volumetric and organic, real front-to-back depth (hull unchanged); the ink line, colour and ripple are unchanged.

Rejected: A (the flat top with sharp corners, the old look).
Tests: `tests/ascites-living.test.ts`, `tests/ascites-hull-integration.test.ts`.
