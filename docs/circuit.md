# The Circuit view and the Anatomy-Circuit morph (B7)

Source of truth is the 2D app (`qaddodi/portal-pressure-simulator`, `claude/settings-topbar-icon-flvft1`). Its numbers are copied by script
(`node scripts/copy-b7-data.mjs --from <2d repo> [--check]` writes `src/scene/circuit/data.copied.ts`); nothing in there is retyped.

## How it works
- **One mesh, two courses.** Every vessel tube is built once along its body course (`buildVessel(def, slicesFor(id))`) and carries four extra attributes
  (`geometry.ts`): `cC` and `tC` (the map course's centre and direction at the vertex's place along the vessel), `fr` (the vertex's offset in a frame fixed by
  its direction, `frame.ts`) and `pk` (flow rank, place along the course). The vertex shader (`shader.ts`, injected into `VESSEL_VS`) moves each vertex from
  its body place to its map place on that vertex's own share of the change, the 2D flow peel (`peel.ts`: gut leads, heart follows, `PEEL_DL` 0.4), and rebuilds
  the tube round the morphed centre in the fixed frame, so the tube never pinches or folds. At `circT` 0 the vessel is drawn exactly as before; at 1 it is exactly the map course.
- **Vessels the plain lerp cannot carry** (`morph.ts`): a vessel that runs the other way in the circuit (the portal chain from the spleen, the left renal vein, the
  hepatic artery; more than 120 degrees) is carried in the frame of its chord, and an end that joins another vessel part-way along it (the left gastric vein on the
  portal trunk) moves with that point of its host (`PIN_FALL` 0.4). Both are the 2D app's rules, evaluated on 64 samples on the CPU each frame of the change into a small float
  texture (`circTrack`, two rows a vessel: the offset from the plain lerp and the direction). A vessel with no track has `circRow` -1 and costs the GPU nothing extra.
- **The clock** (`view.ts`): the change is one tween 0 to 1 (`VIEW_CHANGE_MS` 1300, cubic in-out, from where it stands, so a reverse mid-change takes only what is left);
  the camera is asked for the same length (`sceneApi.showView`), so they land together. The turn is a second tween (`TURN_MS` 480). Both are on the scene's one clock
  (`scene.update`); nothing runs when nothing moves.
- **Turn upright** is applied to the map course about the map's centre (`map.ts turnScenePt`, the same in the shader), never to the world. The camera glide follows on the same 480 ms.
  Remembered in `pps3d.circuitRot`; with nothing stored a portrait phone opens upright (the 2D rule).
- **The map** (`map-layer.ts`): the 20-unit dot grid running on past the figure in steps, the three tinted pressure zones, and the station dots (a dot is on while a
  vessel at that station is drawn), a GPU port of the 2D `mapAt` and `nodeVerts`. It comes in over the second half of the change. Dark looks lerp the ground to the map's ground.
- **Organs, plate, varices, catheter** fade with `1 - t` (`CelObject.setFade`); the vessels stay and fly. Nothing pops.
- **Picking** in the Circuit is a CPU hit test against the turned map courses projected through the camera (`scene.pickCircuit`), within 10 px (16 on a phone).

## Wiring
`showView('circuit')` (shell) -> `sceneApi.showView` -> `cel.setView('circuit')` + `circuitShot`. The shell's `rotate` feature is `turnCircuit` (`ui/shell/view-actions.ts`).
`sceneApi.circuitStation(id)` gives a station's place (turned with the map) for the labels batch.

## Not done yet (gaps)
Liver branch trees (`CIRCUIT_TREES`), resistors and their readings, zone and lane captions, station labels with readings (B6 draws them from `circuitStation`), custom-shunt
routing, the CAUD lane, the liver-module collapse, and the 2D tangent term of the peel gradient (the shader's tangent is the plain blend: up to about 25% off mid-change, exact at both ends).
