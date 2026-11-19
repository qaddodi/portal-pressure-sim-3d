# Interfaces and folder ownership

Stable on purpose: the scene, cards and deck threads build on these. Change one only by telling the foundation thread (message it first).
Integration branch: `claude/project-thread-ge1swr` (publishes the site). Work on your own `claude/<name>` branch, merge into it when a push works.

| Folder | Owner | Notes |
|---|---|---|
| `AGENTS.md`, `CLAUDE.md`, `package.json`, `index.html`, `vite.config.ts`, `src/main.tsx`, `src/App.tsx`, `src/boot/`, `src/looks/`, `src/state/`, `src/clock/`, `src/engine/`, `src/ui/perf/`, `scripts/`, `.github/` | Foundation | |
| `src/scene/` (Stage, materials, anatomy, camera, catheter, highlight) | Scene | `src/scene/Stage.tsx` is a placeholder sphere until it lands |
| `src/ui/cards/`, `src/ui/wallet/`, `src/ui/shell/`, `src/ui/settings/` | Cards | `ui/shell/Shell.tsx` and `global.css` are placeholders; replace freely |
| `src/decks/`, `src/ui/deck/`, `src/ui/tags/`, `scripts/copy-decks.mjs` | Deck | |

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

- `bootEngine()` (called by `main.tsx`): starts the worker, loads the slice patient `csph`, adopts frames. Frames of any other patient are never shown before it.
- `useEngine(selector)`: `{ status: 'booting'|'ready'|'crashed', presetId, hvpg, whvp, fhvp, pv, ivc, ra, crash }` (mmHg or null; `useEngine.subscribe` it to mirror readings into your own store, so the engine never imports a UI store); re-renders only when a headline number moves.
- `latest.frame` / `latest.version`: the newest `EngineFrame` outside React (read in clock systems). Arrays: `P`, `Pf` per node; `Q`, `Qf`, `D` per edge (topology order).
- `engine().send({type, …})` / `engine().request({type, …})` (promise): the worker's messages, typed in `protocol.ts` (`preset`, `setParams`, `action`, `morph`, `sequence`, `explain`, `metrics`…).
  Deck numbers (`{hvpg}`) come from `request({type:'metrics'})` / frames, as in the 2D app.
- `VesselData` (`vessel-data.ts`): one float texture, one texel per vessel in topology edge order. Texel r = upstream pressure (mmHg), g = flow (mL/s, negative = reversed),
  b = diameter (mm), a = downstream pressure. `indexOf('PV_TRUNK')` is the texel; **a 3D vessel's name is its topology edge id**. `Stage.tsx` fills it in the clock's engine phase.
- `src/engine/hales/` and `src/engine/host/` are copies (`npm run sync:engine`); never edit them. The host is the 2D app's `worker-core.js` until hales-engine ships its own.

## State and settings

- `useDeck` (`src/state/deck.ts`): `{ mode: 'free'|'deck', deckId, slide (0 = title), slideCount, dir, open(id, count, slide?), close(), next(), back(), goto(i) }`.
- `useSettings` (`src/state/settings.ts`): `{ look: LookChoice, flowMarks: 'A'|'B'|'C'|'D' (default 'A'), setLook, setFlowMarks }`, kept in localStorage.
  Flow-mark styles: A = chevrons on the vessels the slide talks about and the picked one; B = chevrons everywhere, fainter off-topic; C = soft light bands everywhere; D = marks only after a change.
- Looks (`src/looks/looks.ts`): `LOOKS[id]` has every UI token and 3D tone (plate, ink, liver…, portal, systemic, `shadeK`); `applyLook` writes CSS variables
  (`--bg --surface --glass --text --text-2 --text-3 --accent --accent-soft --ok --caution --danger --sys --edge --shadow-rgb --sa --organ-body --ink --organ-* --vein-*`, plus `--ui` and `--display` font families from global.css) and `data-look` on `<html>`.
  The scene reads the table directly (`hexToRgb` for uniforms) and re-reads on `useSettings` change.

## Boot order

saved look → (fonts + engine's first patient) → React → first card. No card is shown before its fonts are ready (`src/boot/fonts.ts`, 4 s cap).

## ?perf

`?perf` on the address: median/p95/worst frame work, frames over 20 ms or after a gap over 50 ms with phase and asker, Copy and Reset. Name your holds well.
