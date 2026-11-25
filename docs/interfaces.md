# Interfaces and folder ownership

Stable on purpose: the scene, cards and deck threads build on these. Change one only by telling the foundation thread (message it first).
Integration branch: `claude/project-thread-ge1swr` (publishes the site). Work on your own `claude/<name>` branch, merge into it when a push works.

| Folder | Owner | Notes |
|---|---|---|
| `AGENTS.md`, `CLAUDE.md`, `package.json`, `index.html`, `vite.config.ts`, `src/main.tsx`, `src/App.tsx`, `src/boot/`, `src/looks/`, `src/state/`, `src/clock/`, `src/engine/`, `src/ui/perf/`, `scripts/`, `.github/` | Foundation | |
| `src/scene/` (Stage, materials, anatomy, camera, catheter, highlight, labels) | Scene | `src/scene/Stage.tsx` mounts the one R3F canvas; the figure is `src/scene/scene.ts` (`CelScene`: its state, with its methods in `src/scene/parts/`, one file per frame system), driven through `sceneApi` / `cel` in `src/scene/api.ts` |
| `src/ui/cards/`, `src/ui/wallet/`, `src/ui/shell/`, `src/ui/settings/` | Cards | the chrome: `ui/shell/Shell.tsx` (bars, menus, sheets) and `ui/shell/global.css` |
| `src/decks/`, `src/ui/deck/`, `scripts/copy-decks.mjs` | Deck | |

## The clock (`src/clock/`)

```ts
import { clock, frameFor } from '../clock/frame.ts';
clock.on('engine' | 'tween' | 'camera' | 'render' | 'tags', (f: {time, dt, frame}) => {}, order = 0): () => void   // returns the remover
const h = clock.hold('camera-shot'); /* …moving… */ h.release();   // keep frames coming while it moves (tag shows in ?perf)
clock.invalidate('why');                                           // exactly one more frame
frameFor('tag', ms);                                               // hold for a known length
```
Phases run in that fixed order each frame: engine (adopt the newest engine frame) → tween → camera → render → tags (write label positions).
Nothing runs when nobody asked: **0 frames drawn when nothing moves**. Never call `requestAnimationFrame` (a test fails it).

```ts
import { Tweened, easeArrive, easeInOutCubic, MOTION } from '../clock/tween.ts';
const x = new Tweened(0, 'card-x');  x.to(120, { ms: MOTION.cardInMs, ease: easeArrive, done });  x.value   // read in a clock system
```
`MOTION` is the motion table of look-and-feel section 7 (shot 950 ms, card 280 ms, wallet 280 ms, tags back 180 ms, roll 400 ms).

R3F: `<Canvas frameloop="never">` with `<ClockBridge/>` (`src/clock/r3f.tsx`) inside. Draws happen in the clock's render phase.

## Engine (`src/engine/`, import from `../engine/index.ts`)

- `bootEngine()` (called by `main.tsx`): starts the worker, loads the first patient (`START_PRESET`, `healthy`), adopts frames. Frames of any other patient are never shown before it.
- `useEngine(selector)`: `{ status: 'booting'|'ready'|'crashed', presetId, hvpg, whvp, fhvp, pv, ivc, ra, crash }` (mmHg or null; `useEngine.subscribe` it to mirror readings into your own store, so the engine never imports a UI store); re-renders only when a headline number moves.
- `latest.frame` / `latest.version`: the newest `EngineFrame` outside React (read in clock systems). Arrays: `P`, `Pf` per node; `Q`, `Qf`, `D` per edge (topology order).
- `engine().send({type, …})` / `engine().request({type, …})` (promise): the worker's messages, typed by the engine itself in `hales/host/protocol.d.ts` (`preset`, `setParams`, `action`, `morph`, `sequence`, `explain`, `metrics`…; the engine's own protocol test fails when they move).
  Deck numbers (`{hvpg}`) come from `request({type:'metrics'})` / frames, as in the 2D app.
- `VesselData` (`vessel-data.ts`): one float texture, one texel per vessel in topology edge order. Texel r = upstream pressure (mmHg), g = flow (mL/s, negative = reversed),
  b = diameter (mm), a = downstream pressure. `indexOf('PV_TRUNK')` is the texel; **a 3D vessel's name is its topology edge id**. `Stage.tsx` fills it in the clock's engine phase.
- `src/engine/hales/` is a copy of hales-engine, host included (`npm run sync:engine`); never edit it.
- Workers: `engine/pool.ts` is the one place a simulation worker starts. `enginePool.live()` is the figure's (owned by `EngineClient`); `enginePool.sequence` (a deck's states) and `enginePool.whatIf` (the Model line) are second engines that start on their first message, are told `{ type: 'crash' }` once when they fail or stall, and start afresh after.

## State and settings

- Is a talk on, which, and where: ONE answer, `useUi` (`src/ui/ui-store.ts`: `deck`, `stops`, `pos`). `src/state/deck.ts` only reads it: `talkOn()`, `talkId()`, `slideIndex()` (0 = the title), `slideCount()` and the hook `useTalkOn()`. A talk starts with `startTalk` and ends in `closeTalk` (`src/ui/shell/talk.ts`); there is no second store to keep in step (`tests/talk-state.test.ts`).
- `useSettings` (`src/state/settings.ts`): the look, Display (blur, figure detail, sharp while moving, keyboard shortcuts), Diagnostics and the Figure depth switches (`DEPTH_KEYS`), kept in localStorage under `STORAGE_PREFIX`.
- Looks (`src/looks/looks.ts`): `LOOKS[id]` has every UI token and 3D tone (plate, ink, liver…, portal, systemic, `shadeK`); `applyLook` writes CSS variables
  (`--bg --surface --glass --text --text-2 --text-3 --accent --accent-soft --ok --caution --danger --sys --edge --shadow-rgb --sa --organ-body --ink --organ-* --vein-*`, plus `--ui` and `--display` font families from global.css) and `data-look` on `<html>`.
  The scene reads the table directly (`hexToRgb` for uniforms) and re-reads on `useSettings` change.

## Boot order

saved look → (fonts + engine's first patient) → React → first card. No card is shown before its fonts are ready (`src/boot/fonts.ts`, 4 s cap).
An engine that does not start (its worker fails to load, crashes, sends an unreadable message, or does not answer within 30 s) rejects every waiting request, sets
`useEngine` status `crashed` with the reason, and `main.tsx` shows `ui/shell/BootCrash.tsx` (the reason and Reload) instead of the app (`tests/engine-crash.test.ts`).
After the first render: `registerPwa()` (offline worker, once the page is idle; an update is offered as a toast with Reload) and `warmLater()` (a talk's charts).

The boot entry holds no debug page, gallery, parity page or chart family (`tests/boot-entry.test.ts`): a talk's charts are one chunk (`ui/talk/ToolCardBody.tsx`,
loaded by `ui/talk/tool-card-load.ts`; a talk waits for it), the decks' hook tables read `ui/charts/kinds.ts`, never `registry.ts`, and three.js and React are chunks
of their own (`vite.config.ts`). The offline worker (`scripts/pwa.mjs`) installs the boot files first, in the order the page needs them, and fills the rest when asked.

## ?perf

`?perf` on the address: median/p95/worst frame work, frames over 20 ms or after a gap over 50 ms with phase and asker, Copy and Reset. Name your holds well.
