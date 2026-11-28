# Budd-Chiari clot (approved 25 Nov 2026, Mohammad: "Q+", then "make the clot end before the actual join")

Reference picture: `/mnt/project-files/budd-chiari-clot-mocks-25nov/bcs-clot-built-y-closeup.png` (Approved Q+ and After). Renderer: `/mnt/project-files/budd-chiari-clot-mocks-25nov/render.mts` (runs in node from the app's own veins and clot function).
Before: the app at `8de0ca39` (the mural cast at full occlusion: a flat red slab along one wall with a pale sliver beside it).

## Traits, in his words
- "Q+": the common trunk is clotted more, and the right and middle hepatic veins keep a short full plug, so all three veins still show the occlusion the engine has (thrombus 1 on RHV_IVC, MHV_IVC, LHV_IVC).
- "Does the clot end sharply at the IVC? If so, then can make the clot end before the actual join." It did (a one-pixel hard cut at the cava's wall). Now every clot's cap stops one vein width short of the wall it opens into (the cava, or for the middle vein the trunk), at the vein's centre line (`CLOT_JOIN_GAP`, clots.ts). The wall's cut stays as the safety.
- Common trunk (the left hepatic vein's drawn host, `mergeShare > 0`): its clot is `(1 + 2v) / 3` of 0.42 of the vein at occlusion v (0.42 at v = 1), ending a width before the cava and running on past the middle vein's mouth (`TRUNK_CLOT_SHARE`). The right and middle veins keep `(1 + 2v)` widths (3 at v = 1), also ending a width short.
- Full occlusion fills the lumen: from v 0.82 to 1 the clot opens (eased in, cubed: `clotFillK`) from the mural cast to a plug that spans the lumen edge to edge with blunt ends, no lumps, no ink on its sides (the vein's own wall line is its side), ink on its caps (`CLOT_FILL_FROM`, `CLOT_FILL_TO`, clot-field.ts, in the twin and in the GLSL). Under v 0.82 the mural cast of plan 11 (22 Nov, "A perfect do it": one wall, 3 cel bands, ink on the free edge) is bit for bit what it was (tests/clot-shader.test.ts).

## Rejected (25 Nov), do not return
- A alone (the plug with the old ends), B (plug and tail: the tail is a slab again), Y alone ("None"). P (continuous clots up the right and middle veins) and Q (trunk only: the right and middle veins would show no clot against the engine's thrombus 1).

## Held by
`tests/clot-shader.test.ts` (fill, continuity, GLSL), `tests/hv-clot-ends.test.ts` (ends before the join, trunk length, clearance at every scale), `tests/hv-ostia.test.ts`, `tests/anatomy-placed-devices.test.ts`.

## Ruling, 28 Nov: the TIPS flow in Budd-Chiari
Mohammad kept the small flow through a TIPS in Budd-Chiari (about 2.2 mL/s in the engine, under the engine test's 15% of open flow, `tests/engine-departures.test.ts` and the junction table's own test). It is not to be shut. A TIPS in Budd-Chiari that carries a small trickle is the model's answer, kept on purpose.
