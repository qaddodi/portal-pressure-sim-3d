# Catheter chase camera (24 Nov 2026)

Approved: Mohammad, 24 Nov, "I like A for move 4". Reference: `/mnt/project-files/camera-move-mocks-24nov/move4-A-chase.png` (HVPG slide 4, iPhone portrait; five frames).

Traits (from the mock's subtitle and captions):
- Slides only (the deck's scene link), never free play or the Tests sheet.
- The camera glides in behind and outside the catheter tip as it advances up the cava into the hepatic vein: 4.2 scene units from the tip at the start (whole liver in view) to 0.75 at the end.
- It swings round the tip with the vein's bend, 0 to 32 degrees, to the OUTSIDE of the bend.
- Lens 20 degrees (the figure's rest lens is 14).
- It stops framing the wedge with the balloon up: balloon behind the tip, the vein ahead.
- A pure function of the catheter's advance, so Back runs it backwards.

Rules kept: callouts only once reading and camera settled (the rig counts the chase as moving until its pose lands, so `cameraMoving` holds the tags), zero stalls (a few route samples a frame, no layout reads), eases in and out over 900 ms, Reduce Motion lands it at once.

Code: `src/scene/camera/chase.ts` (pose), `rig.ts` (`setChase`, blended in `apply`), `src/ui/deck/scene-link.ts` (drives it). Test: `tests/camera-chase.test.ts`.

Not rejected anything yet. Not yet seen on a device: say "pushed, not yet seen".
