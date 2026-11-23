# Fibrosis look (approved by Mohammad, 23 Nov 2026)

Reference: `fibrosis-color-mocks/C-relief-dark.png` and `C-relief-light.png`, built by `fibrosis-color-mocks/render.mts` (C, "Raised relief"). The plate shader (`src/scene/lobule/plate.ts`, `collagenAt`, `softPass`, relief in `main`) reproduces it; `tests/collagen-relief.test.ts` pins it.

## Traits
- Visible ropes: the painter's fibre streaks, with a lit side and a shade side (subtle relief from the slope of the band's height against the one light).
- Tonal variation along the band (the painter's three passes, not one flat colour).
- Soft fade inside the band only; crisp edge.

## Rejected
- Glow outside the band, any halo, a flat plateau, blobs.
- Braids or cords, a 3D look, dark worms.
- Cutting septa or tracts off at the hexagon line.
