# Decisions behind the code

One line each, with the date, so the code can keep a one-clause "why" and point here. Add to this file when a comment would otherwise carry an owner's quote or a review's number.

- **Lobule to sinusoid handoff** (20 Nov 2026, play-test): the lobule stays whole under the sinusoid until the sinusoid is whole over it, then stands aside; the sinusoid is drawn over it, lifted, from `SIN_SHOW_FROM`. Both dissolving at once let the page show through both: the pale, washed frame at the handoff. (`src/scene/scene.ts`)
- **Warm-up before the micro views** (21 Nov 2026, release review #8): the warm-up's compiles finish, or give up after `WARM_CAP_MS`, before the lobule and sinusoid are built, never both in one slot; on a low-budget device the two together were one long hitch. (`src/scene/Stage.tsx`)
- **One answer to "is a talk on"** (22 Nov 2026, codebase review R4): `useUi` holds it; `src/state/deck.ts` only reads it; a talk ends in `closeTalk`. Three stores copied into one another used to disagree. (`src/state/deck.ts`, `src/ui/shell/talk.ts`)
- **One place starts the simulation workers** (22 Nov 2026, codebase review R8): `src/engine/pool.ts`. The host and its protocol types are hales-engine's own (`src/host/`), not the 2D app's. (`src/engine/`)
