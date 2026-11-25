# DIPS (the direct intrahepatic portosystemic shunt on the placed anatomy)

Status: not yet approved. The straight course (3203285e, 25 Nov) is "technically not wrong for demonstration" (Mohammad, 25 Nov) but reads as going into the left portal vein.

## What he asked (25 Nov, 11:56 to 12:28 UTC)
- "Fix dips please" (screenshot: a short bent coil on the portal fork). Fixed in 3203285e: the 0.22 lead of 6c6b8c9d bent the course 56 degrees; now a short in-plane lead, then straight to the cava.
- "The insertion area should be a little bit higher in the IVC, so it doesn't look as if the stent is going into the left portal vein." Mock of A, B, C (cava end at 0.68, 0.76, 0.84, straight): **rejected, all three** ("None").
- "Make the initial path curve kinda to away from the left portal vein then gently curve into the IVC." Mock of curved versions 1, 2, 3 (`/mnt/project-files/dips-mocks/dips-curved-options.png`): awaiting his pick.

## Rejected
- A straight stent with the cava end raised (A, B, C): it still runs up the left portal vein's line from the fork.
- The 0.22 lead between the portal branches (6c6b8c9d): a hook.

## Bounds any build must hold
tests/anatomy-placed-shunts.test.ts (ends in both lumens, smooth, clear of every drawn vessel, arteries 0.005), tests/skin-weld-shade.test.ts (the portal fork under 0.5 %, the cava's confluence under 0.5 %).
