# Lite figure: a calmer figure for machines that cannot run the full one (25 Nov 2026)

Approved: Mohammad, 25 Nov ("Do: 3,9,11,12,13": item 3, proposal P2 in the independent review). The look below is the review's own description of P2; nothing else about the look was asked.

What the person sees (keep every trait):
- The same app and the same numbers, with a calmer figure. The vessels stay live (the flow still moves). The organs are not shaded (Organ depth off; the cached one-layer organ paint joins when the rest-state work lands it).
- No glass blur (the solid look), no depth of field, no gentle tilt, no blood streaks, no living fluid, no device shadows.
- Drawn at 1x whatever Figure detail says, and about 20 frames a second (one frame in 50 ms at the most, `clock.setFrameFloor`; 15 to 20 reads as calm motion on a slow machine).
- Settings > Display, first row, a switch: **Lite figure**. Its quiet line says **Chosen for this device** while the device chose it; when the person turned it on, "A calmer figure for slower devices: it draws less and moves at about 20 frames a second". The switch is how the full figure is tried.
- Turning it off gives the person's own switches back exactly as they were (they are kept underneath); a switch the person turns on while lite stands is theirs and stays on.
- Nothing snaps: the pixel ratio and the pacing change at rest, the glass follows its own ease, and the flow and organ switches ease through their existing glides.

When the device chooses it (only while nobody has chosen; a person's choice, either way, is never overruled):
1. At boot, before anything is drawn: the renderer's own name is a software one (SwiftShader, llvmpipe, softpipe, Microsoft Basic Render Driver, "software"), or a context made with `failIfMajorPerformanceCaveat` is refused while WebGL 2 exists (`src/boot/webgl.ts` `softwareRenderer`; probe contexts are given back at once; the name is never stored or sent).
2. After the first picture: the first five drawn frames of the figure average over 250 ms (`src/state/lite.ts` `FrameProbe`, fed from `Stage.tsx`).
The choice is saved (`pps3d.settings.v1`: `lite`, `liteBy`). Reset everything clears it, and the device decides again.

Not in this change (named so nobody looks for them): the browser floor and the "browser not supported" page (review item 1, not approved); the cached organ layer (the rest-state thread, P1); phone and iPad real-device checks (item 17).

Where it lives: `src/state/lite.ts` (the rule and the overlay), `src/state/settings.ts` (`lite`, `liteBy`, `setLite`, the person's own values kept in `own`), `src/clock/frame.ts` (`setFrameFloor`), `src/scene/quality.ts` (1x), `src/scene/Stage.tsx`, `src/main.tsx`, `src/ui/settings/SettingsSheet.tsx`.
Tests: `tests/lite-figure.test.ts`.
