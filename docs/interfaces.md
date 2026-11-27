# Interfaces and folder ownership

Stable on purpose: the scene, cards and deck threads build on these. Change one only by telling the foundation thread (message it first).
Integration branch: `claude/project-thread-ge1swr` (publishes the site). Work on your own `claude/<name>` branch, merge into it when a push works.

| Folder | Owner | Notes |
|---|---|---|
| `AGENTS.md`, `CLAUDE.md`, `package.json`, `index.html`, `vite.config.ts`, `src/main.tsx`, `src/App.tsx`, `src/boot/`, `src/looks/`, `src/state/`, `src/clock/`, `src/engine/`, `src/ui/perf/`, `scripts/`, `.github/` | Foundation | |
| `src/scene/` (Stage, materials, anatomy, camera, catheter, highlight, labels) | Scene | `src/scene/Stage.tsx` mounts the one R3F canvas; the figure is `src/scene/scene.ts` (`CelScene`: its state, with its methods in `src/scene/parts/`, one file per frame system), driven through `sceneApi` / `cel` in `src/scene/api.ts` |
| `src/ui/cards/`, `src/ui/wallet/`, `src/ui/shell/`, `src/ui/settings/`, `src/ui/surface/` | Cards | the chrome: `ui/shell/Shell.tsx` (bars, menus, sheets) and `ui/shell/global.css`; the surface shells (below) |
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

## Surfaces (`src/ui/surface/`)

Every menu, sheet, card pane and dialog is a **surface** of one of three kinds, listed once in `surface/kinds.ts` (`SURFACES`, the registry: a new surface adds its row first).
- **Menu** (choose, then back to the figure): main menu, Settings and its pages, Help, From readings, Blood, Layers, lens, speed, jump to, the slide list, and the TIPS views menu (inline in its Tests pane, sharing only the outside press).
  Shell `<Menu>` (`surface/Menu.tsx`, or `useMenu` and `<Menu ctl>`): placed by its opener (`shell/place.ts`), a sheet on the dock where surfaces are sheets, mounted while shown
  (`surface/presence.ts`). Closes on a press outside (`surface/outside.ts`), Esc, a choice, its opener, its X or a pull.
- **Panel** (work beside the figure): Tests, Treat, History, Compare, Why, the action card, the case's stop card, and the timeline chart (the one full-width panel: its own centred card box, no room taken). Tests keeps its own place
  rule (`tests/place.ts`, the right column's wide tier) with the shell's head, column step, room channel and pull; the stop card is the case's own, with the shared stops.
  Shell `<Panel>` / `<ShellPanel>` (`surface/Panel.tsx`), or `usePanelShell` (`surface/wire.ts`) on a panel's own 2D markup (Treat, the action card). It places the panel in its column
  (`surface/panel-place.ts`: right column 420 px, Tests its own 500 to 600 px; left column 340 px), publishes its box to the one room channel (`surface/room.ts`: the figure pans to what
  is left), writes its role, and on a phone gives it Peek, Half and Full (`surface/use-sheet.ts`, `sheet-stops.ts`, `sheet-pull.ts`). Head: `<PanelHead>` and `<Tabs>`, the one X
  (`surface/parts.tsx` `CloseX`), the one grab bar (`GrabBar`, `SheetGrab`). A panel **never** closes on a press outside.
- **Dialog** (answer or read before going on): Reset, the deck dialogs, the case guard, About, Privacy, the Guide, Search. Shell `<Dialog size="s|l">` (`surface/Dialog.tsx`):
  one scrim, the focus trap, Esc and a press off the box cancel (`surface/dialog-stack.ts`).

Sheet or float is one answer, `surface/mode.ts` (`sheetMode()`, `surfaceModeNow()`, `useSurfaceMode()`): a sheet exactly when the thumb dock is up (a screen up to 1100 px wide,
held upright); a phone held sideways floats. Leave times are `surface/motion.ts` (`leaveMs(kind, mode)`, and the surfaces' named own-pace times), over `ui/motion.ts` tokens.

The slot rule (`surface/slots.ts`, wired by `surface/wire.ts` `startSlots`): on a wide screen the right column holds up to two panels side by side, in the order they opened
(the first keeps the right edge, the newer stands to its left); opening a third puts away the one opened longest ago; two stand together only while at least 400 px of figure
stays free (`panel-place.ts` `FIGURE_MIN`), otherwise the newest replaces the other; nothing overlaps. Where surfaces are sheets, one panel at a time, except that the action card
may stay up with Tests. On a wide screen opening a menu or a dialog never puts a panel away; where surfaces are sheets a menu takes the place of History, Compare and Why
(one sheet over the dock), and the timeline chart keeps its open state in the menus' slot (`useShell.sheet`), so a menu replaces it. One Esc closes a dialog, then a menu, then the newest panel (`kinds.ts` `ESC_ORDER`, `keys/escape.ts`).

Lint rules (`scripts/lint-rules.mjs`, allowance 0) keep it so: `surface-outside-shell` (a dialog's or menu's role, `aria-modal` and `sh-grabbar` are written only in
`src/ui/surface/`), `one-sheet-rule` (a file that renders a surface never imports `STACK_MQ`, `THUMB_MQ`, `isThumb`, `useThumb`, `usesBottomBar`, `onPhone` or `frameIsSheet`),
`surface-motion-tokens` (no millisecond count in a surface file: durations come from `ui/motion.ts` or `surface/motion.ts`). `tests/surface-registry.test.ts` holds the registry.

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
