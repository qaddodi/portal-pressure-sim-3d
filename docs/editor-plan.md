# In-app anatomy editor (?editor, preview only) — plan, 24 Nov 2026

Mohammad asked: Opus plans at low effort, parallel Sonnet builders build. Scope: vessels AND organs (he confirmed 13:10 UTC).
This feature only overrides the "no planning layer" rule.

## Design in one paragraph
Edits are data, not live mesh surgery. `src/editor/types.ts` is the contract (Overrides JSON: node moves, vessel control-point offsets,
organ move/rotY/scale + liquify strokes, with limits). `src/editor/store.ts` reads them synchronously at module load: the committed
`src/editor/overrides.json` everywhere, or on /preview/ with `?editor` the editor's localStorage draft. Geometry is built from the
overridden data once, at boot, exactly as today, so every consumer (camera shots, scope, catheters, centrelines, labels, clots,
ascites) rebuilds from ONE geometry. While dragging, the editor shows a light overlay (skeleton lines + handles, organ ghost);
"Save" stores the draft and reloads. "Export" copies/downloads the JSON; a thread commits it to `src/editor/overrides.json`
when Mohammad says, which is what makes it real on /preview/ and later main. Nothing changes without ?editor while overrides.json is `{ "version": 1 }`.

Smooth joins: no net mesh, no SDF (abandoned 22 Nov). A node move shifts every arm end at that node by the same vector and eases the
offset to zero along each arm (smoothstep over the arm's first ~25% / at most 6 radii), applied to the 2D plan BEFORE the existing
join, run-on smoothing, bend floor and skin code runs. So the existing junction code keeps doing what it does now on a moved skeleton.
Control-point edits on a vessel are offsets blended with a smooth kernel between points and pinned to 0 at both ends.

## Workstreams (one Sonnet builder each, disjoint files)

| WS | Owns (only these files) | Does |
|---|---|---|
| A Vessel seam | `src/scene/vessels/network.ts` (pathOf/courseOf only, additive), new `src/editor/vessel-apply.ts`, `tests/editor-vessel-apply.test.ts` | Pure `applyVesselOverrides(id, path2D, edge)` (node moves with eased arms + control-point offsets, dz into depth). Wire into `pathOf` and z. Tests: empty overrides = identical paths (byte-equal); a node move keeps every arm end meeting at the node equal, tangents continuous (no kink > existing), zero ends drift. Export `editableSkeleton()` (nodes with positions and arm ids, per-vessel 2D course) for the UI. |
| B Organ seam | `src/scene/organs/meshes.ts` (additive hook after decode/make), new `src/editor/organ-apply.ts`, `tests/editor-organ-apply.test.ts` | Pure `applyOrganEdit(geometry, edit)`: clamp move/rotY/scale to ORGAN_LIMITS (about the organ's centroid), liquify strokes with a smooth (C2 Wendland) falloff, per-vertex displacement clamped to LIQUIFY_LIMIT from the reference, normals and the baked smoothed normals recomputed (normal-smooth.ts), welded seams moved together. Also the raw stomach (scope fit) gets the same edit. Tests: empty = identical buffers; clamp holds; no NaN; seams stay welded. |
| C Editor UI | new `src/ui/debug/editor/*` (panel, overlay, picking, drag), `src/ui/debug/flags.ts` (one `editor` entry, gate 'local'), the one mount line in `src/main.tsx`, one additive overlay hook in `src/scene/scene.ts` (`setEditorOverlay(obj)`), `tests/editor-ui.test.ts` | Mount only when DEBUG && isPreview() && flagOn('editor') via dynamic import. Free orbit reusing `rig.setInspect/inspectTo` (as the inspector). Modes: Vessels (node handles + per-vessel control points; drag on the camera-facing plane through the handle; depth with a modifier/slider), Organs (pick organ, move/rotate/scale within limits; Liquify brush with radius/strength). Overlay drawn in three (Lines/Points, depthTest off), per-frame via frameFor only. Undo/redo, Save (saveDraft → reload), Export (copy + download JSON), Clear draft. Reads A's `editableSkeleton()` and B's organ list; until they land, code against the types. Touch works (iPad). |
| D Re-anchoring | `src/scene/labels/*`, `src/scene/disease/*`, ascites files (`src/scene/organs/pool-level.ts` and ascites modules), `src/scene/devices/*`, `src/scene/camera/shots.ts`, `src/scene/catheter*.ts`, `tests/editor-anchors.test.ts` | Audit every consumer that holds geometry copied from the 2D plan or organ meshes instead of reading `centrelineOf` / the built meshes (fixed points, cached coordinates, organ-centred boxes). Re-anchor each to the built geometry. Test: with a sample override (setOverridesForTest: move node at the portal confluence, move the liver 0.05), label anchors, clot spans, catheter/scope routes and shot targets follow (within tolerance) and nothing reads the reference geometry. List any consumer it could not re-anchor in the report. |

Contract already committed (types.ts, store.ts, overrides.json). Do not change types.ts without telling the other builders via the report; add optional fields only.

## Rules for every builder
- Rebase on `origin/claude/project-thread-ge1swr`, push there. Fast push: `npm run typecheck`, `npm run lint`, your targeted tests. Never --no-verify.
- No browsers, no headless runs, no full suites, no Actions minutes for tests. Never hand-edit src/engine.
- Nothing visible or changed without `?editor` (tests: empty overrides = identical geometry).
- Any shader touched: parse + declare-before-use test for that program (avoid shaders; the overlay uses stock three materials).
- Raw requestAnimationFrame forbidden; layout reads via layout-snap; off-GPU scan must not grow.
- Report under 80 words: open items first, hash, what changed, how to test, what could be wrong.
