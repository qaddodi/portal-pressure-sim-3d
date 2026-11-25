# Dye injection (inject dye verb, J key)

Status: A PICKED (Mohammad, 24 Nov 8:37 PM ET: "B", then "No wait A sorry", "A"). Reference: /mnt/project-files/dye-mocks-25nov/a.png. A = dye tints the whole lumen, lime #C7F533 (--blood-dye), ink outline unchanged, vessel's own width and fades. B (stream down the middle) and C (calmer cream) were NOT picked.

## Ruled (Mohammad, 25 Nov 2026)
- "Dye should only appear on visible vessels." Never on a hidden vessel, never on a faded-out stretch. In the body view the liver's beds (PRE_*, SIN_*, POST_*) are not drawn, so they never carry dye; the figure shows the portal branches fading into the lobe and the hepatic veins fading out of it, nothing between.
- "This seems wrong" about the current look: lime capsules past the vessel ends, strands at the sinusoids, a blob at the hepatic artery. Rejected.
- Standing: dye stays inside its vessel wall (like the clot rule); no glow; fades go to nothing.

- (Mohammad, 25 Nov 2026, 1:31 AM UTC) "Just have the dye go through hypothetical hidden sinusoidal beds then appear in the hepatic veins with proper dilution perhaps." The bolus still runs through the engine's bed vessels (PRE_*, SIN_*, POST_*) for timing and mixing, but nothing is drawn on them; the dye then shows in the hepatic veins at the diluted strength the bolus gives. Dye is drawn only where the vessel is drawn.

## Root cause (numbers in the thread, 25 Nov)
disease/dye.ts lays a separate shell on every engine edge at the BUILT radius + 0.0035, in the organ pass under the vessels. It ignores (1) the vessel's own fade (31 of 60 dyed vessels have one), (2) its live engine width (collaterals and hepatic veins stand at 36-50% of built width), (3) whether the vessel is drawn at all (the beds, presence.isDrawn).

## Spec for the build (after he picks)
- Dye is painted by the vessel's own shader, so it takes the vessel's width, fade, cuts and ends.
- Dye set = vessels with presence.isDrawn(id); alpha = vessel alpha (fade-alpha.ts vesselAlphaAt is the CPU twin).
- A test over every vessel: no dye on an undrawn vessel, none where alpha is 0, none outside the lumen.
