# BRTO and the gastric varices (25 Nov 2026)

Not approved looks yet: this sheet records the complaint, what was built, and what he rejected. Update it when he rules.

## His words (25 Nov, doing the BRTO)
- The sclerosant "doesn't really follow the paths of what's drawn... we injected sclerosant into a hidden vessel that we don't see on the screen."
- The gastric varices and the gastrorenal shunt "grow appropriately", but once very filled "they snap from being straight to being a little curved, which is nice, but it shouldn't be a snap. Everything should be a transition." (Standing rule: every change of shape is a transition, never a snap. It is rule 12.)
- The varices "seem to be smaller" than the shunt; the EUS needle "misses and it puts a coil in the air... it looks like it's in the stomach, not really inside a blood vessel."
- The BRTO catheter's tip is "hidden behind the splenic vein" while injecting.
- "The zoom is bad because you're zooming out while you're injecting the sclerosant."
- "The color of it kind of sucks." (Rejected: the sclerosant's brown amber, token `trScler`, light #9a5505. Colour unchanged until he picks from /mnt/project-files/sclerosant-colour-mocks-25nov/.)

## Root causes (measured in node)
1. Column off the drawn vessel: the catheter's route is laid once on the shunt's REST course (straight); the shunt is drawn at the curve its fill gives it (coil strength to 5, sideways travel up to one lumen radius). Fix: `vessels/live-shape.ts` (ShapeTracks reports each vessel's shape when it rebuilds); `route3d.follow()` carries every route sample of a coiling vessel by how far the drawn course has left the rest course; `ProcCatheter` lays shaft, needle, wire and column again, `ProcedureLayer.update` calls it. Test: tests/brto-follows-drawn-shunt.test.ts.
2. The route stopped at the shunt's end, so the column never entered the varices it is for. The BRTO route now runs on into C2 (the fundal varices) against the flow (`brtoPlaced`, route-placed.ts).
3. The snap: `CoilState` made the coil a switch (coiled once more than a quarter open) with a target that moved only in 0.6 jumps, so the strength stepped 0 to 2.4. Now `coilTarget(shown)`: nothing below 0.2 open, the 2D strength (1.5 + 3.5 open) from 0.45, eased between. The full strength is unchanged (5).
4. The coil in the air: the EUS glue's course was C2's trunk, which is not drawn (radius 0) and lies between the strands. `glue-cast.ts geoNow()` now returns the widest drawn strand, and the varix's width is that strand's. The coil is tested inside the strand at rest and at full spread.
5. Small varices: the strands were 0.42 to 0.55 of the trunk's width (the widest 0.49 of the shunt). `GV_STRAND_K` 1.6 on C2's strands: the widest is 0.79 of the shunt.
6. Tip behind the splenic vein: the tip and balloon stood at 0.2 of the shunt, 2.4 splenic radii from its outline, and the column runs on under it. `BRTO_TIP_AT` 0.13 (5 radii clear). The 2D spec said 0.2.
7. Zoom: the injection's frame (`stepShot` fill) was the whole way from the cava; it is now the shunt from its mouth and the varices (route `focus`).

## Open
- Sclerosant colour: waiting on his pick (A foam white recommended).
- BATO runs on C2's trunk as a catheter route (not touched).
