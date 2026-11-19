# Finding and fixing what you see

How to report something that looks wrong, what the app can tell about itself, and what an agent does with your report. Written for Mohammad first (what to press, what comes back, what the tools can and cannot see); the last section is for agents. This is the 3D app's copy of the 2D app's `docs/debug.md`: the same report formats, the same rules and numbers where the 3D app has the same cards, and the places where it does not yet are named in section 11.

Everything here is on the preview copy (`/preview/`) or a local run. The live site has only Send feedback (section 12) and `?perf`.

## 1. The short version

1. Open `/preview/?debug` on the device where you saw the problem. (The old `?gallery` still works.)
2. Use the app the way you were using it when it went wrong.
3. Press **Report** on the bar at the top (on a phone you can also hold the orange PREVIEW pill for a second, or open Settings > What's wrong here?; on a Mac, Option+Shift+?). A sheet opens, says how many problems the app's own checks found, and takes a few words ("what did you see?").
4. Press **Copy packet** and paste it into the thread. That is all. The agent starts from your report, not from a guess.

## 2. What the app knows about itself

The app works out every card, label, number and camera move before the graphics card draws it, so it can describe its own screen in words: where each card is, how big its lettering is, what each label says and where it stands, which number is on which tile, what colour each vessel should be and why. It cannot see the final pixels (colour after blending, how it looks to your eye), so a report says "the card runs 9 px past its edge", never "it looks ugly".

## 3. The Report button

A report holds:

- **The screen in words:** every card and label with its place and size, the numbers on the screen, the camera's state (its turn in degrees, zoom and pan).
- **The rules that failed**, each with what is wrong, where, why it matters, and the file that owns the behaviour.
- **The last 10 seconds of motion.** The motion recorder is on by default on `?debug` (elsewhere it needs `?watch`). It is what lets a report say "this card appeared in one frame" instead of "I did not see anything".
- **A link that rebuilds the moment.** The patient, the talk and slide, the look, the figure's switches, the view, the vessel you had picked, **the camera where your fingers left it** and **the sliders you had moved** (only what differs from the patient's own settings, so the link stays short). Open it on a preview page and the app puts all of it back. In a talk the slide sets the patient's settings itself, so the sliders are not part of a talk's link.
- **Memory and errors:** the page's own GPU memory estimate, its highest, and any caught errors.

From an iPhone or iPad: hold the PREVIEW pill, or open Settings > What's wrong here? From a Mac: Option+Shift+?. Copy packet puts one block of text on the clipboard; paste it into the thread. If a copy is refused (Safari sometimes needs a tap), the sheet shows the text to copy by hand.

## 4. The Phone check and the Full check

On `?debug`, Tools > **Phone check** (or open `/preview/?debug=check`) walks the views, the sheets, the HVPG slides, the patients and the first slide of each talk. **Full check** (`?debug=full`, or Tools > Full check) adds every slide of the first three talks and reads the memory estimate after each step. Put the phone down for a few minutes. Each step settles, the card-fit and self-check rules run, and the walk ends with **one report** and a Copy button.

If the browser ends the tab, the walk is written down after every step: open the same address again and it **resumes after the last step** and says so in the report (`?fresh=1` forgets it). The report also prints the **kill ledger**: what the page's memory estimate stood at each time the browser ended a tab on this device (the page writes its last moment once a second while it runs, and the next page reads it), so the memory limit can be set from facts. The ledger is local only (`pps.kills` in this browser's storage); nothing is sent.

## 5. The rules, in plain words

Each rule reads the screen as the app itself describes it. The tables are generated from the code: `npm run debug -- doc` after adding a rule, a limit or a flag, and a test fails until it is done.

<!-- generated:rules -->
**Cards fit the screen and its edges** (9)

