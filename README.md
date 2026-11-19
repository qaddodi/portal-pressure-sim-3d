# portal-pressure-sim-3d

3D cel-shaded rebuild of the portal pressure simulator, consuming [hales-engine](https://github.com/qaddodi/hales-engine).

```
npm install
npm run dev          # local dev server
npm run check        # typecheck + lint + unit tests (about a second)
npm run build        # production build to dist/
npm run sync:engine  # re-copy hales-engine and the simulation host at their pinned commits
```

Stack: Vite, React, React Three Fiber, three, zustand. Docs: `docs/look-and-feel.md`, `docs/slice-plan.md`, `docs/interfaces.md`.
