# portal-pressure-sim-3d

A 3D, cel-shaded rebuild of the [portal pressure simulator](https://github.com/qaddodi/portal-pressure-simulator): the same physics, drawn in 3D instead of 2D.

**Status: nothing built yet.** No app code lives here; this repository only holds the plan (see `docs/` when it lands) and will hold the 3D app once the first slice starts.

## The physics is not rewritten

The model comes from [hales-engine](https://github.com/qaddodi/hales-engine), the body-wide pressure engine that was split out of the 2D app (`core/` shared machinery plus a `portal/` module). This app will consume it the same way the 2D app does:

- a **vendored copy** of hales-engine's `src/` in `src/engine/` (`core/`, `portal/`), pinned to one commit by `src/engine/VENDORED.json` (repository, commit, a sha256 per file);
- moved only deliberately, by a sync script (`scripts/sync-engine.mjs --ref <tag|commit>`, the same script and manifest format as the 2D app's), with a unit test that fails when the copy and its manifest disagree;
- never edited in place: the engine changes in hales-engine, is tagged, then synced.

Why a copy and not a git dependency (a private repository would put a token in every workflow; the engine's worker and tests expect plain files at fixed paths): see `docs/engine-vendoring.md` in the 2D app.

The 3D app keeps the 2D app's message protocol to the engine worker (it is app glue, not engine), so the same presets, decks and "what happens to the pressure" behaviour carry over.