| Rule | Looks at | Why | Owner file |
|---|---|---|---|
| `fit-scroll` | the screen now | Nothing scrolls inside a card: no card is taller than the screen and its margin; a tall card splits into pages (owner, 18 Nov 20:33 ET) | `src/ui/cards/CardFrame.tsx` |
| `fit-sideways` | the screen now | Nothing inside a card scrolls sideways: a phone swipe would open the next card (17 Nov) | `src/ui/cards/CardFrame.tsx` |
| `fit-small` | the screen now | Card lettering is at least 12 px (17 Nov, ffa2bfba) | `src/ui/DeckUi.tsx` |
| `fit-ratio` | the screen now | A slide title is at least 1.4 times the body (17 Nov, 0dcbf220), 1.33 on a phone where the words need the space (19 Nov) | `src/ui/DeckUi.tsx` |
| `fit-shrink` | the screen now | The teaching card's body text never shrinks to fit (17 Nov, 2a8217e3): the figure and the top card yield instead | `src/ui/DeckUi.tsx` |
| `fit-styled` | the screen now | A card is never shown before it is fully loaded and styled: no text before its fonts (17 Nov 22:01) | `src/ui/cards/CardFrame.tsx` |
| `fit-off` | the screen now | Cards must fit: a card standing in place is whole on the screen | `src/ui/layout/plan.ts` |
| `edge-cutoff` | the screen now | The last line of a card is never cut by the card's own edge (owner, 19 Nov: the words card was clipped on many slides and no check named it) | `src/ui/cards/CardFrame.tsx` |
| `edge-off` | the screen now | Words never reach past the screen (19 Nov) | `src/ui/cards/CardFrame.tsx` |

**Nothing pops, flashes or sticks** (8)

| Rule | Looks at | Why | Owner file |
|---|---|---|---|
| `flash` | the last seconds of motion | Nothing may blink: a card or label that is shown, gone and back within a quarter second is a glitch (17 Nov: nothing pops in or out) | `src/scene/labels/fade.ts` |
| `stuck-mid` | the last seconds of motion | A card or label held part way through a fade is a fade that never finished | `src/ui/cards/CardFrame.tsx` |
| `label-slide` | the last seconds of motion | Labels fade between spots, never slide or jump (18 Nov) | `src/scene/labels/solver.ts` |
| `label-dim-alpha` | the last seconds of motion | A dimmed label rests at one alpha, DIM_ALPHA (scene/labels/alpha.ts), in one place | `src/scene/labels/alpha.ts` |
| `card-pop` | the last seconds of motion | Nothing pops in or out: a card goes from gone to shown by a fade, never in one frame (17 Nov 22:01: appearance and disappearance of anything must never glitch) | `src/ui/cards/CardFrame.tsx` |
| `card-size-snap` | the last seconds of motion | Cards size exactly to their content with a glide, never a snap (17 Nov) | `src/ui/cards/CardFrame.tsx` |
| `card-empty` | the last seconds of motion | A card is never shown with nothing in it (17 Nov 22:01) | `src/ui/cards/CardLayer.tsx` |
| `camera-straight` | the last seconds of motion | The camera zooms straight from any view to any view: one way, one line, no stop at the fit (18 Nov) | `src/scene/camera/rig.ts` |

**Labels stay clear and fade in place** (3)

| Rule | Looks at | Why | Owner file |
|---|---|---|---|
| `label-under-card` | the screen now | Labels stay clear of every open card (owner, 17 Nov 2026): a card never hides a name | `src/scene/labels/solver.ts` |
| `label-off-screen` | the screen now | A label is whole on the stage: none stands past its edge | `src/scene/labels/solver.ts` |
| `label-overlap` | the screen now | Two labels never lie over each other: the solver keeps a ring of spots so each can be read | `src/scene/labels/solver.ts` |

**Numbers, charts and pressure colours agree** (2)

| Rule | Looks at | Why | Owner file |
|---|---|---|---|
| `figure-engine` | the screen now | The model is running: a crashed or silent engine leaves every number on the screen stale | `src/engine/boot.ts` |
| `pressure-colour` | the screen now | A pressure wears the colour its cut-offs give the number shown: HVPG amber over 5, red 10; PPG amber 6, red 12 | `src/engine/hales/portal/pressure-cuts.js` |

**Everyone can use it** (5)

| Rule | Looks at | Why | Owner file |
|---|---|---|---|
| `a11y-figure-named` | the screen now | The figure has an accessible name and a live one-line description of the patient (WCAG 1.1.1; docs/accessibility.md) | `src/ui/a11y/describe.ts` |
| `a11y-live-region` | the screen now | Announcements (a patient loaded, a slide changed) go through one polite live region, #live | `src/ui/a11y/mount.ts` |
| `a11y-lang` | the screen now | The document declares its language (WCAG 3.1.1) | `index.html` |
| `a11y-control-name` | the screen now | Every control has a name: an icon-only button carries an aria-label (WCAG 4.1.2) | `src/ui/shell/TopBar.tsx` |
| `a11y-colour-cue` | the screen now | Colour is never the only cue: every value shown by colour also has a number, an arrow, a dash pattern or a word (WCAG 1.4.1; docs/accessibility.md) | `src/ui/debug/screen/raw.ts` |

