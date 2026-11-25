# portal-pressure-sim-3d

3D cel-shaded rebuild of the portal pressure simulator, consuming [hales-engine](https://github.com/qaddodi/hales-engine).

```
npm install
npm run dev          # local dev server
npm run check        # typecheck (10 s) + lint (3 s) + the whole suite (about 26 min on 4 cores, 6,000 tests)
npm run pre-push     # the quick one: typecheck, lint and only the tests that import what changed (under 2 min)
npm run build        # production build to dist/
npm run sync:engine  # re-copy hales-engine and the simulation host at their pinned commits
```

Stack: Vite, React, React Three Fiber, three, zustand. Docs: `docs/look-and-feel.md`, `docs/slice-plan.md`, `docs/interfaces.md`.
