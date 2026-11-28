# Tilt parallax on iPhone and iPad (28 Nov 2026)

Approved: Mohammad, 28 Nov, "1a, 2a, 3a" on the plan at `/mnt/project-files/plans/tilt-parallax.md`. It builds on the 19 Nov "Gentle tilt" (Settings > Figure depth > Gentle tilt, on by default), which stays the switch.

Ask, in his words as the plan records them: when you tilt the iPhone or iPad the 3D figure turns a little the opposite way, as if it stayed still in space behind the glass, so it reads as 3D. It is not an orbit.

Picks:
1. **Where it runs: (a)** every place the body figure shows, slides included, as well as free play. The lobule, the sinusoid and the Circuit stay still.
2. **iOS permission: (a)** asked on the first tap anywhere (a click, or a touch's pointerup), never on load; a refusal leaves the figure still and is not asked again.
3. **Strength: (a)** 3.5 degrees side to side and 2.5 degrees up and down (his 19 Nov limits).
   **28 Nov, later: "very subtle, make it more pronounced", then "It should look as if the glass of the iPhone is looking at a 3D structure when moved so it should be locked in space tilt wise".** This replaces the 3.5 by 2.5 numbers for the device: the figure counter-rotates by the device's own turn, 1:1 (past a 1 degree dead zone), the way a window onto a structure fixed in the room would. It is capped at 5 degrees each way (DEVICE_CAP_DEG), the most that holds the 40 px station margin on every slide with every vein still 8 px on an iPhone (6 degrees pulls `sites/healthy` under 8 px). Past 5 degrees of device turn the figure stops turning. The held pose follows a steady hand over 30 s (it was 6 s) so a held tilt stays locked. The Mac pointer's lean keeps 3.5 and 2.5.
   **Direction, in one sentence (flipped on the owner's word, 28 Nov, "I personally think it's flipped"; the first build and the 1:1 build had the other direction):** tipping the screen's top edge away from you lowers the camera so you see more of the figure's underside, and tipping its right edge away moves the camera left so you see more of its left side; same in portrait and both landscapes (tests/tilt-parallax.test.ts, "worked example").

Traits:
- The figure turns the OPPOSITE way to the device. Right edge goes away: the near side of the figure moves toward the near (left) edge and the far side the other way. Top edge comes toward you: the near side rises. Held for the four turns of the screen.
- The device is read as a rotation from how it is held (a quaternion from alpha, beta and gamma), not as raw beta and gamma, so a phone held upright is as steady as one held flat.
- The held pose is where the phone is now; it follows a steady hand with a 30 s time constant, and is taken again when the screen turns (tilt held square until 600 ms after the last resize or turn), the tab returns or the permission is first granted.
- 1:1 with the device's turn past a 1 degree dead zone, capped at 5 degrees; One Euro filter on the reading; the figure eases in over 160 ms. Nothing snaps.
- The tilt rides a slide's camera glide; it does not dip to square at each slide.
- Off while a finger is on the figure, while the catheter's chase camera is in the picture (his 24 Nov: no tilt while measuring), in the lobule, sinusoid and Circuit, with Reduce Motion, and with the switch off.
- Mac: unchanged. No sensors. The pointer lean in free play stays and stays off on slides.
- A reading wakes the clock only when the figure's largest on-screen move changes by half a pixel or more; a hand's tremor wakes nothing.
- Framing: Fit and the room solver measure without the tilt. The solver keeps every labelled station 40 px inside the free room at all eight corners of the full tilt (5 degrees) (`keepDistance`, room.ts). No slide frame was edited.

Code: `src/scene/camera/tilt.ts`, `tilt-input.ts`, `rig.ts` (`stepTilt`), `room.ts` (`keepDistance`), `Stage.tsx` (the gate). Tests: `tests/tilt-parallax.test.ts`, `tests/scene-tilt.test.ts`, and the two "F3 at full tilt" sweeps in `tests/camera-framing-rules.test.ts`.

Not rejected anything. Not yet seen on a device: say "pushed, not yet seen". The sign of each axis is fixed by meaning in node (the projection test), not by a device.

## 28 Nov, ruling: the cap stays
Asked whether to allow more than 5 degrees on every slide except `sites/healthy`, Mohammad: "No tilt past what we decide." The cap is 5 degrees each way on every slide, no per-slide exceptions.
