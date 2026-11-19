# Lobule and sinusoid views (batch B8)

> **Sinusoid view, 19 Nov 2026 (atlas look plan WP7): lifted from 2D.** The placeholder 3D cut (layers of cel-shaded slabs) is gone. `src/scene/sinusoid/view.ts` runs 2D's own
> tissue shader and albumin sprites (`sinusoid-gl.js`) on a plane in the sinusoid's frame, so the tissue fills the screen to every edge; 2D's traffic and palette code come with it.
> All of it is copied by `node scripts/copy-sinusoid.mjs --from <2D checkout> [--check]` into `gl.copied.ts`, `traffic.copied.js`, `palette.copied.js`; never edit those.
> The dive hook is `view.setDive(g)` (the scene sets it from the camera's distance while flying, `null` at rest); at rest the lobule is hidden and the tissue is opaque everywhere.
> There is no artist swap-in for the sinusoid any more (its parts exist for the API; everything is drawn in `lumen`). The part table below is the lobule's now.


19 Nov 2026. `src/scene/lobule/` and `src/scene/sinusoid/` (this batch owns only these). Placeholder art, built once at start-up, with named parts so
the artist's model swaps in part by part (stage 4). Rows closed: honeycomb, sinusoids, stellate cells, collagen, congestion, lymph chevrons on the
ducts, the wedge's amber spread, the lobule camera shots.

## What the 2D app does that this matches

| 2D | 3D here |
|---|---|
| `lobule-zoom.js build()`, seed 7 | `lobule/geometry.ts buildLobule()`, same seed and draw order: six triads, 12 inlets, 48/24/12 sinusoids, cross-links, central vein, arteriole twigs, 3 septa, hepatocyte cords, stellate cells, lymph (tract lymphatics, terminal lymphatics, space of Disse beside each sinusoid) |
| `lobule-model.js lobuleStateInto` | `lobule/model.ts lobuleModel(frame, healthy, params)` |
| `sinusoid-model.js sinusoidTargets` | `lobule/model.ts sinusoidTargets(model)` |
| `lobule-wash.js`, `sinusoid-wash.js` | `lobule/wash.ts` (700 ms delay, 3.4 s, eased; front from the central vein out) |
| deck cameras `lobule`, `lobule:fit`, `lobule:triad`, `lobule:sinusoid`, `lobule:central`, `sinusoid` | `lobule/shots.ts lobuleShot(cam)` / `sinusoidShot()`, returned as the scene's own `Shot`, so `sceneApi.goTo(shot, room)` flies to them straight from any view |
| Lymph layer | lymph ducts shrink to nothing when it is off (never pop) |
| Lymph chevrons on the ducts, none in the sinusoid view (owner) | lobule: terminal lymphatics run marks in toward the tract, the space of Disse's run out against the blood; both quicken with `lymphRate`. Sinusoid view: the only marked vessel is the blood's lumen |
| Views open instantly (17 Nov) | everything is built in the constructor; opening is a camera move. `view.warm(gl, camera)` compiles and uploads ahead of the dive |

## Mounting (for the shell and scene threads)

```ts
import { LobuleView, SinusoidView, lobuleShot, sinusoidShot, lobuleModel, sinusoidTargets, litParts } from '../scene/lobule/index.ts';
const lobule = new LobuleView(cel.shared, { look, phone });  cel.scene.add(lobule.group);
const sinus  = new SinusoidView(cel.shared, { look, phone }); cel.scene.add(sinus.group);
// in CelScene.update(now): needs = lobule.update(now) || sinus.update(now) || needs
// in applyLook / setPhone / setFlowMode: forward to both views
// when the view is Lobule or Sinusoid: view.setVisible(true), sceneApi.goTo(lobuleShot('lobule:triad'), room)
// from the engine (every frame it changes): const m = lobuleModel({ P: f.P, Q: f.Q, metrics: f.metrics }, healthy, params);
//                                           lobule.setModel(m); sinus.setTargets(sinusoidTargets(m));
```

* The views take the scene's `CelShared` (one clock value, one light, one screen size), so the chevrons and the ink run on the one clock. They draw nothing and
  ask for no frames while hidden. `update()` returns true while anything moves.
* **Inputs the shell must supply:** the healthy patient's reference (`{ P, Q, hepLymph }`, from the worker's `healthyProfile` and its `metrics.ascites.hepLymph`) and the
  patient's `params` (kept from `presetLoaded` / `setParams`; frames carry them only on a jump). Without the reference, flows read 1 and congestion 0.
* The two views stand at `LOBULE_ORIGIN` (24, 0, 0) and `SINUSOID_ORIGIN` (48, 0, 0), away from the body (about ±3.5). Tags use `view.anchor(name)`
  (lobule: `centre`, `triad:0..5`, `zone:1..3`; sinusoid: `in`, `out`, `lumen`, `fen`, `disse`, `hep`, `hsc`, `kup`, `lymph`) with `sceneApi.project`.
