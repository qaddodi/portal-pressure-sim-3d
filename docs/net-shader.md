# The network shader (WP3, `?geom=net`)

`src/scene/vessels/net/shaders.ts`: one vertex and one fragment program for a whole network's mesh. Status: compiles and links (4 programs: base, VEIL, GLOW, VDBG), 9 varyings, 11 attributes, 9 samplers. The GLSL has never run: no device, no browser in the cloud. A CPU oracle (`tests/net-oracle.ts`) holds the formula by hand.

## What is shared with the old program (moved, not copied)
`glsl-shared.ts` holds the chunks both programs splice: `CIRC_WIDTH_OF_GLSL`, `STUMP_K_GLSL`, `CAP_CARVED_GLSL`, `PROCEDURE_MARKS_GLSL`, `FADE_ALPHA_GLSL`, `HIGHLIGHT_ALONG_GLSL`; `circuit/shader.ts` holds `CIRC_PEEL_GLSL`; `materials/shaders.ts` the fade functions. The old program's output is byte-identical to before (`tests/glsl-shared.test.ts`). Per-vessel names are global variables the generated `loadEdgeVS/FS` fill from the edge-state texture.

## Open (measured, `tests/net-deform.test.ts`, todo tests print the numbers)
Against the owner's criteria (bound normal within 3 deg p99 of the SHADE normal; fillet within 0.05 R of the live union), linear blend skinning does NOT meet them once the arms deform differently:
- Rest / Circuit t=.25 on Y and H: p99 3.3 deg, union 0.058 R (just over); T, TT, STUB, FOUR: 7 to 10 deg at rest; HS (the hard fixture): 50 deg at rest.
- Map pose / t=.75: 8 to 61 deg. Differential swell 1.2/.85: 7 to 50 deg. Presence .3: 20 to 54 deg, union 0.5 to 4.7 R.
- No triangle flips in any state. Edges stay under 3x except an arm at presence .3 (T, FOUR, H, TT).
Likely remedies: a per-vertex live-union gradient for the junction vertices (they are few); or limits on the swell ratio / presence of an arm at a junction.
Also open: the cava ramp length (design only, not tested; judge on a device), the ink-width-across-fillets check (not yet written), `?geom=net` wiring (WP4), crossings of one network (`tests/net-crossings.test.ts`: 7 in the body pose, 18 in the map pose; a faded and a solid vessel in one draw blend in vertex order), and the real skeleton does not mesh yet (HA:art vertex limit).
