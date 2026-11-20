# Lobule and sinusoid views (batch B8)

> **Lobule parity audit, 19 Nov 2026 (LOBULE worker, against the 2D pin b3058ef3; 2D's own code is copied by `node scripts/copy-lobule.mjs --from <2D checkout> [--check]`).**
>
> | 2D | 3D now | state |
> |---|---|---|
> | Sinusoid, inlet, twig, cross-link widths (`radiusAt`: sinusoid `rs0 0.0085 x 0.75` R, widening 1 to 1.3 toward the vein, `an` 0.68) | `lobule/widths.ts`, pinned to 2D's text by `tests/scene-lobule-widths.test.ts` (they were 1.5 to 1.9 times wider) | done |
> | Tube shading: three tones lit from the top left of the screen, line `clamp(0.14 R, 1.5, 3)` px, no world light, no specular | `lobule/shading.ts` rewrites the cel shaders for the lobule (`TONES3`) | done |
> | End-on discs (`celDisc`): central vein, portal venule, arteriole, ductule, lymphatic: pale inner band, wall opened where a vessel joins (`lobule-mouths.js`), inner line where nothing joins | `lobule/mouths.ts` + `from2d/lobule-mouths.generated.js` + `disc-glsl.generated.js`; radii follow state (`discK`: congestion, arteriole, lymph caliber) | done |
> | Bile ductule "swell" with the Bile layer | **2D has none.** The Bile layer *opens the ductule's mouths* where the canals of Hering join it (`mouthsNoBile` otherwise). 3D now does exactly that; no swell was added | done (nothing to copy) |
> | The arteriole's twig, the bile and the space of Disse are one flat fill | `flat` on tw, ly, bc, bh | done |
> | The tract's vessels have their own outline colour (EDGE) | `applyLook` | done |
> | Taps: every part 2D's `hitInto` picks opens the same card (triad, arteriole, ductule, lymphatic with Lymph on, central vein, sinusoid, inlet, cross-link, bile channel and canal with Bile on, septum, a zone's hepatocytes) | the tap was **not wired at all** before: `lobule/pick.ts` (port), `pick-store.ts`, `Stage.tsx`, `ui/action/boot.ts`; test `scene-lobule-pick.test.ts` | done |
> | Zone names (Zone 1 periportal, Zone 2 midzonal, Zone 3 centrilobular, on the radius to the bottom edge, with the Zones layer) and the stations' names with pressures (Portal venule, Sinusoids, Central vein), the arteriole and ductule named, Hepatic lymph with the Lymph layer | `lobule/captions.ts` (pure) + `lobule/LobuleCaptions.tsx` (the DOM layer, the one label solver); test `scene-lobule-captions.test.ts` | done, simpler than 2D (below) |
> | Layers menu defaults `{zones: false, lymph: true, bile: true}` (2D store.js) | **Bile started off in 3D**; now on (`ui/shell/store.ts`, `LobuleView`); `scene-lobule-layers.test.ts` | fixed |
> | Zones layer, nutmeg, collagen, stellate cells, septa, wash, lens colours, lens grey surround | already 2D's own painter and stops (`plate.ts`, `zones.ts`, `wash.ts`, `ink.ts`) | unchanged |
> | Anastomosis marks, albumin traffic marks | **2D draws no separate marks**: the anastomoses are the `an` cross-link tubes (drawn, 0.68 width, tappable); the lobule has no albumin beads (the one mention in `lobule-zoom-field.js` is a comment); albumin traffic is the sinusoid view's (SINUS) | nothing to add |
>
> Not done, and why: the stations' *glide* (labels easing between places), the count-up of the numbers, the change badges and delta colours, the oxygen lens' `% O2` readings, the slide's call pointer and lit/dimmed names, the tract fan's "no leader over another vessel's dot" cost, and the lesion ring the zone names avoid (`lobule-zoom-labels.js`, 969 lines, `lobule-zoom-records.js`). 3D places the same words with the figure's one solver and writes them in the one label type. Hence a name can stand a little differently from 2D's. Each is a follow-up on `LobuleCaptions.tsx`.