* Wash (HVPG slide 5): `lobule.startWash(landedAtMs)` once the camera has landed on `lobule:sinusoid`; a dive on into `sinusoid` calls `sinus.startWash(...)`. `stopWash()` on leaving.
* Flow marks: `setLit(litParts(slide.terms))`, deck terms as in 2D (`lobule:triad` and `lobule:central` light the sinusoids too). Option A/B/C/D follow `setFlowMode`.

## The artist's swap-in point

Every part is named (`parts.ts`). `view.swap('sinusoids', node)` replaces that part's placeholder with a glTF node; the view's states, the wash, the chevrons and the
shots address parts, not meshes. Artist file rule: root nodes `lobule` and `sinusoid` (one glTF or two), children named `lobule/<part>` and `sinusoid/<part>`, units in
lobule radii × `LOBULE_R` (3 scene units), the lobule's plane XY (y up, portal tract at the left of the hexagon), the slab's thickness `LOBULE_T` (0.9) along z, the sinusoid along x (portal end left)
with its lumen radius 0.34 and length `SINUSOID_L` (6).

| Lobule parts | | Sinusoid parts | |
|---|---|---|---|
| `cords` (zones 1, 2, 3) | hepatocyte plates | `lumen` | the blood's channel |
| `sinusoids` (generations 0, 1, 2, links) | | `wall` | fenestrae (sieve plates), basement membrane |
| `inlets` | | `disse` | space of Disse, collagen |
| `portal-tracts` | venule, arteriole + twig, ductule | `hepatocytes` | the two plates and nuclei |
| `central-vein` | | `stellate` | the cell and its arms |
| `lymph` | tract lymphatics, terminal lymphatics, Disse | `kupffer` | |
| `stellate`, `septa`, `cuffs`, `wash` | | `lymph-duct`, `wash` | no marks on the duct |

The art needs, per part, the same states the placeholder shows (open to collapsed collagen collars and septa, zone 3 dilation and drop-out, stellate swell, narrowing, sieve-plate closing). The placeholders do
these with the shaders' `inflate` uniform (a grow-from-nothing along the normal) and the toon pass's `reveal` cut (the wash); a model can use morph targets or the same uniforms.

## Not in this batch (so nothing is promised)

Pressure/oxygen/origin colour lenses (B3 owns the lenses; the lobule's tubes take their tone from `LOBULE_PALETTES` for now), zone name labels and the tract labels (B6), tap-to-explain cards (B9; `view.partAt(hits)` is the hook), the bile layer, the dive field of neighbouring lobules and its
depth of field, chevrons at a constant screen pitch (the 2D app's lymph marks keep about 110 px on screen at any zoom; here the pitch is five tube radii), and the pixel-ratio-aware
sinusoid radius. None is drawn from a headless browser: the views have not been seen on a device yet.

## The lobule as a flat plate (WP5, 19 Nov 2026)

The lobule is a histology plate, as 2D draws it (`/mnt/project-files/rebuild-3d/atlas-look-plan.md` §5): nothing is extruded.
- **Tissue** (`lobule/plate.ts`): 2D's own painter, `lobule-paint.js paintLobule`, copied by `node scripts/copy-lobule.mjs --from <2D checkout>` into
  `src/scene/lobule/from2d/` (`--check` proves the copy current; the unit test runs it when a 2D checkout is beside this one or at `PPS_2D_REPO`). It paints the
  cells, membranes, nuclei, nutmeg, Disse collagen, stellate cells, septa and collars into a 2048 px canvas once per state (1/32 steps of the model's
  targets) and crossfades the new picture in over 320 ms. Colours come from 2D's per-look token table (`lz-colours.ts`), never a style read.
- **Zones** (`lobule/zones.ts`): 2D's radial gradient and opacity in a shader over the plate, easing with the layer, no new painting.
- **Vessels** lie in one plane on the plate (`slabZ` is 0); end-on vessels (central vein, the tracts' venule, arteriole, ductule, lymphatic) are flat
  discs; the space of Disse is a flat band under its sinusoid with no outline; every outline is 2D's casing laid over the cells; the lymph's marks are soft dashes.
- **Neighbours** (`lobule/field.ts`): 2D's field tile (`drawTile`, copied), blurred as 2D's quiet copy, repeated on one plane under the plate; the shader
  drains and flattens it toward the page, fades it from 1.1 R (never more than half at a screen corner) and softens it with distance. Lenses other than
  Pressure grey it as 2D's surround.
- **Camera**: the lobule shots are face on (yaw 0, pitch 0).
