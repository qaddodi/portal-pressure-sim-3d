# The HVPG slice: plan

19 Nov 2026, version 1. Plan only; no app code yet. Read with `look-and-feel.md` and the mocks (https://claude.ai/artifact/74tCejAXQrfgeSh63L26ZD).
The slice is the first piece of the 3D app you will see on your devices, so it is held to the full done bar (section 5), not a demo standard.

## 1. Scope

**In the slice:** the HVPG deck from its title to the HVPG result, on the cirrhosis with CSPH preset (`csph`), in all five looks, on iPhone
(portrait and landscape), iPad (both) and Mac.

| # | Slide (id in `hvpg.js`) | What the 3D shows | Cards |
|---|---|---|---|
| 0 | Deck title | Whole body plate, slow settle | Title card: kicker, title, summary, objectives, Start, Handout |
| 1 | `route`: access through the right internal jugular vein | Catheter advances from the neck through the right atrium and IVC into the right hepatic vein | Teaching card |
| 2 | `free`: the FHVP with the tip free | Tip free in the hepatic vein; IVC and FHVP tags | Teaching card, pressure ladder |
| 3 | `wedge`: the wedged pressure | Balloon inflates and wedges; flow marks in that vein stop | Teaching card, pressure ladder |
| 4 | `hvpg`: HVPG across the sinusoids | Same shot; WHVP − FHVP on the card and the figure | Teaching card with the equation, ladder with the HVPG pill |
| 5 | Quick check | Figure stays | The deck's own `checks` |

Plus, in free play outside the deck: tap a vessel to pick it (the highlight in the mocks), limited orbit, look picker.

**After the slice** (they need parts the slice does not build): `wedge-sinusoid`, `presin`, `eus-ladder` (lobule dive), `ppg` (chronic PVT),
`eus` (EUS needle), `heart` (right heart failure), `bc` (Budd–Chiari), the five-patient summary table.

## 2. Repo layout (`qaddodi/portal-pressure-sim-3d`)

```
AGENTS.md, CLAUDE.md          working rules for this repo (copied from the 2D repo where they still apply: preview branch, push protocol,
                              Baveno VIII, no headless runs, no Actions minutes, one clock)
docs/look-and-feel.md         this spec
docs/slice-plan.md            this plan
docs/mocks/slice-mocks.html   the live mocks
index.html
package.json                  vite, react, react-dom, three, @react-three/fiber, zustand; drei only for parts we use
src/
  main.tsx                    boots the app, loads fonts, then shows the first card (never before)
  engine/
    hales/                    pinned copy of hales-engine (synced by script, same way the 2D app now consumes it)
    client.ts                 owns the worker, sends actions, receives frame / metrics / sequence / history / crash
    store.ts                  zustand store: latest frame, metrics, preset, deck position
    vessel-data.ts            per-vessel pressure, flow and area into one data texture each frame
  clock/
    frame.ts                  the only frame loop: engine frame, tweens, camera, render, tags (a test fails any other loop)
    tween.ts                  eased values on that clock
  scene/
    Stage.tsx                 the R3F canvas, render on demand
    materials/toon.ts         banded light, rim, specular, flow marks (GLSL)
    materials/ink.ts          screen-pixel hull outline with the highlight fade
    anatomy/placeholder.ts    procedural organs (until the artist's glTF arrives)
    anatomy/vessels.ts        centrelines to tubes; names are topology edge IDs (PV_TRUNK, SPL, SMV...)
    anatomy/gltf.ts           loader for the artist's files later
    catheter.ts               route, free, wedge and balloon states
    highlight.ts              "long ahead, short behind" along the vessel network
    camera/shots.ts           named shots (deck `cam` names) and the shot tween
    camera/room.ts            free room from card boxes; projection shift
  ui/
    cards/TeachingCard.tsx, cards/LadderCard.tsx, cards/TitleCard.tsx, cards/CheckCard.tsx
    wallet/Wallet.tsx         sideways iPhone
    tags/Tags.tsx             3D-anchored pills; positions written by the clock, not by React
    deck/Presenter.tsx        walks the deck data; next and back; keyboard, swipe
    shell/TopBar.tsx, settings/LookPicker.tsx
    perf/Perf.tsx             ?perf overlay on the device: frame times, slowest frames, Copy
  looks/
    looks.ts                  the five looks: UI tokens and 3D tones in one table
  decks/
    hvpg.ts                   copied from the 2D repo by script, plus 3D fields (shots)
    schema.ts                 checks every deck field
scripts/
  sync-engine.mjs             copies hales-engine at a pinned commit
  copy-decks.mjs              copies decks from the 2D repo
  build.mjs                   production build to dist/
  deploy.mjs                  pushes dist/ to the gh-pages branch (no Actions)
tests/                        node --test, seconds only
```

## 3. How it reads hales-engine

- The 2D app now uses a **pinned copy** of hales-engine synced by a script (the engine thread's setup, 19 Nov; tags are not pushable from the
  cloud yet, so the pin is a commit). The 3D app does the same: `scripts/sync-engine.mjs <commit>` copies `core`, `modules/portal` and the
  worker into `src/engine/hales/`, and records the commit in `src/engine/hales/PINNED`.
- The worker runs the engine exactly as in the 2D app. `client.ts` speaks the same messages (`frame`, `metrics`, `snapshot`, `sequence`,
  `seqStep`, `history`, `explain`, `presets`, `presetMetrics`, `healthy`, `crash`, `error`). A `protocol.d.ts` from hales-engine types them.
- Each frame, `vessel-data.ts` writes pressure, flow and area per vessel into one small texture (one texel per vessel). The shaders read colour
  shifts, swelling and flow-mark speed from it, so a new engine frame costs one texture upload, no per-vessel CPU work.
- The 3D vessels are named by topology edge ID, so the mapping from engine to mesh is the name. A test fails if a drawn vessel has no edge.
- Deck numbers (`{hvpg}` in the text) come from the engine, as in the 2D app. A test runs the `csph` preset in hales-engine and checks that the
  3D app's numbers equal the 2D app's for every slide in the slice.

## 4. Order of work

1. Repo rules (AGENTS.md, CLAUDE.md), Vite + React + R3F skeleton, looks table, fonts. Preview at the repo's own Pages address.
2. Engine: sync script, worker client, store, data texture. Unit test: same numbers as the 2D app on `csph`.
3. The clock: one loop, tweens, render on demand; the grep test.
4. Scene: toon and ink materials, placeholder anatomy, vessels from centrelines, flow marks.
5. Camera: shots, free room, projection shift; the dive.
6. Cards: title, teaching, ladder, check; room-first layout per device; the wallet.
7. Tags and the label solver.
8. Catheter states for the four slides; balloon wedge; flow stop.
9. Highlight in free play.
10. `?perf`; your device pass; fixes; repeat.

Each step is pushed to a `claude/` preview branch as soon as it works, with the push report (hash, what changed, how to test, what could
still be wrong), and you test on your devices.

## 5. Done bar for the slice

The slice is done only when all of these hold on your iPhone, iPad and Mac, in all five looks.

| Area | Bar |
|---|---|
| Speed | 60 fps during every camera move, card move, catheter move and the wallet swap on your iPhone, read from `?perf` on the device (no frame over 20 ms in a 10 s run of the deck); 0 frames drawn when nothing moves |
| Start | First card on screen within 2 s on your iPhone on Wi-Fi; the canvas never shows blank or unshaded |
| Glitches | Nothing pops in or out; no card shown before its content and fonts are ready; no text shown before its card; tags fade between spots and never slide; no frame where a tag lags the picture; GPU context loss recovers without a reload |
| Text | Never shrinks: body 17 px Mac and iPad, 16 px iPhone; slide titles at least 1.4× body (1.33× on phones where needed); data text at least 12 px |
| Cards | Nothing scrolls inside a card, nothing scrolls sideways, no card taller than the screen; cards fit their content exactly |
| Layout | Room first: the subject always sits in the free room; safe areas respected; iPhone landscape uses the wallet |
| Numbers | Every number equals the 2D app's for the same preset and slide |
| Clinical | Baveno VIII and AASLD only; wording checked against the 2D deck text |
| Memory | Under the budget in the report (section 8): pixel ratio capped at 2, under 100 draw calls, under 32 MB of textures |
| Tests | Unit tests only (seconds): tube building, room solver, deck schema, one-clock grep, numbers match, type floor, look table matches the 2D tokens |

## 6. What could still go wrong

- Placeholder anatomy may not read as "beautiful" even with good shading; the artist's model is what makes it an atlas. The slice judges the
  look system (bands, ink, colour, cards, motion), and the anatomy only as placeholder.
- WebGL2 on older iPhones: fine for this scene size, but the done bar is set on your current iPhone; we should name the oldest device to support.
- Fonts load late on a slow network: the first card waits for them (rule), which costs start time; we will preload them.
- The deck copy goes stale if 2D deck text changes during the overlap; `copy-decks.mjs` is re-run before each slice push.
