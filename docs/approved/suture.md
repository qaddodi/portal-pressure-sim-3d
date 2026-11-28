# Surgical sutures (approved 28 Nov, Mohammad)

Reference: the mock sheet `/mnt/project-files/suture-looks-28nov/sheet-2.png`, column B ("slanted bites"). Built in `seamStitch` (`src/scene/vessels/glsl-shared.ts`), used by the tube's marks and the welded-end ribbon (`vessels/suture.ts`).

Traits (his pick, "B: slanted bites"):
- Short stitches cross the seam, each leaned along it, like an anastomosis. Six per seam, sized by the lumen's half width.
- Cel shaded: flat pale thread, crisp ink outline, one pixel of smoothing. No glow, no soft falloff.
- Where the seam runs nearly along the vein (the splenorenal shunt's hook) the stitches ease out, so no stray streak.
- Every sewn end (S_DSR, S_PC side to side, S_MC, REX) uses this one rule. The divided-vein stump tie keeps the shared thread profile.

Rejected: A (bold ink dashes), C (ticks with knots), today's soft thin dashes.
