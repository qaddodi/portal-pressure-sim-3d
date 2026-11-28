# Approved: Blush, the lighter palette for Light and Soft (28 Nov 2026)

Reference: `/mnt/project-files/palette-mocks-28nov/` (`01-light-overview.png`, `01-soft-overview.png`, `02-*-far-lobules.png`, per-option renders in `full/`, row L2 and S2, "Blush"; the renderer is in `source/`). Mohammad: "can you mock different colors for the light color pallet for light and soft; some of the elements seem too dark, especially when looking at the lobule view, and i can't even see the lobules in the distance that are blurred", then picked **"L2S2"** (Blush for both).
Built in `src/looks/looks.ts` (the one place the values live: `BLUSH_ORGANS` and `BLUSH_TOKENS`, once a file of their own, folded in 28 Nov for the boot entry file ceiling); the lobule's tissue tokens are laid over the generated 2D table by the same file, `lobule/field.ts` paints the neighbours from `--og-field-1` and `-2`. `tests/palette-blush.test.ts` pins it.

## Traits (the mock's, in numbers)
- OKLab recipe on today's tones: Light cell +.07, gap +.10, line +.10, organs +.10; Soft cell +.09, gap +.13, line +.13, organs +.13; chroma x.85, hue -5 degrees (a touch rosier). Grounds, cards, plate, ink and text unchanged.
- Light: liver #AB7A6E, spleen #947E96, kidney #A27F99, gut #CBA293, stomach #C29A90, heart #B67880; lobule cell #F6D0C4, gap #E1A395, line #B17165.
- Soft: liver #9B6B5F, spleen #857088, kidney #94718A, gut #BA9284, stomach #B28A81, heart #A66971; lobule cell #D39987, gap #C27D66, line #8E5845.
- The far lobules have their own tile tones, a lighter cell over a deeper gap: Light #FFD0C0 over #B76C5C, Soft #E4967C over #8C3414. The blur, the wash (0.45 drain, 0.42 and 0.30 toward the page) and the fade are as before.
- Unchanged and still readable: vessel identities (portal, systemic, artery, bile), the pressure and flow ramps, congestion, status colours, text contrast.
- Measured on the mock: far lobules light to shade 1.17 to 1.28 (Light) and 1.16 to 1.30 (Soft); portal and systemic against the liver 16 and 19 (Light), 14 and 18 (Soft) OKLab x100.

## Not in the mock (said so)
- The mock's body panel is a flat stand-in from the organ meshes with the look's organ base tones. The organ painter's own tones (`organ-tones.copied.ts`, the texture over the base) were not touched.
- Dark, Navy and Black are unchanged.

## Rejected (his pick leaves these unbuilt)
L1 Lifted, L3 Clear cells, L4 Bright paper; S1 Lifted, S3 Clear cells, S4 Pale oat.
