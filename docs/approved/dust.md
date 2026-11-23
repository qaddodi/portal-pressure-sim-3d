# Dust (the blood's particles inside the lumens): approved sheet

**Reference:** Mohammad's pick of 20 Nov, 15:53 UTC ("I like those particles; make them default"): the Dust Lab settings that are `dustDefaults()` (`src/scene/blood/dust-spec.ts`), drawn by look A (the lattice scan, commit 2ee9f84 and later). It stays one choice away under `?dust` > Look > "A: lattice scan (before)".
**Rebuild (23 Nov, "rebuild the dust/streak and keep options for me to edit under ?dust"):** look B, lane streaks, is the default. Same particles, route table, section frame, tones, wall rule; found per lane and cell instead of per ring and lattice cell (about 2.6 times fewer candidates a pixel in the node twin: 22 against 58; 1 train a lane gives 11).

## Traits that must hold (his words)
- Vessel interior is the vessel colour, outline only on the edges; particles never touch the ink (dWall 0.90 to 0.96).
- Chevrons draw ABOVE the particles. Particles flow on through junctions (routes); chevrons fade out before a junction and in on new branches.
- Streaks move WITH the flow, contained in the vessel, never pop, everything eases (the look switch is an eased weight, crossfading A and B).
- Healthy blood is laminar: only a narrowing swirls or stirs it.
- Tones stay in the vessel's hue family (grey stays grey).
- Defaults: density 2400, size 1, sizeVar .35, soft .4, opacity 1, opVar .5, stretch 1, lenK .33, feather 1, depthDim .5, hueSpread 24, lightSpread .3, flat .5, rhoMax .8.

## Known change of B against A (say it, he decides)
- A streak stays inside its cell: where the blood runs slower than in its source vessel the cell is shorter in that vessel and the streak shortens with it (mean 78 percent of A's length in the node twin; 7 percent of streaks under half). Raise "Cell length" under Lane streaks to give them room.

## Rejected / not done
- Nothing rejected yet for this feature. Baked particle texture (option C) not built.

## 23 Nov, later: page-coloured holes at junctions with look B (not with look A)
Mohammad's screenshot: blocks and specks of exactly the page colour (#1A1917) in the shape of streaks at a junction; gone with dust off and with look A. They are pixels that were not drawn (not dark dust: the dust only ever changes colour). Node fuzz of look B's math (20 million candidates, real route tables, random frames) found no NaN or infinity, so the cause on the device is NOT proven. What differed from A was code shape only: B alone had `break`, an `out` struct parameter, an `ivec3` return and float to int conversions of computed loop bounds. B is now written in A's shape (tests/dust-lanes.test.ts pins it). If the holes persist, look A is the fallback (?dust, Look) and the next step is a magenta marker for bad dust pixels.

### 24 Nov correction (same day, later): the holes are on iPhone and Mac with look B, on a normal load too
The first rewrite (A's shape) did not fix it. What still differs from A is that B's lane and train loops had CONSTANT bounds (12 and 2), so a driver unrolls them into 24 copies of the whole particle path in every segment (look A's own loops have runtime bounds for exactly that reason, see its comment). The bounds are now numbers the pixel works out (dLaneSpan's count, capped at DUST_LANE_LOOK, and the trains from the uniform), pinned in tests/dust-lanes.test.ts. Still not proven on a device.

**24 Nov, the black blocks at the junctions, iPhone (root cause).** `dSafe` tested a NaN or infinity with a comparison (`dot(v, v) < 64.0`). A phone GPU compiles with fast maths and assumes no NaN, so the compiler may fold that comparison away: a NaN term of the dust went through, `clamp` and the product with the wall left it a NaN, and the pixel was written as 0 0 0 (the 19 Nov vertex NaN drew the same black). It is now found on the bits (exponent all ones, `dBad`), in every particle (so one bad streak is dropped, not the pixel's whole dust) and again on the dust the tube and the skin paint. Same look, same numbers.
