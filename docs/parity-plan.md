> **Retired (27 Nov 2026).** The `?parity` scoreboard, its score and its matches list are gone with the 2D app. `src/parity/b*.ts` keep exporting `claims` (derived from the tables the UI renders from) and the tests that import them hold each named control, word and card to the screen; `parity/inventory.json` still feeds `strings.generated.ts`.

# Parity plan: the whole 2D app, 1:1, in 3D

19 Nov 2026, 3 PM ET, version 1. Plan only. It is read against the 2D app's preview branch (`claude/settings-topbar-icon-flvft1`, tip b3058ef3, with
the engine now vendored from hales-engine). It builds on `slice-plan.md`, `look-and-feel.md` and the three slice threads already running
(shell and engine, scene, cards and presenter).

**Goal.** Everything a person can see, read, tap or change in the 2D app exists in the 3D app with the same words, the same numbers and
the same behaviour. Only the drawing changes. Where 1:1 is impossible or would be worse in 3D, section 6 lists it for your call.

## 1. What the 2D app has (inventory)

Sizes: about 156,000 lines of UI JavaScript in 600 files, 10,000 lines of CSS, 42 decks with 512 slides (5,700 lines of deck data).

| Area | What is in it |
|---|---|
| **Shell** | Top bar: menu (named after the patient), view switch, Blood menu and colour legend, Treat, Tests, History, Settings, Search. Play bar at the foot: Play, +1 wk, +1 mo, +6 mo, HVPG and PPG. Zoom group (+, −, Fit). Phones and upright tablets: view switch and actions in a bottom bar; cards rise from behind it, pull down once to halve, again to close |
| **Menu** | *Present*: decks by topic, your scripts, imported decks, Import, Print notes. *Patients*: 20 presets grouped prehepatic, presinusoidal, sinusoidal, postsinusoidal, posthepatic, cardiac (healthy, postprandial, acute and chronic PVT, splenic vein thrombosis, schistosomiasis/NCPH, PSVD, compensated cirrhosis, CSPH, MASLD CSPH, decompensated, decompensated + TIPS, hepatofugal, gastrorenal shunt, pregnancy, SOS, Budd–Chiari, IVC web, right heart failure + TR, constrictive pericarditis) |
| **Views** | Anatomy; Circuit (transit map, can turn upright; Anatomy and Circuit morph into each other); Lobule (honeycomb from the model: sinusoids, stellate cells, collagen, congestion); Sinusoid (one wall up close, the lymph it makes) |
| **Figure** | Organs; every drawn vessel by topology ID, arteries included; collaterals C2 to C9 opening by flow; varices and their growth; ascites; spleen size; clots and cavernoma; shunts (TIPS, DIPS, portocaval, DSRS, mesocaval, meso-Rex); catheter and balloon; endoscopic bands; bleeding; dye; moving blood; chevrons; labels and callouts; the figure key |
| **Colour lenses** | Pressure, change, congestion (heat), pressure drop, flow volume, velocity, flow direction, blood origin, first pass, since, oxygen, system (L cycles) |
| **Blood menu** | Moving blood on or off; what the figure shows: pressure values, potential collaterals, organ names |
| **Action cards** | Tap any vessel or organ: narrow or clot it, make the liver cirrhotic, band varices, inject dye, start a shunt, zoom into the lobule; keys 1 to 9 |
| **Treat (T)** | Drugs (propranolol, carvedilol, terlipressin, octreotide), fluids and blood (infuse, haemorrhage), procedures (banding, paracentesis, TIPS with the stent tile editor, BRTO, balloons, shunts); a *Changes* row; on a sideways phone, Changes as its own page |
| **Tests (I)** | Pressure along the circuit or over time; HVPG with the monitor traces; Doppler (MPV spectrum style everywhere, probe); endoscopy (scope view and varix wall mechanics); EUS-PPG; ascites, paracentesis, SAAG; FibroScan (liver and spleen stiffness); *Readouts* with every number and a **Why?** for each |
| **Model controls** | One timeline with two clocks; History of every change and event, with a way back to each; Compare (P) freezes a moment against the live model; Why? causal traces |
| **Presenter** | 42 decks, 512 slides. Teaching card (kicker, title, line, vignette, equation, ask, case question, what-if, caveat, terms) and data card (336 slides use tiles; the rest a chart or a live instrument). Tool kinds in slides: criteria 50, flowtime 43, doppler 38, profile 33, path 33, curve 25, trial 18, flows 12, hvpg 11, fibroscan 8, evgraph 8, lumen 7, trace 5, reading 4, menu 4, vitals 3, wall 2, fluid 2, plane, forest, abdomen. Lenses on slides, 28 camera names (liver 128, fit 118, portal 51, varices 31, route 28, lobule shots, hepatic, fundus, bleed, splenic, heart, sinusoid, gej, dips, spleen, gut, wall, tips, series, rectum, collaterals). Outline slide, quick check, name tab, handout, Print notes. Your scripts: build from the live model, share as link or file, import (with safety checks). Clicker, arrows, swipe. Trials pane (21 trials). Summary tables |
| **Charts** | Chart looks: pressure ladder, profile, path, flowtime, curve, criteria, trial, forest, flows, lumen, plane, fluid, SAAG, shift, stiffness, stent, timeline, small multiples |
| **Settings** | Send feedback, Search, Help; Appearance (Light, Soft, Dark, Navy, Black, System); Display (Blur effect, Figure detail, Sharp while moving, Keyboard shortcuts); Advanced physiology; frame-rate and frame-breakdown counters; Reset everything |
| **Search and keys** | Search everything by name (Ctrl or ⌘ K); **?** lists every shortcut; A, L, T, I, P, 1 to 9 and the rest |
| **Platform** | Deep links (`?preset=`, `?script=`); installable PWA, offline; no trackers; dated content; keyboard access to every structure (Tab through vessels, arrows along the flow); a live one-line description of the patient; reduced motion; colour always with a second cue |
| **Debug (preview only)** | `?perf`, `?debug` card gallery and Sweep, bug packets, screen report, `?watch`, `?offgpu` |
| **Guides** | Two tester start guides (Letter and iPhone PDFs) |

