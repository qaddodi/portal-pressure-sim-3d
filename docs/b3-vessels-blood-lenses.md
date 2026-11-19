# B3: vessels, blood and lenses

What the 2D figure draws, in 3D: every vessel by engine edge ID, the moving blood, twelve colour lenses with a key, and the Blood menu's figure options.

| Folder | What it holds |
|---|---|
| `src/scene/vessels/` | `network.ts` (55 vessels, `NETWORK`, presence rules), `vessel-object.ts` (a `CelObject` with the lens- and blood-aware shader), `shaders.ts`, `presence-track.ts` (draw on / retract), `paths.copied.ts` (2D courses, generated) |
| `src/scene/lenses/` | `model.ts` (the twelve lenses' colours per edge from an engine frame), `field.ts` (two lens states on the GPU, 420 ms crossfade), `legend.ts` + `Legend.tsx`, `blood-model.ts` (origin and oxygen), copied tokens, words and velocity model |
| `src/scene/blood/` | `options.ts` (Blood menu choices, `useBlood`, kept in localStorage), `marks.ts` (chevrons by flow-mark option, key chevrons, presence) |

## How to use it
- `sceneApi.setLens('velocity')` colours the veins (`'neutral'` for the plain anatomy); `useLens` holds the choice for menus and the key. Arteries keep their own colour under every lens, as in 2D.
- `sceneApi.setBlood({ chevrons, keyChevrons, collaterals }, presenting)`; `BLOOD_MENU` has the menu's rows and words. `chips` and `labels` are for the tags and cards.
- `<Legend />` (`src/scene/lenses/Legend.tsx`) draws the key; the shell mounts it and sets `--lg-title`, `--lg-num`, `--lg-width`.
- `sceneApi.loadHealthy()` fetches the healthy patient at rest once the engine is ready (Stage does this); the change, congestion, velocity and direction lenses compare to it.

## Rules kept
- A vessel is named by its engine edge ID everywhere (the artist's real anatomy replaces geometry, not names). Surgical shunts and stents are B5's: build them as `NetVessel` and `VesselObject`.
- Copied 2D data is generated: `node scripts/copy-b3-data.mjs --from <2D repo> [--check]`. `PPS_2D_REPO=<path> npm test` proves the copies are current.
- Nothing is drawn per frame by the CPU: lens colours are two 208 x 2 float textures per lens set, recomputed at most every 90 ms from the engine's frames; the crossfade, chevrons, smoke and ghost threads are shader work. A vessel that comes or goes draws on and retracts along its flow (`presence-track.ts`).

## Known gap
Draw calls: 141 meshes (107 to 125 visible) against the spec's 100. One draw per vessel (ink hull and toon in one mesh) is the way down; it is a change to the scene's material. `tests/scene-vessels.test.ts` keeps the spec check as a TODO and a guard that it does not grow.
