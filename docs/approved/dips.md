# DIPS (the direct intrahepatic portosystemic shunt on the placed anatomy)

Status: **approved, 25 Nov 2026 12:53 UTC** ("#2", "2 from this picture yes"). Spec: panel 2 of `/mnt/project-files/dips-mocks/dips-his-course.png` (the middle panel; the right one is the same with his drawn line traced over it). The code is `anatomy/placed-network.ts` `DIPS_DRAWN`.

## The look (his words and what they mean)
- His drawing on the screenshot (6c82a109): "Make the initial path curve kinda to away from the left portal vein then gently curve into the IVC." The tract leaves the portal bifurcation heading straight up and a little to the screen-left, well away from the left portal vein, crosses the right hepatic artery near the start, arcs over in one wide curve, and runs up and right into the cava.
- Course (front view, scene x, y, after the fork at -0.294, 0.435): (-0.322, 0.48) (-0.326, 0.53) (-0.312, 0.572) (-0.282, 0.616) (-0.25, 0.646) (-0.215, 0.658), ending on the cava's centreline at height 0.665 (the caudate's lower third; about 0.07 above the straight course).
- Landing on the cava's **centreline**, not its right half as drawn.
- Stent at its **true 8 mm** width (his sketched tube was wider).
- Depth: from the fork's to the cava's evenly along its length (0.31 long). Held level first and then eased, the left portal vein's rim inks 1.2 to 1.5 % of the fork, or the fork's weld drops the DIPS and leaves a flared end; evenly it is welded and the fork inks 0.64 % (front view) and 0.62 % (turned): the portal fork's shading bound is now 0.8 % (the cava's confluence stays 0.5 %). Decided 25 Nov, Mohammad not asked; say if he wants the 0.5 % back and the course changed for it.

## Rejected (25 Nov)
- The 0.22 lead between the portal branches (6c6b8c9d): a 56 degree hook on a 0.23 tract.
- The straight chord (3203285e): "technically not wrong", but it ran up the left portal vein's line and read as going into it.
- The straight stent with its cava end raised, A (0.68), B (0.76), C (0.84): "None."
- Curved mocks 1, 2, 3 of `dips-curved-options.png`: not picked; he drew his own instead.

## Bounds any change must hold
`tests/anatomy-placed-shunts.test.ts` (ends in both lumens, smooth, clear of every drawn vessel (the arteries 0.005), the drawn points on the course, one wide arc, the stent on it at 8 mm), `tests/skin-weld-shade.test.ts` (the portal fork and the cava's confluence under 0.5 %).
