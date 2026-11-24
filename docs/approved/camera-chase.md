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

## 24 Nov, later: "This slide should be zoomed out a bit" (wedge frame, iPhone)
Last two keys pulled back: advance 0.92 distance 1.1 to 1.35, advance 0.995 distance 0.75 to 1.0. Everything else on this sheet unchanged. Also: equation signs (WHVP − FHVP) get two explicit equal spaces (`mspace`) in `TeachingCard.tsx`, because iOS printed the operator's own spacing unevenly.

## 24 Nov, third word: "We agreed to make this view zoomed out right?"
1.0 still read as a close-up. Distances now 4.2, 3.5, 3.0, 2.7, 2.4 (advance 0.62 to 0.995); yaw, pitch, lens unchanged. The aim moves to the middle of (balloon behind, vein ahead) as the tip arrives. Root cause of the WHVP leader running to a dot off the left edge: the WHVP point is 2D's place 6.4 free-vein radii AHEAD of the tip (`proc-catheter.ts aheadAt`), and the camera aimed at the tip, 0.75 to 1.0 away, so that point was off screen. `tests/camera-chase.test.ts` now projects the tip, the balloon's end and that point on a 390x844 phone and fails if any is outside the free room.

## 24 Nov: tilt shelved
Mohammad: "I don't like the 3D camera tilt while the catheter is measuring. Remove it for now." The chase's swing (yaw 0 to -0.55) and tilt (pitch up to 0.16) are off behind `CHASE_TILT = false` in `chase.ts` (keyframes keep their numbers; flip the flag to bring them back). Distance, aim and lens unchanged. The viewer's gentle device tilt (tilt.ts) was already locked during a talk. Not yet seen.
