# Split orbit (camera move 7), approved 24 Nov 2026

Mohammad, 24 Nov 02:31 UTC: "let's do the one from front side by side".

**Reference pictures** (project files, `camera-move-mocks-24nov/`): `move7-mac-slides-7-and-11.png` (three turns of both slides),
`move7-mac-slide7-front-full.png`, `move7-mac-slide11-turned-full.png`, phone: `move7-A-side-by-side.png`. Rejected: `move7-B-stacked.png`.

## Traits
- Slides only (never the free figure). Mac, iPad and iPhone. Zero stalls.
- Front view: two livers side by side in the slide's free room, healthy on the left, the slide's patient on the right.
  Each has its name above it in the slide's own type ("Healthy", "Schistosomiasis", "Right heart failure"), plain words, no pill, no box.
- The patient cards stay where they are; the figures live right of the cards.
- Both livers turn together, in sync, through the same angles: about -49 degrees, front, +49 degrees (the mock's three frames), eased, never popping.
- First slides: HVPG slide 7 (healthy beside schistosomiasis), slide 11 (healthy beside right heart failure).

## Build plan (decided 24 Nov: twin scene, only on split slides)
The scene (`CelScene`) is one object per page and reads the engine through module globals (`latest`, `live`, `patient`, `shownParams` in `src/engine/store.ts`; about 15 sites in `scene.ts`), plus `dustTuner` and `flowRate` singletons. So:
1. `CelScene` takes a frame source (defaults to the globals); the twin gets a healthy frame from `enginePool.sequence`, its own `VesselData` texture and its own `CameraRig`.
2. Built at reduced detail, sharing geometry and textures with the main scene, only when a split slide is next or showing; built in idle slices, never inside a frame; disposed as the slide is left. A test pins the dispose (no geometry, texture or listener left).
3. Render: two scissored viewports of the one canvas, left twin, right main, one orbit angle for both (about -49, 0, +49 degrees, eased); labels above each; cards unchanged.
4. Slide field `split: { with: 'healthy', labels: [...] }` on HVPG slides 7 and 11 first.

Status: sheet only. Nothing built or seen on screen yet.
