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

## The rest of the Circuit (finish thread)
- **Branch trees, CAUD lane, custom shunts** (`tubes.ts`, `CircuitTubes`): real vessel tubes laid along their map course, with the body course set equal to the map course, so the
  quarter turn carries them and they show only with the map's ramp (never in the body). 24 tree branches (`CIRCUIT_TREES`, a share `k` of the parent's caliber, least 1.2 units wide) follow
  their parent's presence; the CAUD lane shows while `sceneApi.setCaudatePin(true)`; an open custom shunt (patient `customShunts`, frame D > 0) is routed once by the copied 2D router
  (`router.copied.js`, A* on a grid, 45 degree runs), kept while open, and drawn as a tube. The body does not draw custom shunts (that is B5's).
- **Resistors** (`res-model.ts` numbers, `resistors.ts` drawing): the 2D model (ratio to the healthy liver, lobes in parallel, width 2.5 to 13 px by log2, ok/caution/danger heat, six-tooth zigzag,
  black outline, veil). Screen-space ribbons on the map layer, fading with it. `sceneApi.setResistors(['rLiver','rColl','rGut'])` chooses which show.
- **Captions** (`captions.ts` builds, `CircuitCaptions.tsx` places and writes): zone titles, station names with readings (priority, compact on a phone, the liver's inner stations only when zoomed
  in), lane captions (two lines beside a zigzag) and "R liver x2.3" readings, through the one label solver. The body's labels stand aside in the Circuit (`LabelDeps.hidden`).
- **The peel's tangent** is exact now: `shader.ts` adds the peel's slope term (`peelSlope`, vertex attribute `cl` = the two course lengths), mirrored on the CPU in `tests/circuit-finish.test.ts`.
- **Procedure devices** (catheters, stents, bands, tamponade) fade out with the change (`ProcedureLayer.setFade`).

## Junction skins on the map (`circuit/skins.ts`)
The Anatomy's welds (`vessels/skin`, docs/junction-skin-spec.md) are on the map too: the same pipeline, the map's frame.
- **Which junctions**: the body's permanent nodes, read on the map (`findCircuitJunctions`): eighteen, HA, SMV, SV, SVD, CONF, PVT_L, PVH, RPV_T, CV_R, RHV_T, IVCS, IVCI, IVC_D, LRV_S, LRV, EPI, SVC_E, SVC. Every arm ends exactly on its station. SIN_R and SIN_L (the liver beds) are named fallbacks:
  as in 2D the hepatic arteries stop at the tips of the bed's lanes, 30 map units short of the station, and never cross a lane (Mohammad, 21 Nov, "do it like 2D does it"; this undid the 20 Nov run-on, `BED_REACH`). Pinned by `tests/circuit-skins.test.ts`.
- **The ladder** (`CircuitSkinSet.produce`): a junction the hull of its seam rings refuses is meshed from the surface itself (`SkinJunction.surface`, sheet.ts: SVD with S_DSR); a skin whose growing arms fold when closed (`mesh.ts` closedShapeFolds) is refused and loses its narrowest growing arm
  (`dropped`, with the reason in `why`: REX beside S_MC, DIPS on IVC_D). `mesh.ts` closes two growers together when closing them one by one folds (shares by weight).
- **Rings** (`circuitTube`): the tube the vertex shader draws at circT 1 (circuit/shader.ts), computed on the CPU from the body tube's own mesh (map centre `cC`, offset `fr` in the frame fixed by `tC`, the map radius). Ring k is where a cut at u = k / tubular lies, so the
  skin starts on the tube's own vertices. Built on the unturned map; the quarter turn is the skin's object matrix (`setTurn`, the same turn as `turnScenePt`).
- **Widths**: rings are built at the map width at boost 1 (circuit/width.ts); the live width is the skin shader's `circSwellOf` (2D's widthAt, `circBoost`, the least width on the screen), so a zoom or a changed diameter eases the junction with its arms.
- **In and out**: the body's skins are gone by circT 0.35; the map's come in over `SKIN_CIRC_IN` 0.65 to 1 while the arm tubes' second cut (`skinCutC`) takes their ends away, by one screen pattern (never two layers on a pixel). The tubes are whole between.
  A skinned end has no map taper of its own (`applyMates` writes the map's mates without it); the skin's weights blend the widths.
- **Marks, line, colour**: the arms' chevrons, lens colours, fade and highlight come through the same handover as the body's (`CircuitSkinSet.sync`); the line is the map's bolder one (`CIRC_INK_K`) with its inner line (`CIRC_INNER`).
- **Baked**: `scripts/bake-skins.mjs` also writes `anatomy/circuit-skins.bin` (digest `circuit/...`); the page fetches it with the Anatomy's and builds live when it is not the file for this figure.
- **Not welded yet** (`circuitOldJoins`): the liver branch trees (24 branches), the caudate lane and the custom shunts, the map's own tubes (`circuit/tubes.ts`, no vessel of the network). A weld needs (1) those tubes as arms (their rings, presence and the tree's own width rule `treeCircW`
  in the skin shader), (2) a hole in the host lane on the map (a `skinHoleC` as the body's `skinHole`) for the branches that leave a lane's side, (3) a skin built when a custom shunt is routed. Never seen on a device.
- **How the liver branches join until they are** (23 Nov, `circuit/tree-hosts.ts`, `map-depth.ts`; tests/circuit-tree-joins.test.ts): (1) every branch and the caudate lane stands at a depth of its own on the plate, each branch in front of the tube it leaves and the tube it reaches
  (a sinusoid branch in front of the venule it runs on from), so no overlap ties; (2) the body's union rule holds on the map for them (`nbrMap`, shaders.ts): `nbr` of a branch is its distance from up to two tubes (the one it leaves or reaches, and the sibling that leaves or reaches the
  same place), the vertex stage takes each one's live radius from `nbrW0` / `nbrW1` (the tube's `circW`), and the fragment stage draws no line, no inner line and no shade band where the pixel lies inside either lumen; (3) a branch's end inside a tube is sunk and closes there. The vessel
  program is at its 16 attributes (tests/gl-gate.ts): no attribute was added. The caudate lane and the custom shunts keep their sunk ends and their arc-length bury; their union rule is not built (their hosts are vein tubes whose width comes from the data).

## Not done yet (gaps)
- Nothing here has run on a real GPU (the new tangent GLSL, the ribbons and the caption layer are only checked in node): Mac play-test first.
- Deck wiring: Circuit slides still go through `scene-link` as view 'body', so no slide yet calls `setResistors` or `setCaudatePin`.
- The liver-module collapse is only the captions' (inner stations wait for a zoom); the branch tubes do not yet collapse to the 2D "module" drawing when zoomed out.
- The caption layout uses the shared solver with simplified region rules.
