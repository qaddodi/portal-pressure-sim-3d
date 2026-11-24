# Catheter chase camera (24 Nov 2026)

Approved: Mohammad, 24 Nov, "I like A for move 4". Reference: `/mnt/project-files/camera-move-mocks-24nov/move4-A-chase.png` (HVPG slide 4, iPhone portrait; five frames).

Traits (from the mock's subtitle and captions):
- Slides only (the deck's scene link), never free play or the Tests sheet.
- Numbers are the mock thread's own (move4-A-camera-values.md): at advance 0.62, 0.74, 0.82, 0.92, 0.995 the distance from the aim is 4.2, 2.6, 1.7, 1.1, 0.75 scene units, yaw 0, -0.12, -0.30, -0.45, -0.55 rad (camera toward the viewer's left), pitch 0.05..0.16, lens 20. The aim is on the vein centreline 0.015 of the way ahead of the tip. The five frames are keys; a monotone cubic runs between them (`CHASE_KEYS`).
- It stops framing the wedge with the balloon up: balloon behind the tip, the vein ahead.
- A pure function of the catheter's advance, so Back runs it backwards.

Rules kept: callouts only once reading and camera settled (the rig counts the chase as moving until its pose lands, so `cameraMoving` holds the tags), zero stalls (a few route samples a frame, no layout reads), eases in and out over 900 ms, Reduce Motion lands it at once.

Code: `src/scene/camera/chase.ts` (pose), `rig.ts` (`setChase`, blended in `apply`), `src/ui/deck/scene-link.ts` (drives it). Test: `tests/camera-chase.test.ts`.

Not rejected anything yet. Not yet seen on a device: say "pushed, not yet seen".
