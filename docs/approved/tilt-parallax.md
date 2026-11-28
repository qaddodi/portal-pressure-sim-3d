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
- Direction: see "28 Nov, direction: Turn it round" at the foot of this sheet, which is the ruling. Right edge goes away and you see more of the figure's right side; top edge goes away and you see more of its top. Held for the four turns of the screen.
- The device is read as a rotation from how it is held (a quaternion from alpha, beta and gamma), not as raw beta and gamma, so a phone held upright is as steady as one held flat.
- The held pose is where the phone is now; see "28 Nov, the iPhone review" below for how it moves (it settles to square once the phone is still). It is taken again when the screen turns (tilt held square until 600 ms after the last resize or turn), the tab returns or the permission is first granted.
- 1:1 with the device's turn past a 1 degree dead zone, capped at 7.5 degrees, cushioned over the last degree (below); One Euro filter on the reading; the figure eases in over 160 ms. Nothing snaps.
- The tilt rides a slide's camera glide; it does not dip to square at each slide.
- Off while a finger is on the figure, while the catheter's chase camera is in the picture (his 24 Nov: no tilt while measuring), in the lobule, sinusoid and Circuit, with Reduce Motion, and with the switch off.
- Mac: unchanged. No sensors. The pointer lean in free play stays and stays off on slides.
- A reading wakes the clock only when the figure's largest on-screen move changes by half a pixel or more; a hand's tremor wakes nothing.
- Framing: Fit and the room solver measure without the tilt. The solver keeps every labelled station 40 px inside the free room at all eight corners of the full tilt (7.5 degrees) (`keepDistance`, room.ts). No slide frame was edited.

Code: `src/scene/camera/tilt.ts`, `tilt-input.ts`, `rig.ts` (`stepTilt`), `room.ts` (`keepDistance`), `Stage.tsx` (the gate). Tests: `tests/tilt-parallax.test.ts`, `tests/scene-tilt.test.ts`, and the two "F3 at full tilt" sweeps in `tests/camera-framing-rules.test.ts`.

Not rejected anything. Not yet seen on a device: say "pushed, not yet seen". The sign of each axis is fixed by meaning in node (the projection test), not by a device.

## 28 Nov, ruling: the cap stays
Asked whether to allow more than 5 degrees on every slide except `sites/healthy`, Mohammad: "No tilt past what we decide." The cap is 5 degrees each way on every slide, no per-slide exceptions.

## 28 Nov, final: capped at 7.5 degrees both ways
Mohammad: "Just cap it at 7.5 degree both ways" (after a 20 degree trial, and after "No tilt past what we decide"). This is the ruling and it replaces the 5 degree cap and the 20 degree trial: the device turns the figure 1:1, past a 1 degree dead zone, up to 7.5 degrees each way, in the flipped direction. The room solver and both "F3 at full tilt" sweeps frame for the same 7.5 (DEVICE_CAP_DEG = FRAMING_TILT_DEG), so every slide holds the 40 px station margin and every vein stays 8 px on an iPhone with no exception. To keep `sites/healthy` (upright iPhone, vein at 7.96 px without it) at 8, the solver spends 0.4 px of the sweeps' own 0.5 px tolerance on the 40 px at the tilted corners. Older numbers on this sheet (3.5 by 2.5, 5, 20) are history.

## 28 Nov, the iPhone review: "Also settle back to square"
Asked how the tilt should behave on an iPhone in the hand, Mohammad picked option 2 on the card: **"2. Also settle back to square"** (option 1's three fixes, plus the settle). The card's words are the spec:
- **The stop never holds the figure.** Past the stop the straight pose travels with the phone, so turning back moves the figure from the first degree. Before: a 20 degree change of grip left the figure jammed at 7.5 for 26 s and 78 s from square; 30 degrees, 38 s and 90 s.
- **The stop is cushioned.** The figure follows 1:1 until 6.5 degrees, then slows smoothly and meets 7.5 with no speed left (at 9.5 degrees of device turn past nothing, that is 1 dead + 6.5 straight + 2 of cushion). The cap is still 7.5 both ways. Difference from "1:1 up to 7.5": the last degree of the figure's turn takes two degrees of the phone's.
- **A rolled phone reads the right axes.** The phone's roll about its own screen (rotation lock on, lying on the side) is taken up at once. Before: at a 90 degree roll a 5 degree up and down tilt read as 3.9 up and down plus 3.9 sideways, for good.
- **Settle to square.** The figure eases back to square about 4 s after the phone goes still (a held tilt stays for about 1.5 s, then eases back; within half a degree of square by 4 s). Slides rest as composed. A held tilt no longer stays: this replaces "a held tilt stays locked" and the 30 s follow as the way the figure comes home (the 30 s follow still runs under a moving hand). A phone that keeps rocking keeps its full swing; a trembling hand still settles.

Still means: turning slower than 3 degrees a second (read through a 250 ms average, twice) for 1 s. Numbers: `DEVICE_KNEE`, `DEVICE_RANGE`, `STILL_SPEED`, `STILL_SMOOTH`, `STILL_MS`, `SETTLE_TAU`, `SETTLE_RAMP` in `src/scene/camera/tilt.ts`. Tests: the last five of `tests/tilt-parallax.test.ts`, each on both axes, the four turns of the screen and three ways of holding the phone.

Rejected on that card: "1. Fix the stuck stop only" (keeping the held lock) and "3. Leave it as it is".

Unchanged by that card: the 7.5 cap, the 1 degree dead zone, where it runs, the permission on the first tap, the Mac pointer's lean, the framing for 7.5.

## 28 Nov, direction: "Turn it round"
Asked "How about the tilt direction?", then shown both readings of a window on a card, Mohammad picked **"2. Turn it round"**: right edge away shows more of the right side, top edge away shows the top, like a camera swung round the figure. This is the first build's direction (fd051e8c, 4afc5ea0) and it replaces the flip of 58094d3e ("I personally think it's flipped", earlier the same day). Same in portrait and both landscapes (`tests/tilt-parallax.test.ts`, "worked example" and "direction").

Rejected on that card: "1. Keep the direction as it is" (right edge away shows the left side, top edge away the underside). It was the recommended option; his pick stands.

Every sentence above this section that gives the other direction is history.