**Words follow US and Baveno VIII usage** (5)

| Rule | Looks at | Why | Owner file |
|---|---|---|---|
| `wording-em-dash` | the screen now | No em-dash in learner text (owner) | `src/decks/` |
| `wording-older-baveno` | the screen now | The guideline is Baveno VIII only, never VII (owner, 18 Nov 2026) | `src/decks/` |
| `wording-british` | the screen now | American spelling (US physicians) | `src/decks/` |
| `wording-no-number` | the screen now | A value that was never worked out never reaches the page (production) | `src/decks/` |
| `wording-open-token` | the screen now | A {token} the page did not fill never reaches the page (production) | `src/decks/` |
<!-- /generated -->

The numbers behind the rules are the owner's standing numbers, each with its date and exceptions. A judge imports its number from `src/ui/debug/limits.ts`; the words in a finding are made from the same number, so they cannot disagree.

<!-- generated:limits -->
| Standing number | Value | Since | What it holds | Exceptions |
|---|---|---|---|---|
| `words-floor` | 12 px | 17 Nov 2026 | Lettering on a card is never under this on the screen (data-card text, ffa2bfba). | none (the wallet replaced the Shuffle, 19 Nov 2026) |
| `title-ratio` | 1.4 x the body | 17 Nov 2026 | A slide title is at least this many times its words (0dcbf220). | A phone's slide: 1.33 when the words need the space (19 Nov 2026). |
| `body-never-shrinks` | 0.3 px under the role size | 17 Nov 2026 | The teaching card's body text never shrinks to fit (2a8217e3): the figure and the top card yield instead. | none |
| `label-dim` | 0.65 alpha | 16 Nov 2026 | Dim labels step back to one value everywhere (scene/labels/alpha.ts). | none |
| `blank-glass` | 24 px | 18 Nov 2026 | A card stands no more empty glass than this above its first line or below its last. | none |
| `text-contrast` | 4.5 : 1 | 11 Nov 2026 | Every text colour measures at least this against every surface it sits on, in every look (WCAG 2.2 AA). | Faint potential-collateral ghosts are decorative until switched on (docs/accessibility.md). |
<!-- /generated -->

## 6. Reading a report

- **fail** is a rule the screen breaks now. **warn** is something to look at that may be fine (a step near the memory limit). **note** is information.
- "The report shows" means a rule read it from the app's own records. "I saw" means a person looked. The two are different evidence; an agent should say which.
- A finding that says **device only** is one a replay cannot see (Safari layout, a real GPU, memory, timing): the agent fixes it from the code and asks you to press Report again after the fix.
- "**0 motion findings**" means no rule fired on what the recorder saw. The recorder has not yet been run on a real device, so it does not yet mean nothing popped.
- Every tool ends with the same report block (`-----BEGIN REPORT JSON-----`), in the 2D app's format. An agent reads any of them the same way (`npm run debug -- report show`), and can compare two (say, your Full check and a later one) to show what a fix changed. A report from the 2D app and one from the 3D app read and compare alike.

## 7. The debug page

`/preview/?debug` is the real app with a small bar on top. **Browse** lists every view, sheet, slide (by talk) and patient the app has; a tap opens the real thing the way the app opens it, and ◀ ▶ (or `[` and `]`) step through the list. **Tools** holds the look (Light, Soft, Dark, Navy, Black), Freeze (pause the model), Shoot (the bar away for a picture; Esc brings it back), Copy link (the state link of section 3), Check (the rules on the screen in front of you), the Phone and Full checks, **Sweep** and the benches.

**Sweep** opens each specimen in each look you name (`?debug&sweep=slide:hvpg&look=light,dark`, or all five looks with one tap) and ends in one report that names what failed to open, what did not settle and what each rule found. The 2D app's `affected` (the specimens a change touches) is not ported: it needs the 2D app's file-to-card table, so a Sweep here is named by hand.

