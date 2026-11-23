# Fibrosis look (approved by Mohammad, 23 Nov 2026)

Reference: `fibrosis-color-mocks/C-relief-dark.png` and `C-relief-light.png`, built by `fibrosis-color-mocks/render.mts` (C, "Raised relief"), with the amendments below (his words, same day). The plate shader (`src/scene/lobule/plate.ts`: `collagenAt`, `softPass`, `collEdgeA`, relief in `main`) and the painters in `collagen-paint.ts` reproduce it; `tests/collagen-relief.test.ts`, `tests/collagen-tau-stipple.test.ts` and `tests/collagen-under-vessels.test.ts` pin it.

## The reference look (Mohammad, 23 Nov 2026, on 04d8e2d9: "I like the periportal fibrosis"; "can we unify the fibrosis")
The periportal tract is the approved reference: curving bundles with fibre streaks, varying intensity, fading out, no disc. ONE system draws all fibrosis in that look: the cirrhosis septa (a rope of 3 to 6 such bundles along a smooth centre line), the portal tracts, and the
central vein's collar and scar (rings of the same bundles about the vein; SOS, Budd-Chiari and cirrhosis all use it). One painter (`collagen-paint.ts`, the `bundle` function), one colour (the periportal tone), one shader path (`collagenAt`, `softPass`, relief). The vein's old flat
analytic band (cv-band.ts: opaque tan ring, polygonal edge, glow collar) is retired; cv-band.ts only holds the vein's growth geometry now.

## Traits
- Visible ropes: the painter's fibre streaks, with a lit side and a shade side (subtle relief from the slope of the band's height against the one light).
- Tonal variation along the band (the painter's passes, not one flat colour).
- Soft fade inside the band only; crisp edge. Bands of varying intensity that fade out: "should all look like fibrous bands of varying intensity, fade etc".
- Smooth course: "the fibrosis bands should also be smoother (i mean in terms of the course they're running, now they're jagged or have sharp edges)". Centre lines are smooth curves (a Catmull-Rom through the septa's points), widths change gently, and the alpha profile is smooth, so no polyline corners and no kinks where bands meet.
- Round vein: "the central vein fibrosis is just bad" (a flat opaque tan ring, hard polygonal edge, notches where each sinusoid enters, a white glow between sinusoids, no fibres): the vein's collagen is bundles, round, frayed at its ends, no glow.
- Vessels on top: "the fibrosis should not cover up the blood bile or lymph vessels". Every vessel draws after the collagen (the plate's marks write no depth and draw first), in every view, at every growth and in the dive.

- Even and full in every portal area: "the fibrosis bands are sometimes missing in portal areas" (23 Nov). Root cause: the flat disc that used to fill each tract was removed, so only a few randomly placed arcs were left and the gaps between them showed dark (11 to 21 % of a tract bare). The tract is now 10 random bundles plus three rings of five evenly spaced core bundles plus the collar, so at most 5 % of any of the six is bare (`tests/collagen-relief.test.ts`). A tract's share of the collagen in cirrhosis therefore reads a little higher (septa still lead, `tests/septa-dominant.test.ts`).
- Live with the slider: "i want the fibrosis to expand with the slider, not slowly after we choose" (23 Nov). Root cause: the growth (`growth.ts easeGrow`) moved at a fixed 0.35 a second (3 s for a whole change), so a drag ran seconds ahead of the collagen, which then kept growing after the finger stopped. It now closes on the slider with a 0.1 s smoothing and a cap of 2 a second: never more than 0.12 behind a 1 s drag, caught up 0.25 s after it stops, a whole jump (a preset) sweeps in about 0.6 s, never a pop (`tests/fibrosis-growth.test.ts`).

## Rejected
- Glow outside the band, any halo, a flat plateau, blobs.
- Terraces: "banded, looks like glow" (the painter's three passes showing as stepped outlines), and the wide pale apron round a tract.
- A hard-edged pale disc behind the portal venule, clipped straight where it meets the hepatocytes: the tract is bundles only, no flat disc, no clip, and its growth front is soft.
- A stipple or speckle (two overlapping bands tying in the arrival times).
- Braids or cords, a 3D look, dark worms.
- Cutting septa or tracts off at the hexagon line.