> **Sinusoid view, 19 Nov 2026 (atlas look plan WP7): lifted from 2D.** The placeholder 3D cut (layers of cel-shaded slabs) is gone. `src/scene/sinusoid/view.ts` runs 2D's own
> tissue shader and albumin sprites (`sinusoid-gl.js`) on a plane in the sinusoid's frame, so the tissue fills the screen to every edge; 2D's traffic and palette code come with it.
> All of it is copied by `node scripts/copy-sinusoid.mjs --from <2D checkout> [--check]` into `gl.copied.ts`, `traffic.copied.js`, `palette.copied.js`; never edit those.
> The dive hook is `view.setDive(g)` (the scene sets it from the camera's distance while flying, `null` at rest); at rest the lobule is hidden and the tissue is opaque everywhere.
> There is no artist swap-in for the sinusoid any more (its parts exist for the API; everything is drawn in `lumen`). The part table below is the lobule's now.


> **Sinusoid parity pass, 19 Nov 2026 (portrait, names, audit).**
> *Portrait.* A stage narrower than 0.95 of its height (2D's `W < H * 0.95`, `sinusoid/portrait.ts isPortrait`) runs the sinusoid top to bottom, portal end up. `SinusoidView.setPortrait(portrait)` turns the plane's own group
> (`PORTRAIT_ANGLE`, -PI/2 on this y-up plane = 2D's `ang` PI/2), so the tissue, pores, albumin, the cells over them, `anchor()` and `micrometres()` all turn together; the Kupffer cell stands at xk 12 (22 wide). While the camera flies
> between the lobule and the sinusoid the turn is the dive's share (`setDive(g)`: lobule to tall view in one move and out by the same frames), at rest it glides (critically damped, 2D's SPRING 10) or is at once with Reduce Motion.
> `sinusoidShot(portrait, shortPx)` swaps the half extents and, given the room's short side, frames 2D's `lerp(40, 54, smooth(380, 720, short))` µm across it; `sinusoidBox(portrait)` is the box the hand keeps on screen.
> `setScreen(k, along, stage)` (px per µm, the free room's length and the canvas's along the flow) puts the end arrows 32 px (24 tall) inside the room's ends and runs the traffic over the stretch on screen (2D layoutEnds, VW.vis);
> `setEndShown(in, out)` fades an arrow with its name. **The scene must call** `setPortrait` (from the room: `isPortrait(room.w, room.h)`), `setScreen` while the sinusoid is up, and use `sinusoidBox(portrait)` for the subject.
> *Names.* `sinusoid/names.ts` is 2D's layout of the captions as pure functions (`layoutEnds`, `layoutTags` with `fen-place.copied.js` copied by script, `layoutTall`, `leader`): `SinusoidView.names({ W, H, C, k, free, insTop, text, lit, measure })`
> returns each name's centre and box (px, always level), the µm it names and its leader; `explainHit(names, x, y)` is 2D's tap (8 px of slop, the note `SV_NOTE`, the slide term `sinusoid:<target>`). Not ported: `declutter` (large text),
> the legend ("Protein"), the fade of names while a slide dims them. These belong to the label layer, which nothing yet mounts for the micro views.
> *Audit against 2D.* Fixed: the wedge's wash never reached the shader (`uWedge` unset; now only while a slide asks and once the view has landed, afresh each time); the end arrows were fixed at +-46 um whatever the screen; a hepatic lymph of exactly 0
> read as healthy (`||` for `??`); the anchors of Disse and the hepatocyte stood in 2D's other plate. Checked equal: `sinusoidTargets`, the ease (320 ms), the palette (the copied function), the traffic (copied), the reveal and detail uniforms in the dive.
> Left: 2D pauses the traffic with its clock (`isPaused`); the 3D clock has no pause yet.


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

### The sinusoid's names on screen (19 Nov 2026)

`sinusoid/SinusoidCaptions.tsx` mounts 2D's names (`names.ts`, laid out by `captions.ts` from where the plane stands on the canvas, the free room and the model's numbers) in the figure's label type: ends, sinusoid, Kupffer, stellate, fenestrae, Disse, lymph, hepatocyte (and the canaliculus when a slide lights `sinusoid:canaliculus`), with leaders, always level, in the wide and the tall (portrait) layout. They are mounted only while the sinusoid is the view, come in once the figure is still and go when it moves; only transform and opacity are written per frame. The end names carry the end arrows (`setEndShown`). A tap on a name, in a talk only (as in 2D), adds its note line and lights `sinusoid:<target>` (`explain-store.ts`, wired in `Stage.tsx` ahead of the free-mode return). The layout is 2D's own within the free room, so the label solver is not used for these names.

## Depth of field in the dive (depth upgrade 4, desktop only)

`src/scene/post-dof.ts`, behind Settings > Figure depth > depth of field (`useSettings.dof`, on by default). Only a laptop or desktop (`dofAllowed`: fine pointer, hover, window of 900 CSS px or more, not an iPad that says "Mac",
no reduced motion); a phone or an iPad never makes the depth texture, the half-size target or the programs. Its strength is a function of the camera's distance to the place dived to (`dofShare`: 1 from the lobule's framing
in, 0 where the body is gone, `DIVE_IN`), so the way in and the way out are one picture. The figure's FXAA texture carries a depth texture; a half-size gather (10 golden-angle taps, each weighted by its own circle of confusion, so
ink lines in focus never bloom) and a full-size blend run before the FXAA pass, and only while the strength is above 0. The lobule's plates, the neighbour field and the sinusoid's tissue write no depth, so a pixel with none
is taken to lie on the plane through the camera's target facing +z (`planeUniform`): with the camera square on, the plane is all in focus and only what stands off it (a vessel past the sharp slab) blurs; tilt and turn
put the far side of the plane out of focus. While the pass runs the vessels' pass does not clear the depth (it draws nothing once the body is gone). A refused program turns the blur off (shader guard) and the figure is
drawn as before.