**The device frame**, `/preview/?debug=frame` (or `&device=iphone|iphone-landscape|ipad|ipad-portrait|mac`): an outer page that does not start the app and holds it in **one** iframe at that device's size, so the app inside lays itself out as that device does. It is a layout preview, not a phone: hover and touch rules, the pixel ratio and the engine are this computer's. One frame at a time (WebKit keeps about 16 WebGL contexts per page). The Turn button holds the device the other way; the address follows, so a copied link reopens the same device.

## 8. The benches

Under Tools > Benches: **Looks table** (contrast of every look's text and signal colours), **Words dump** (every line of words on the cards showing, with its size and role), **Camera moves** (view to view, each judged by the motion rules for one straight move), **Memory loop** (open a talk and leave it ten times; a leak shows as a climb), **Looks walk**, **Model table** (each preset's pressures after a second) and **Diagnostics switches** (frame rate and frame breakdown). The 2D app's Slow motion, Procedures, Glyph atlas and `?lap` benches are not in the 3D app yet.

## 9. Speed and heat

FPS work is parked in the 3D app (owner's call). `?perf` on any address (the live site too) shows the clock's frame times, the slowest frames and who asked for them; **Copy** puts them on the clipboard. Settings > Diagnostics has Show frame rate and Show frame breakdown. These are measurements, not a finding list.

## 10. What an agent does with your report

1. Reads it (`npm run debug -- packet show <file>`): did it arrive whole, what failed, in what state. `npm run debug -- packet link <address>` shows what a state link puts back.
2. Decides from the code, in Node, what the rule says and which file owns it. The 2D app can replay a packet in a layout-only headless run; the 3D app **does not**: no headless browser here (owner's rule), so a replay is you opening the state link on your Mac. `npm run debug -- links` prints the addresses to open.
3. If no rule named it, writes the rule first (with a test that fires and one that must not), so the next bug of its kind finds itself.
4. Fixes the cause at its owner file and checks the whole app for the same bug.
5. Asks you to press Report or run the same check again, and compares the two reports (`npm run debug -- report compare <before> <after>`: `FIXED`, `PARTLY`, `NOT-FIXED` or `REGRESSED`, with everything else that changed).
6. Adds a test from your packet so it cannot return, and posts the push with what to test and what could still be wrong.

## 11. What no tool can judge

How it looks to your eye (beauty, balance, "elegant"), colour after the glass and figure blend, Safari-only layout, real heat in your hand, real GPU speed, and the feel of a motion. These stay with you on your devices. Nothing in the 3D app has been seen on a real GPU yet: the Mac play-test comes first.

Not ported from the 2D app yet, each open work and not forgotten: replay and `compare` of a packet in a browser (by design, section 10), the `affected` specimens, the Slow motion, Procedures and Glyph atlas benches, `?lap`, `?inputs`, `?budget` and the other 2D-only switches, and the self-check rules for cards the 3D app has not built (the 3D app has 32 rules so far; `npm run debug -- rules` lists them).

## 12. For testers

On the live site, Settings > **Send feedback** opens an email draft in the tester's own mail app with the build, the device, the screen size, **a link back to this exact view** (the camera and sliders too) and a few lines on what the app's own checks found on the screen (at most 1,800 characters; the whole link is capped at 6,000 characters so any mail app takes it; the details are never cut, the short report is cut first). A toast then offers **Copy the full report**, which puts the whole report on the clipboard to paste under the message. Nothing is sent by the app: the person sends the email. The address comes from the build (`VITE_FEEDBACK_EMAIL`), never from the source, so the row is there only when the build has one.

## 13. The switches (reference)

Address flags, where each works (live site, or the preview and a local run only), and what it does. Generated from the code (`src/ui/debug/flags.ts`); `npm run debug -- flags` prints the same.

<!-- generated:flags -->
| Flag | Where | Group | What it does |
|---|---|---|---|
| `?perf` | everywhere | Measure | The clock's frame panel: median, p95 and worst frame work, the frames over 20 ms with the phase and who asked for them; Copy (src/ui/perf). |
| `?watch` | preview and local run | Measure | The motion recorder (preview copy or a local run): keeps 20 seconds of camera, label and card numbers, judges them with the motion rules and shows a red dot with the findings (src/ui/debug/watch). |
| `?debug` | preview and local run | Pages | The debug page (the card gallery, with Report and Full check on its bar; the motion recorder is on by default). ?debug=check is the Phone check, ?debug=full its long walk, ?debug=frame the device frame. |
| `?gallery` | preview and local run | Pages | The old spelling of ?debug (?gallery&sweep=... runs the Sweep; the sweeps still open it so). (old spelling of ?debug) |
| `?check` | preview and local run | Pages | The old spelling of ?debug=check, the Phone check (?check=full for the long walk). (old spelling of ?debug=check) |
| `?sweep` | preview and local run | Pages | The debug page: run the Sweep over these specimens (a list, or affected). |
| `?only` | everywhere | Pages | The Phone check or the Sweep: just these journeys or specimens (comma list). |
| `?steps` | everywhere | Pages | The Phone check: steps=0 leaves out the per-step rows. |
| `?fresh` | everywhere | Pages | The Phone check: fresh=1 forgets a walk the browser was part way through. |
| `?parity` | everywhere | Pages | The build's progress page: how much of the 2D app the 3D app has, per batch and area (src/parity). |
| `?charts` | everywhere | Pages | The charts gallery (src/ui/charts/gallery). |
| `?script` | everywhere | Open | Open this deck (with ?slide=N). |
| `?slide` | everywhere | Open | Open this slide of ?script. |
| `?preset` | everywhere | Open | Open this patient preset. |
| `?home` | everywhere | Open | Open Patients or Present (?home=explore\|present). |
<!-- /generated -->

## 14. For agents (appendix)

**One command:** `npm run debug` lists the verbs. Node only; nothing opens a browser.

| Verb | What it does |
|---|---|
| `rules [--family f] [--json]`, `limits`, `flags` | The registry, the standing numbers and the flags, with owners. |
| `report show\|compare <file>` | Read the report block of any tool, a bug packet or a replay; compare any two. |
| `packet show <file>`, `packet link <address>` | Read a pasted packet (refused if it changed on its way); decode a state link. |
| `links [--sweep specs] [--look a,b] [--only ids] [--base url]` | The preview addresses to open on the Mac: the debug page, the Phone and Full checks, a Sweep, each device frame, `?watch`, `?perf`, `?parity`, `?charts`. Paste them into the push message. |
| `test` | The debug, accessibility and feedback unit tests (about a second). |
| `scan` | The node-only lint (`scripts/lint.mjs`). |
| `doc [--check]` | Regenerate (or check) the generated tables of this file. |

**Allowed run types (the owner's rules):** Node (unit tests, `npm run debug`); the owner's own devices through the preview, play-tests only on his Mac in the Claude desktop app's browser and only when asked. Never GitHub Actions runners or minutes for a check or a sweep. No headless browser, no pictures or timing from software GL.

**Adding things.** A **rule**: `registerRule({ id, owner, why, family, kind, check })` in `src/ui/debug/selfcheck/`, one import line in `selfcheck/plugins.ts`, a test that fires and one that must not (`tests/debug-helpers.ts` makes a page); runners select by family and never import a judge; a new family goes into `GROUPS` in `scripts/debug-doc.mjs` (a test fails until it does). A **reader** (a part of the screen report): `registerReader` in `src/ui/debug/screen/`. A **limit**: `src/ui/debug/limits.ts`, never a literal in a judge. A **runner**: an adapter in `core/emit.copied.js` (copied from the 2D app) so its output is one report block. A **flag**: a row in `src/ui/debug/flags.ts`; nothing else reads the address. A **device size**: `src/ui/debug/devices.ts` (the 2D app's list). A **specimen** for a new card, sheet or view: `src/ui/debug/page/catalog.ts`.

**The 2D files that are copies.** `src/ui/debug/core/*.copied.js` are the 2D app's pure report, packet, rule-registry and screen-text files, copied by `node scripts/copy-debug-core.mjs --from <2D checkout>` (a hash manifest fails a hand edit; the 2D app is edited, then re-copied), so both apps write one report format and read each other's pastes. The 3D tools (readers, rules, recorder, page) are written here against them.

**Where the code is.** `src/ui/debug/selfcheck/` (rules), `src/ui/debug/screen/` (readers, app snapshot), `src/ui/debug/packet/` (packet, state link and its apply, sheet, trigger, the Send feedback read), `src/ui/debug/watch/` (recorder and motion rules), `src/ui/debug/kill/` (the kill ledger), `src/ui/debug/frame/` (the device frame), `src/ui/debug/page/` (the page, Check, Sweep, benches), `src/ui/a11y/` (see `docs/accessibility.md`), `scripts/debug.mjs` and `scripts/debug-doc.mjs`.
