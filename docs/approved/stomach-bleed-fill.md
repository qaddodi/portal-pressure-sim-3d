# Stomach bleed fill

Ruling (Mohammad, 28 Nov): in every bleed the stomach pool fills halfway at most, never to the brim.

- Cap: POOL_FULL = 0.5 in src/scene/organs/pool-level.ts, the one level the pool's shader and the jet's landing both read (poolShare, poolSurfaceY).
- The puddle (fill 0.12) stands where it did; the level rises smoothly from there to half the lumen's area at a full fill. Easing of poolFill is unchanged.
- Replaces the 25 Nov "fills the whole lumen" call.
- Test: tests/bleed-on-vessel.test.ts, "the cap".
