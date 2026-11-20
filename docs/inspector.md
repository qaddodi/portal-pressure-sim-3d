# The inspector (`?inspect`, and `?joins=debug`)

An on-screen panel for looking at the figure from every side and for taking its parts away one at a time, built to isolate specks in the flow-mark pass (Mohammad, 20 Nov: "make the debug more elaborate; rotate all around, change shaders"). Open any page with `?inspect` (live site or preview). `?joins=debug` opens it too, with the skins' dropped pixels painted, as before. A pill "Inspect" at the top left shows and hides the panel; what is set stays set while it is hidden.

Normal mode never loads it. `src/main.tsx` imports `ui/debug/inspect/panel.ts` only when the address asks, and the shaders carry their hooks only behind `#ifdef VDBG` (the define, and the uniforms, are put on the materials only on such a page: `scene/vessels/debug-view.ts`). `tests/inspect.test.ts` pins that no hook stands outside the define.

| Section | What it does | How |
|---|---|---|
| Camera | Free orbit: the drag turns the figure all the way round and tilts to 88 degrees, nothing springs home; Turn and Tilt sliders; Front, Back, Left, Right, Top, Bottom (they ease, the short way round); Reset (turn, tilt, zoom and pan) | `rig.setInspect`, `inspectTo`; the gesture host's `holdTurn` |
| Show everything | All collaterals open (C1a to C9 at full diameter), all six fixed shunts in (TIPS, DIPS, portocaval, DSRS, mesocaval, Meso-Rex), dotted potential collaterals, Freeze the model. Body and Circuit alike | `engine/force-all.ts`: a forged COPY of the engine frame held with `holdFrame` (as Compare's Then view does) and remade from each live frame; a frame Compare holds is never taken |
| Joins and diagnostics | Junction method old / mesh / mesh2; paint dropped skin pixels; skin without flow marks, or without ink | `setJoinsOverride` (`joins-mode.ts`), `CelScene.useJoinsLive`, `reapplySkinDefines` (the skins compile again, a second or so) |
| Tubes, Skins | Each its own: shade (as drawn, flat, normals, lens colour), dust, chevrons, outline ink, a colour per vessel / junction, a colour laid over it | uniforms of `debug-view.ts`, shared by reference |
| Layers | Vessel tubes, junction skins, organs, clots/plexus/bleed/dye, devices, the Circuit map, the lobule and sinusoid: drawn or not, drawn as wireframe; the anti-aliasing pass | `CelScene.inspectLayers`, `setInspectShown`, `setInspectWire` (flags are put on for one draw and taken off) |
| Hunt a speck | One press each: no flow marks, no dust, no chevrons, no ink, flat, normals, who draws it, dropped pixels, old joins; Reset all; Copy | `ui/debug/inspect/state.ts` PRESETS |

A part left out is cleared (`fd = vec4(0.0)`), never multiplied by 0: a NaN times nothing is still a NaN, and a NaN is the usual speck. "Skin without flow marks" is the compile-time `SKIN_NOMARKS`, which also skips the marks' derivatives and sums, so it answers a different question from the per-part Dust and Chevrons switches (which keep that code running).

Copy puts what was on, as text, on the clipboard: paste it in a thread so the other thread can set the same.

Not covered: the lobule reads the junction method once, when it opens; the msaa canvas (`?aa=msaa`) needs a reload.

While a Show-everything box is on, the numbers, labels and lens colours are the forged frame's, not the patient's. The engine is never edited and `live.frame` is the model's own; switching the boxes off puts it back and the scene eases the vessels away on its own tracks.