## 2. How parity is checked

Three checks, all fast, none headless, none on Actions.

1. **The inventory test.** A script in the 2D repo writes `parity/inventory.json`: every deck and slide id, every tool kind, data kind,
   lens and camera name used, every preset, every Settings row, every shortcut, every control label (`aria-label`), every card specimen in the
   2D gallery catalog, every Treat and Tests item, and every device and callout on the figure (section 3.1). The 3D repo has a test that reads it and lists what the 3D app does not have yet, with a
   score ("x of y"). Each batch owns its rows and is done when its rows are all there. The score goes in every push report.
2. **Words.** Every user-facing string in the 3D app comes from the 2D source (deck files copied by script; UI strings in one table generated
   from the 2D app's). A test fails on any string that differs. Clinical wording rules (Baveno VIII, AASLD) and the 2D clinical-wording lint
   run on the 3D strings too.
3. **Numbers.** Both apps run the same hales-engine copy, so numbers match when the inputs match. The test replays each slide's preset and
   actions in the engine (as `npm run model -- --deck <id> --slide <n> --json` does in the 2D repo) and compares every number the 3D slide
   shows with the 2D output. Free play: the same check for every preset and each Treat action.
4. **Behaviour** (on your devices). Each batch ends with a short device checklist (the same taps on the 2D and 3D apps give the same result),
   which you or a play-test thread on your Mac runs.

## 3. Batches

Each batch is one Sonnet thread (high effort) on its own `claude/<name>-preview` branch, owning only its folders, merging into the 3D app's
integration branch (owned by the shell thread). Every batch follows the look spec, the one-clock rule and the done bar of the slice.

| Batch | Owns (folders in `portal-pressure-sim-3d`) | Needs | Parity rows it closes |
|---|---|---|---|
| **S1 Shell and engine** (running) | scaffold, `src/clock/`, `src/engine/`, `src/looks/`, deploy, integration branch | | engine numbers, looks |
| **S2 Scene** (running) | `src/scene/` (materials, anatomy placeholder, camera, catheter, highlight) | S1 | slice figure |
| **S3 Cards and presenter** (running) | `src/ui/cards/`, `wallet/`, `deck/`, `tags/` | S1 | slice cards, HVPG deck |
| **B1 Shell parity** | `src/ui/shell/` (top bar, play bar, zoom group, bottom bar on phones, sheets that rise and halve), `src/ui/settings/`, `src/ui/search/`, `src/ui/keys/`, `src/pwa/`, deep links | S1, S3 | top bar, play bar, all Settings rows, search, every shortcut, deep links, offline |
| **B2 Patients and model controls** | `src/ui/patients/`, `src/ui/timeline/`, `src/ui/history/`, `src/ui/compare/`, `src/ui/why/` | S1, B1 | 20 presets in groups, two clocks and jumps, History and go back, Compare, Why? |
| **B3 Vessels, blood and lenses** | `src/scene/vessels/`, `src/scene/blood/`, `src/scene/lenses/` | S2 | every drawn vessel by ID (arteries included), moving blood, chevrons (flow marks A), 12 colour lenses, the Blood menu's figure options, the colour legend |
| **B4 Organs, disease and collaterals** | `src/scene/organs/`, `src/scene/disease/` (clots, cavernoma, varices, ascites, spleen, cirrhotic liver, bleeding, dye) | S2, B3 | every disease state of the 20 presets as the 2D figure shows it |
| **B5 Procedures, catheters and balloons** | `src/scene/procedures/` (TIPS and DIPS with the stent geometry rules, surgical shunts, meso-Rex), `src/scene/devices/catheters/` and `src/scene/devices/balloons/` (every catheter, wire, needle and balloon in section 3.1), the stent tile editor in `src/ui/treat/stent/` | B3, B4 | every procedure, catheter and balloon on the figure (section 3.1) |
| **B6 Labels, callouts and figure key** | `src/scene/labels/` (one solver: labels never under cards, fade between spots), `src/scene/callouts/` (every callout kind in section 3.1), figure key, a11y vessel walk (Tab, arrows along the flow) | S2, S3 | every label, callout and the key; keyboard walk |
| **B7 Circuit view and morph** | `src/scene/circuit/` | B3 | Circuit, upright turn, Anatomy to Circuit morph (in 3D the tubes fly from the body onto the flat map) |
| **B8 Lobule and sinusoid** | `src/scene/lobule/`, `src/scene/sinusoid/` | S2 | honeycomb, sinusoids, stellate cells, collagen, congestion, lymph chevrons on ducts, the wedge amber spread, the lobule camera shots |
| **B9 Action cards and Treat** | `src/ui/action/`, `src/ui/treat/` (not `stent/`) | B1, B3 | tap-anything cards with keys 1 to 9; drugs, fluids, blood, procedures, the Changes row and its phone page |
| **B10 Charts** | `src/ui/charts/` (every chart look, drawn on the GPU in its own small canvas or as part of the scene) | S1, S3 | ladder, profile, path, flowtime, curve, criteria, trial, forest, flows, lumen, plane, fluid, SAAG, shift, stiffness, stent, timeline, small multiples |
| **B11 Instruments and probes** | `src/ui/tests/`, `src/scene/devices/probes/`, `src/scene/devices/scopes/`, `src/scene/scope/` (the views from inside) | B3, B10 | Tests: pressure, HVPG and monitor traces, Doppler, endoscopy scope (a camera inside the oesophagus) and wall mechanics, EUS-PPG, ascites and paracentesis, FibroScan, Readouts with Why? |
| **B12 Presenter features** | `src/ui/deck/` beyond the slice (outline, quick check, name tab, handout, Print notes, scripts builder, share and import, trials pane, summary tables, clicker) | S3, B10 | every presenter feature |
| **B13a to c Deck port** | `src/decks/` and each deck's 3D shots (`src/scene/camera/shots/`), split three ways: A to G, H to P, R to W | B3 to B12 for the features each deck uses | all 42 decks and 512 slides: words, numbers and shots |
| **B14 Accessibility and debug** | `src/ui/a11y/`, `src/ui/debug/` (`?perf` exists from S1; add the card gallery, Sweep, screen report, bug packet) | B1, S3 | live description, reduced motion, colour plus second cue, debug tools |
| **B15 Guides** | `guides/` | B1, B12 | both tester PDFs for the 3D site |

### 3.1 Devices and callouts on the figure

Everything the 2D app draws on the figure for a test or procedure, each with its batch, its inventory row and whether the artist models it.
Each one must appear, move and read exactly as in 2D (same placement rules, same states, same pressure pills), and each is scored in the
inventory as `device:<id>` or `callout:<id>`.

| Item | In the 2D app | Batch | Inventory row | 3D model |
|---|---|---|---|---|
| Doppler ultrasound probe on the skin, with its beam and sample gate | `dop-probe.js`, `stage-doppler.js` | B11 | `device:us-probe` | Artist: curvilinear probe head |
| FibroScan probe on the right flank, with its measured region | `fibroscan.js`, `fibroscan-gl.js` | B11 | `device:fibroscan-probe` | Artist: FibroScan probe |
| Endoscope on the figure (through the mouth to the oesophagus, stomach and fundus), and the view from its tip | `stage-scope.js`, `scope*.js`, `endo-*.js` | B11 | `device:endoscope`, `view:scope` | Shaft is a curve we build; artist: scope tip with lens and light |
| Endoscopic band ligation: cap, bands on varices, banded varix settling | `band-ring.js`, `band-ease.js`, `band-settle.js`, `rx-bands.js` | B11 (scope) and B5 (bands on the figure) | `device:band-ligator`, `device:band` | Artist: ligator cap and band ring |
| EUS scope with the needle into the portal vein and hepatic vein (EUS-PPG) | `eus-scope.js`, `eus-ppg.js` | B11 | `device:eus-scope`, `device:eus-needle` | Artist: echoendoscope tip; needle is a curve |
| HVPG balloon catheter through the jugular, right atrium and IVC into a hepatic vein: route, free, wedge, result, blocked (Budd–Chiari) | `stage-cath.js`, `cath-*.js`, `hvpg-balloon.js` | B5 | `device:hvpg-catheter` (5 states) | Shaft is a curve; artist: catheter tip and balloon (deflated and inflated shapes) |
| IR TIPS kit: sheath, needle pass from hepatic vein to portal vein, wire, balloon dilation, stent | `ir-tips.js`, `tips-figure.js`, `stent-*.js` | B5 | `device:tips-sheath`, `device:tips-needle`, `device:wire`, `device:tips-balloon`, `device:stent` | Shafts and wire are curves; stent mesh is built by us from the stent geometry rules; artist: needle tip and balloon |
| Balloon tamponade: oesophageal and gastric balloons | `balloon-eso.js`, `balloon-gas.js`, `stage-balloon.js` | B5 | `device:balloon-eso`, `device:balloon-gas` | Artist: tube and both balloons, inflate as a shape key |
| BRTO balloon in the gastrorenal shunt | treat item `brto` | B5 | `device:brto-balloon` | Artist: balloon catheter tip |
| Dye injection and its spread | `dye-*.js` | B4 | `device:dye` | No model (a flow effect) |
| Pressure pills on catheters and needles | `cath-pill.js`, `cath-leads.js` | B6 | `callout:cath-pill` | No model (tags) |
| Slide callouts (a label with a leader to a place on the figure) | `callout*.js`, `ext-callouts.js` | B6 | `callout:slide` | No model |
| Monitor trace callouts (WHVP − FHVP on the figure and the monitor) | `trace-callouts.js` | B6 with B11 | `callout:trace` | No model |
| Shunt callout (small, no backing) | `ext-callouts.js` | B6 | `callout:shunt` | No model |
| Waist bracket and mm per section on the stent | `stent-waist.js`, `ext-stent.js` | B6 with B5 | `callout:stent` | No model |

Rules for all of them in 3D: shafts, wires and needles are curves built at runtime so they follow the vessels exactly; device heads are small
low-poly models in the same cel shading and ink; devices are drawn in front of the anatomy they sit in (the same "vessels in front of bowel" rule
as 2D); every callout is a DOM tag placed by the one clock, fading between spots, never under a card.

## 4. Order

| Wave | Starts when | Batches (at most 6 at once, so merges stay calm) |
|---|---|---|
| 0 | Now | S1, S2, S3 (the slice) |
| 1 | The slice is on your devices and you are happy with it | B1, B3, B6, B8, B10 |
| 2 | B1 and B3 are merged | B2, B4, B7, B9, B11 |
| 3 | B4 and B10 are merged | B5, B12, B14 |
| 4 | The features a deck group needs are merged | B13a, B13b, B13c, B15 |

Rough size: each batch is about 3 to 8 thread-days; with five or six threads at once, parity in about 6 to 9 weeks of calendar time, plus the
artist's model (`artist-brief/artist-brief.md`), which slots in view by view whenever it arrives. An estimate, not a measurement.

The slice's done bar (60 fps on your iPhone, no glitches, text never shrinks, nothing scrolls in a card) holds for every batch. A batch is done
when its inventory rows are all present, words and numbers tests pass, and you have passed its device checklist.

## 5. Rules every batch follows

- Read `docs/look-and-feel.md`, `docs/slice-plan.md` and this plan first.
- Words come from the 2D source, never retyped. Numbers come from the engine, never typed.
- One frame loop; DOM moves only by transform and opacity; render on demand.
- No headless runs, no Actions minutes, fast unit tests only, push report on every push (hash, what changed, how to test, what could still be
  wrong, inventory score).
- Fix at the root, check the whole app for the same bug, add a test.
- The 2D app keeps working throughout; 3D work never edits the 2D repo except the inventory script.

## 6. Where 1:1 does not translate (your calls)

| 2D feature | In 3D | Recommendation |
|---|---|---|
| Settings › Blur effect (GPU frosted glass) | Cards are Soft lift web cards, no blur | Keep the row and make it switch glass on for Mac and iPad later; off by default on iPhone |
| Settings › Figure detail (megapixels) | Becomes the pixel-ratio cap | Keep the row, same names, mapped to 1x, 1.5x, 2x |
| Settings › Sharp while moving | Keep full resolution during motion | Keep as is |
| Frame-breakdown counters | `?perf` | Keep both |
| No-WebGL fallback (SVG vessels) | 3D needs WebGL2 | Show a short message with a link to the 2D app |
| Anatomy figure pan and zoom | Camera orbit (limited) and zoom | Same gestures; orbit only within ±25° |
| Off-GPU scanner rule | Cards are web text by your 19 Nov decision | Replace with the one-clock and per-frame-DOM rules |

## 7. Before launching

1. Merge PR #1 on the 3D repo (docs) or let the shell thread take it into its integration branch.
2. Add the inventory script to the 2D repo (part of B1's first push, read-only on the 2D app).
3. Launch wave 1 only after the slice passes your device test, so the batches build on a look you have approved.
