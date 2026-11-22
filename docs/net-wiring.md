# ?geom=net: the network meshes in the scene (WP4)

Behind `?geom=net` only (`net/flag.ts`). With no flag nothing here runs: the scene mounts no net figure, and the tubes and skins are exactly today's.

## What is drawn
- `scene.ts` `mountNet()` loads the baked meshes (`public/anatomy/net-<n>.bin`, gzip; `net/load.ts`; a dynamic import, off the load path) and builds a `NetFigure` (`net/network-object.ts`).
- The old `VesselObject`s stay. They hold the state (every uniform), the picking, the glow mask and the Circuit's draw. The net rows are a second reader of their `toon.uniforms` (`net/rows.ts`, `NetRows.sync()` per frame); nothing writes state twice.
- Networks: 16 (net 0 the arteries, net 1 the venous tree, 2 to 15 single-edge collaterals and shunts). Single-edge networks are merged into one "loose" object: 3 objects, 2 passes each (organs pass: triangles touching back vessels, layer 0; vessel pass: all triangles, `VESSEL_LAYER`) = 6 draws, plus the sewn pass and the capsule pass (one draw each, before the figure). Vessel draws <= 12 (`tests/net-wiring.test.ts`).
- A skeleton host split into pieces (`X#j`) shares bones, so every u- or length-based column is remapped per piece (`remapPiece`).

## The badge
Under `?geom=net` a corner badge (net/badge.ts, fades by CSS in 12 s) says `Mesh: loading network`, then `Mesh: network`, or `Mesh: fallback (reason)`: a file the deploy lacked (`net-3.bin: HTTP 404 (./anatomy/net-3.bin)`), a file baked from another skeleton, an error while building the figure (the tubes come back), or a shader the device refused. The network is meant to look like today's tubes at rest, so the badge is the only way to tell.

## Bakes
`node scripts/bake-skins.mjs --net` (about 64 s, cached by the skeleton digest and source mtime, `--force`). Non-main builds run it (`scripts/build.mjs`); the files are git-ignored. Missing or stale files: the console says so and `?geom=net` leaves the old figure.

## No hand-over
The network draws the whole picture at every t, the Circuit's change included; its fillets dissolve by WP3's screen dither (71141fa7). The old tubes are not drawn (`setNetHidden`) and their fade is 0 (so the skins that follow it are off): they stay only for state and picking. The earlier temporary hand-over to the old figure over the first 0.1 of t is gone.

## Budget
`net/reads.ts` models the junction texel reads per drawn frame on the real mesh (every vertex's bones, the region rows, the capsule and sewn passes). Worst case 1.16 M (t = 0.15), bound 1.5 M. A model of the shader text, not a measurement: confirm with `?perf` on a device.

## Known gaps
- GLSL never executed (no GPU here). Pushed, not yet seen.
- No crossing-shadow program and no second draw for both-sides-blendable crossings.
- Glow mask and picking stay on the old tubes. Stent waist narrowing and WP5's dynamic shapes are not driven (the clamp waist is, `waistOf`).
- Chevron and dust phase restart at the 7 piece joins (needs an arc-offset column).
- Wide-junction keys are not in the shader (WP3).

`scripts/net-compare.mjs --out <dir>` renders today's tubes and skins beside the net meshes at rest (the oracle, not the GPU) from one camera.
