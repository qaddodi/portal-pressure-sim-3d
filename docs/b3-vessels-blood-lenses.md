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

## Draw calls
One draw per vessel: the geometry holds the tube twice (`withHull`, attribute `hull` 0 for the body, 1 for the ink's hull) and the vessel shader draws the body's front faces and the hull's back faces (pushed out in screen pixels) in the same mesh. 55 vessels plus the organs are 86 meshes (about 52 to 70 of them visible for a patient), under the spec's 100. `CelObject.ink` stays as the highlight's handle on the merged material's uniforms.

## Joins, depth and braids (19 Nov, evening)

- **Vessels are drawn over the organs** (`CelScene.render`): the organs in one pass, the depth cleared, then everything on camera layer 1 (vessels, catheter, varices). No organ relief cuts a vessel, as in the 2D figure.
- **Depth continues through a node** (`NODE_Z`, `shape.ts to3`): a vessel keeps its tier between its ends and eases to the depth of the node it meets over its first and last quarter, so joined vessels meet in one place in a turned view.
- **Run-ons taper** (`NetVessel.taper`, `tubes.ts`): where exactly two vessels meet, both ease to their mean width over the last third (the 2D tubes' own end profile, `tubeRadius`).
- **Coil, braids, tributaries**: `coil.ts` (literal ports of `wiggle`, `braid`, `blendFrom`, `strandAt`), `coil.copied.ts` (generated: STRANDS, STRAND_FROM, FEEDERS as `feedGeo` shapes them), `shape.ts`, `shape-track.ts` (a collateral coils as it opens, the varices' strands fan with their varix; positions are rewritten in place, vertex counts are fixed at rest). Done 19 Nov (evening): the cavernoma's channels (`cav.ts`, `cavernoma.copied.js`), the bands' effect on strands and the varices' bead (`varix-bead.copied.js`, `band-ease.copied.js`).

## 19 Nov, evening: joins, fades, the veil (this thread)
- **Run-ons and smooth joins**: `joins.ts` + `fork-joins.copied.js` (2D's own rule): `RUN_ONS` in `network.ts`; the pairs' courses are redrawn as one cubic through the join (`smoothRunOns`, 2D vein-joins.js), and their widths ease to the mean.
- **Fork fillets**: `NetVessel.flare` (a collar at a branch's end, at the host's wall; blend width 2D's `kOf`), built in `tubes.ts` (`flareAdd`). Run-on ends have none.
- **Free-end fades** (`fades.ts`, `fades.copied.ts`): TIP_FADE, ART_FADE, FADE_DOWN_Y as shader uniforms (`fadeMode`, `fadeA`, `fadeKeep`); the fading vessels are blended.
- **The veil** (`VesselObject.setBehindOrgans`): BACK_EDGES drawn with the organs and again over them at 0.4; the cava only faint.
- **Guard against a vanishing vessel on a real GPU**: `tests/shader-redefinition.test.ts` (a duplicate declaration is a compile error on a device; the node tests compile nothing).
- **Still open**: chevrons chaining through joins (2D's stream chain, blood.js `chainParentsInto`/`createStreamChain`; the heads still fade out at each vessel's ends), the cava drawn whole when selected (F_WHOLE), the extra fade where veins join the faint cava (IVC_JOIN), liver beds and sinusoid fans in the 2D look, the Circuit's fate of the tributary fans (they leave with the organs).
