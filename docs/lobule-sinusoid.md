# Lobule and sinusoid views (batch B8)

> **Flat 2D drawing removed (20 Nov 2026).** Everything on screen in the Lobule and the Sinusoid is the 3D scenes' (`micro3d/lobule3d.ts`, `micro3d/sinusoid3d.ts`). `lobule/view.ts` and `sinusoid/view.ts` are now hosts only: the network and model, the eased state, layers and their fades, the lens's ink context, the wash, labels, taps (2D's pick rule) and the albumin traffic. Gone with the flat drawing: `lobule/shading.ts`, `zones.ts`, `mouths.ts`, `ink-set.ts`, `disse.ts`, `batch.ts`, the `LobulePlate` class, `sinusoid/gl.copied.ts`, `sinusoid/cel.ts`, `sinusoid/flat.ts`, `from2d/chevron.generated.js`, `from2d/disc-glsl.generated.js` and `scripts/copy-chevrons.mjs`. The notes below that name those files are history.

> **Cel shaded tissue (20 Nov 2026, C1).** The plate, the neighbours and the Zones are cel shaded from the figure's one style (`src/scene/cel-style.ts`): `lobule/cel.ts` puts 2D's painted colours in three flat tones (shade / base / lit about each pixel's own local lightness, hue and chroma kept, detail beyond two tones left as painted), hard edges one pixel wide, and 2D's casing ink on every strong edge of the plate (the neighbours carry none); the Zones are three hard zones with a shade line. The vessels' three tones and line are the same CEL_STYLE (`shading.ts`). The space of Disse band stays one flat tone with no outline, as 2D's.

> **Hairlines (20 Nov 2026, play-test at 390 x 844: "thick olive ladder bars").** The cel line is 2 device px at least, so any tube under a pixel wide that carries one reads as a bar. The space of Disse (2D wall 0.2 px) and the bile canaliculi and canals of Hering (0.3 and 0.6 px) carry none (`px: 0`, one flat fill), the canaliculus is no wider than 2D's 0.0036 R, and the sleeve's colour is 2D's lymph teal (`lobule/disse.ts`, from `lyInkInto` / `DISSE_DEEP`), not the palette's green. `tests/scene-lobule-disse.test.ts` holds the sleeve to a 1.5 px rim at 390 x 844, no rung, no ink; the terminal lymphatics and the arteriole's twig still carry the 2 px line (2D walls 0.8 and 0.5).


> **Lobule names, leaders and the central vein (20 Nov 2026, Mac play-test at 390x844).** (1) "Hepatic arteriole" had no leader: a name with no reading had a last, *nameless* form, which the solver chose when crowded (a 6 px empty box beside the ring), and
> any name within 12 px of its vessel's edge draws no leader (`LEAD_ON`; the first ring of candidates stood `max(12, vw + 8)` from the dot). Now: no nameless form for a station without a reading; every station carries `minLead` (`captions.ts MIN_LEAD`,
> `solver.ts`: the words stand over `LEAD_ON` from the vessel's edge, so the leader and ring always show, as 2D's `Math.max(0, 16 - lead)` keeps a visible stretch); a name that finds no room with a leader is left out whole (ring too), as 2D leaves out a name
> no slide asks for. A name the greedy order dropped is tried first (at most 3 more passes, kept when it loses less by rank, 2D's `nextPerm` in small). The labelled tract is the lowest one with all four of its dots in view (the Mac's arteriole and lymph were `hidden`
> under the foot). (2) The central vein's name stood over the sinusoids (2D's has a glass pill, 3D's has only a halo): it is `clearLines` (`solver.ts`): the box, with `LINE_AIR` 3 px, crosses no course of `LINE_KINDS` (sinusoids, cross-links, inlets, twigs, every
> sample), searched on rings round the vein up to 340 px (`CV_REACH` 300 of leader), on the side away from the labelled tract; only if nothing is clear does it take the cheapest spot. On a phone the hexagon fills the width, so the nearest clear band is past its rim
> (a 140 to 160 px leader); on an iPad or a Mac it stands beside the vein between two sinusoids. Test `scene-lobule-labels-clear.test.ts` (frames from the real camera: `tests/lobule-frame.ts`). Not seen on a screen.

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
> *Portrait.* A stage narrower than 0.95 of its height (2D's `W < H * 0.95`, `sinusoid/portrait.ts isPortrait`) runs the sinusoid top to bottom, portal end up. **The camera rolls, the plane never turns** (20 Nov 2026, Mohammad: a plane turned
> alone inside the dive "flips only the sinusoid, not the lobule"): `sinusoidShot(portrait, shortPx)` carries `roll: PORTRAIT_ROLL` (+PI/2, the picture turned by `PORTRAIT_ANGLE` = -PI/2 = 2D's `ang` PI/2), `camera/rig.ts` blends
> `roll` on the move's own eased share (the same `k` as the zoom, so the lobule and the sinusoid turn together through the whole dive, and the way out is the way in reversed) and `apply()` rolls the camera about its view axis after the
> aim; the viewer's orbit and tilt are carried round with the roll so they stay about the screen's axes. The plane keeps its own frame (along the lobule's capillary), so `anchor()`, `micrometres()`, the hits and the names all project
> through the camera. `SinusoidView.setPortrait(portrait)` only lays out: the Kupffer cell stands at xk 12 (22 wide) and the names take their tall places. A phone turned in the view is a `goTo` of the other shot (the roll glides).
> `sinusoidShot` swaps the half extents (screen axes) and, given the room's short side, frames 2D's `lerp(40, 54, smooth(380, 720, short))` µm across it; `sinusoidBox()` is the plane's own box the hand keeps on screen.
> `setEndShown(in, out)` fades an arrow with its name. **The scene must call** `setPortrait` (from the room: `isPortrait(room.w, room.h)`), `setScreen` while the sinusoid is up, and use `sinusoidBox()` for the subject.
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
  (lobule: `centre`, `triad:0..5`, and a slide callout's `tract`, `sinusoid:mid`, `sinusoid:zone3` (scene/lobule/callout-spot.ts); sinusoid: `in`, `out`, `lumen`, `fen`, `disse`, `hep`, `hsc`, `kup`, `lymph`) with `sceneApi.project`.
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

## Sinusoid, cel shaded (20 Nov 2026)
2D's tissue shader stays a byte-for-byte copy (`gl.copied.ts`, `scripts/copy-sinusoid.mjs --check`). `src/scene/sinusoid/cel.ts` wraps it: 2D's `main` becomes `main2d`, and a new `main` steps the pixel's lightness onto hard bands one shade step wide
(`-ln(1 - CEL_STYLE.SHADE)`, so the bands are the figure's own shade step), keeps hue and chroma, inks sharp colour changes (the colour shaded three times) and puts the pixel back premultiplied with 2D's alpha. Every number comes from `src/scene/cel-style.ts`.
The ladder stands on 2D's own colour of the place: on the lumen at `cLumen` (nearest rung, three to six tones), on the wall and the space of Disse at `cLymph` with a dead zone of 1.5 shade steps (0.75 each side), so lymph dashes, collagen bands and the wall's blend stay one clean tone and
real colour changes (microvilli ticks, the lilac wall, pores) step crisply; elsewhere (plates, the cells over them) the ladder is absolute. The ink fires only at two to three shade steps of change in one pixel and never inside the Disse band.

**Hepatocyte plates are not stepped (20 Nov 2026, phone play-test: flat brown cells, no outlines, no nuclei).** 2D paints a plate's membrane, nucleus and lighter inside as small tone steps (a cUnder mix of 0.16, a cNuc mix of 0.24, 0.05 of white), each about one band (17 %) or less, so the absolute ladder rounded every cell to one rung. `cel.ts` now masks the plates (`onPlate`: this sinusoid's two and the repeats beyond the next sinusoid, 2D's own tissue geometry, pass 0) out of both the ladder and the ink: a plate pixel is `main2d`'s colour exactly (premultiplied, 2D's alpha, so the dive share and the focus dim stay 2D's, untouched at rest). The lumen, wall, Disse and the neighbours' linings keep the cel step. Tests: `tests/scene-sinusoid-cel.test.ts`.

**The credit keeps off the vessel (same play-test).** `ui/shell/credit-avoid.ts` gives 2D's `freeSpots` its `avoid` hook the sinusoid's vessel box (the lumen and its wall at their widest, a strip across the whole screen, projected through the live camera and the plane's turn, 8 px of pad); `Credit.tsx` waits for the camera to land, then takes a free spot clear of it or, with none (a phone held upright), hides by a fade (`.covered`). The 3D `.placed { opacity: 1 }` rule had the same weight as 2D's `.covered { opacity: 0 }` and came first-or-equal, so a "covered" credit was never actually hidden: `chrome-3d.css` now puts `:is(.covered, .moving)` after it and fades opacity (a move to a new spot fades out, moves, fades in). Test: `tests/credit-sinusoid.test.ts` (390x844, 393x852, 430x932, 844x390).

## Welded junctions in the Lobule (20 Nov 2026)

Every place two of the Lobule's tubes meet (a sinusoid merging into the next generation, an inlet leaving its venule, an anastomosis or a bile canal landing on a side) is one closed skin, built by
the Anatomy's junction-skin SDF and mesh builder (`src/scene/vessels/skin/`), not a second system. Code: `src/scene/lobule/` (`welds.ts` the planner, `weld-courses.ts` the courses as the scene draws
them, `weld-splay.ts`, `weld-worker.ts` / `weld-client.ts`) and `src/scene/micro3d/lobule-welded.ts` (the per-vertex numbers). `?joins=old` (or Settings > Smooth vessel joins off) keeps the old tubes.

- **When:** the plan is made in a worker at boot (about 10 s of node time) and laid in with one geometry rebuild only while the Lobule is hidden, so nothing pops.
- **Why junctions used to be skipped, and what the planner does now** (`tests/lobule-welds.test.ts` pins what is left in `KNOWN_FALLBACKS`; the list only shrinks):
  1. the merging sinusoids met at 4 to 15 degrees and lay on each other: `weld-splay.ts` re-routes the last stretch of each movable arm so the arms leave J at least 40 degrees apart (a T's host is not moved; branches ride a bent host);
  2. the builder folds when its hull sheet starts far from the surface: `GENTLE` (skin/mesh.ts) pulls it in slower; and its vertex limit now counts live vertices only;
  3. the bile hairlines (radius 0.0002) have their first sample 130 radii from J: `refineEnds` inserts samples near each end so a seam can stand a few radii out;
  4. two junctions on one course took the same stretch: a first pass notes such pairs, and a second builds each connected set as one skin (up to 4 arms, the stretch between their touch points absorbed);
  5. last try for a junction that would not build: seams 2.2 radii from J, past the usual clearance.
  6. a hull that swallows one arm's ring: only that arm is pushed out (it used to move every arm and lose the others).
- **Twigs** (`kind 'tw'`, radius from `twigR`) are welded where they land on their sinusoid, and the skin eases its colour along the arm from the arteriole's colour (Seg `'art'`, a constant palette
  tone in `ink.ts`) to the sinusoid's, through the same alt-colour (`seg2/w2/m`) the Anatomy uses for the hepatic artery. A twig lies along its sinusoid for about 20 radii (its arteriole pool
  is about 3 radii off the sinusoid axis, 2D parity), so the tubes overlap by design and most of them stay as plain tubes.
- **Not welded yet:** the 17 listed in `KNOWN_FALLBACKS` (5 of the 6 twigs, tight 2-arm bends of the bile ducts under about 100 degrees, bile hairline hubs of 4 canals, two far-seamed sinusoid
  merges) and the terminal lymphatics (they only enter their pool). The vessels' mouths already flare as 2D's do (`flareAt`, `twigRadius` in widths.ts). 211 of 228 junctions are welded.

## The Lobule's one fade (structural, 20 Nov 2026)
Every object under the Lobule root takes its fade from `LobuleFade` (`src/scene/lobule/one-fade.ts`); the root (`LobuleView.group`, a `LobuleRoot`) adopts whatever is added to it, and `group.setFade(detail, ground)` is the only writer
(called once, from `Lobule3D.update`). `detail` (dither, `1 - under` times the field's breadth) is for the lobule's tiles, tubes, marks and plate; `ground` (alpha, `1 - under`) is for the neighbours' plate
(`userData.fadeKind = 'ground'`). A stock material (the tap halo) is patched to scale its alpha by the same value. `tests/lobule-one-fade.test.ts` walks the whole graph and fails on any mesh or material that does not read it.

## The lymph: two thin tubes per sinusoid (20 Nov 2026, final form)

Mohammad's spec, in his words relayed: two thin, distinct lymph tubes per sinusoid, one on each side, touching its wall with no dark gap; each a fixed small width (thin like a ductule), never a filled area; at a fork each
outer tube follows its own branch, the two inner tubes meet at the crotch tip and end as a thin line with no fill in the wedge; they pass under crossing vessels; they taper to zero at about 90 % of the way to the central
vein; no stubs. This overrides the 2D pin (b3058ef3 draws a sleeve centred on the sinusoid, which in 3D gave grey-green wedge plates in every crotch: tried and rejected).

`src/scene/lobule/lymph.ts` `lymphRuns` is just that: each sinusoid's axis offset to both sides by its wall plus 0.55 of the tube's radius (`HUG`: the tube stands under the wall by its other 45 %, so no daylight shows). A
branch's OUTER line (the side away from its sibling) runs on into the trunk's line on that side; the two inner lines stay on their own walls and end as threads (`endTaper`) where the sinusoids meet, so nothing fills the
crotch. There is no cutting or pairing (that gave U-turn runs, strays and loops). The width is `DUCT_R` (0.31 of a first-generation sinusoid's radius, about 0.0026 lobule radii) times `lyTaper` (whole from rho 0.42 out,
zero at 0.13). A first-generation channel begins on the terminal lymphatic it drains into. The tubes are `ly` courses (`sib`: their sinusoid, `sign`: their side).

Where a tube passes another vessel (inlet venule, terminal lymphatic, cross-link) it goes UNDER it: `lymphCover` gives the depth and `lobule3d.ts` lays the tube at `LYMPH_UNDER_Z` there. A sinusoid's own band is narrow (0.4)
so the tube beside its own sinusoid never dives. `LYMPH_Z` is low enough that a hugging tube never shows above the sinusoid's surface.

## The bile goes under the blood (20 Nov 2026)

The bile part (`canaliculi`) is drawn first of the vessels (`BILE_ORDER`, ink then body) with no depth write, so wherever a lane, canal of Hering or duct passes a sinusoid, cross-link or inlet the vessel is drawn over it.
2D draws it in its lowest tier. About 8 % of the bile's samples still lie beneath a sinusoid or cross-link (2D's lanes beside each sinusoid, offset by a fixed amount, swing across a neighbour at branches); they are
now hidden under it rather than drawn through it. Rerouting those lanes is not done.

Tests: `tests/lobule-lymph.test.ts` (both sides on all 84 sinusoids, hug, no strays, the fork rules, no stubs, the taper, the Y built from geometry, the cover, and the drawn triangles: no lymph vertex farther than a tube
width from its sinusoid wall, planform area per sinusoid at most two tubes of fixed width along it (no wedges), thin and whole, zero at the vein), `tests/lobule-ductules.test.ts`, `tests/lobule-bile-under.test.ts`.
A plan view of the real mesh (parts rasterised top-down in render order, no browser) is how the look is checked in node: `node --experimental-strip-types scripts/lobule-plan.ts 0 0 1.05 1800 plan.png`, args: centre x, y, half-width in lobule radii, pixels, file.

## One centreline (20 Nov 2026, after the on-device shot of d2b959e2)

The network is bent ONCE, in `buildLobule` (`weld-bend.ts` `bendNet`, called after the twigs): the weld planner's splay (`weld-splay.ts`) opens every shallow V of two merging sinusoids, and T branches follow
their bent hosts, and the result is written back into `net.courses` (same point count, `rho` and `len` redone). Everything derived afterwards (lymph, bile, plates, stellate cells, pick, captions) reads the bent
courses, and the planner is called with `splay: false`, so what is drawn, what the lymph hugs and what the bile runs beside are one centreline. Root cause of the wandering lymph: the planner used to bend the
sinusoids after the layers were laid along the unbent courses (a shift of about 2 sinusoid radii, up to 5, against a lymph offset of 1.23). The junction finder and `refineEnds` moved to `weld-nodes.ts` (pure,
shared); the base sizes (`RS0`, `DUCT_R`, ...) to `sizes.ts` so geometry.ts can import widths without a cycle. `public/lobule/welds.bin` is baked at build time and is not committed.
Inner lymph lines of a fork now cross and end at the crossing (`firstCrossing` in lymph.ts), so no end is left free at a crotch. A bile lane starts clear of every vessel but its own chain and parts from an earlier lane
before it begins (bile.ts). Test: `tests/lobule-drawn-source.test.ts`.

### The lymph follows a swelling sinusoid (congested presets)

A sinusoid widens in congestion in the vertex shader (cel3d SWELL: each vertex out by its radius x (whole + share x its place's share)). The lymph tube is baked at the resting width and used to stay put, so a
swollen sinusoid grew over it. The lymph part now has `hug` (cel3d HUG): per vertex the plan direction out from its sinusoid's axis, the wall radius there and the place's `congShare`, and a uniform `uHug` fed the same
`sinSwell` the sinusoids get (`setHug` in lobule3d's step). The vertex moves out by the wall's own growth, so the gap between tube and wall stays what it is at rest. The stretch that does not stand against its
sinusoid (the reach to the terminal lymphatic) carries a zero wall and does not move.
