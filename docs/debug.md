# Finding and fixing what you see

How to report something that looks wrong, what the app can tell about itself, and what an agent does with your report. Written for Mohammad first (what to press, what comes back, what the tools can and cannot see); the last section is for agents. This is the 3D app's copy of the 2D app's `docs/debug.md`: the same report formats, the same rules and numbers where the 3D app has the same cards, and the places where it does not yet are named in section 11.

Everything here is on the preview copy (`/preview/`) or a local run. The live site has only Send feedback (section 12), `?perf` and `?gl`: its build (`VITE_CHANNEL=live`) does not contain the other tools at all (`tests/live-no-debug.test.ts`).

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

### The self-test, `?audit`

One address, no AI, nothing sent anywhere (`src/ui/debug/audit`). On a Mac, `/preview/?audit` runs the app by itself in an iPhone, an iPad (both ways) and a Mac frame, one after the other (`&sizes=iphone,mac` picks the sizes and starts at once, `&depth=quick` walks three slides a talk). On an iPhone or iPad, `?audit=here` runs that screen at its real size and real GPU. It walks every view, sheet, patient (the collaterals grow, switch off and grow back) and every slide of every talk with Next, and on every step asks the whole page the same questions (`scan.ts`, `scan-judge.ts`; the report lists every check under CHECKS RUN and what no check can see under GAPS): any text, chart, picture or button cut by a clipping ancestor or the screen (a chart past its card is named by the card's title); any two runs of words over each other; anything covered by another element (`elementFromPoint` at five points); text under 12 px as drawn or short of contrast; zero-size or NaN-size things; images that failed to load. It also measures: the screen rules (fit, edge, labels); how long the step took to settle; how long each card and label took to fade in and out (under 70 ms is a snap); the watch rules (flash, pop, size snap, label slide); a mutation ledger over the whole page (`ledger.ts`) that flags any element whose opacity, place or size jumped with nothing easing it, and records every CSS animation and transition (property, planned length, easing, how it ended; under 70 ms on a visible property is flagged); frames a second, hitches over 25 ms and stalls over 50 ms; and console errors and warnings. **Copy report** is extensive: the summary on top, the checks run and the gaps, every finding grouped, an inventory of every kind of animation, and a line for EVERY step (not only the failing ones); **Copy short** is the findings and the worst few; **Copy JSON** is every step with its animation records. It cannot judge taste, and a frame's frame rates are the computer's own GPU. Keep the tab in front until it ends.

If the browser ends the tab, the walk is written down after every step: open the same address again and it **resumes after the last step** and says so in the report (`?fresh=1` forgets it). The report also prints the **kill ledger**: what the page's memory estimate stood at each time the browser ended a tab on this device (the page writes its last moment once a second while it runs, and the next page reads it), so the memory limit can be set from facts. The ledger is local only (`pps.kills` in this browser's storage); nothing is sent.

### Stop on a capture keeps everything that was finished

**Stop** on the Mac's capture (every size at once) ends in one zip with what every size had finished, and **Save zip** comes. Each frame stops at its next moment of stillness (no picture is taken of a page that was not still); a frame that has not ended 60 s after Stop is cut off. A frame sends each talk's (or case's) files as that talk ends, so a frame that crashes, hangs or is cut off still gives every talk it had finished; the README says which size did not finish and why. The same holds for the promotion pictures. `tests/capture-stop.test.ts`.

### A capture survives a crashed page: Recover last capture

Every picture is written to the device's own storage (IndexedDB) as its talk (or case) ends, in the Mac's capture, in `?audit=here` and in `?promotion` (one store for all three: `capture-store.ts`, no in-memory exception; the promotion page frames each picture as its talk ends and writes only the finished JPEG); the page keeps only the names and each frame lets go of its bytes once they are sent. If the browser ends the page (Safari did, 26 Nov, after a whole audit and before the zip was saved), open the capture page again: **Recover last capture** shows what is there (files, size, build, how it ended). **Recover last capture** offers the run for saving the way a finished run is (next section); **Discard** lets it go. A run that was saved is not offered again; the next run keeps the one before it only if that was not saved. A browser that gives the page no storage (a private window) keeps working in memory, and the README says a crash would lose it. `tests/capture-store.test.ts`, `tests/capture-deliver.test.ts`.

### Saving a big capture: no single huge zip

Making one Blob of a whole audit's zip is what ran Safari out of memory, so no page does it (`capture-deliver.ts`, one delivery for the Mac's capture, `?audit=here`, `?promotion` and Recover):

- **Chrome or Edge** (a browser with the save dialog): **Save zip** opens the dialog in your tap and streams the zip into the file you pick one picture at a time, straight from storage (`zipWrite`): no Blob of it exists. One zip, unless the capture nears a zip's 4 GB.
- **Safari** (no save dialog): the run is planned into zips of at most 200 MB each, whole folders kept together (a size, then a talk or a case; `planParts` in `capture-parts.ts`; the README and the manifest are in every part), and the page says so: "612 MB in all, so it comes as 4 zips". One part is made from storage at a time and offered with its own **Save part 1 of 4** (the share sheet or download has to happen inside the tap, so the part is made before the button says Save); once saved it is let go and the next is made. Names: `...-part2of4.zip`. The run counts as saved only when every part is.
- A capture under 200 MB is one zip on both, as before.

### Picked slides go straight there

A capture of **Random 5, 10, 25** or ticked slides (and every `?promotion` picture) goes straight to each picked slide, as an opened link does, and never presses Next through the slides before it. The audit's pictures stand on the slide's end state, the one a person is left on after the last Next within it (its last beat and page, a procedure done, the readings taken) and wait, in real time, for the page to be still before the picture. The promotion pictures stand on the slide as it opens. This is the tool's own hand: the app's shape changes still ease (`src/ui/debug/audit/capture-jump.ts`, `tests/capture-jump.test.ts`).

### Every case, played, `?audit&cases`

The capture can play the model patients' cases (Histories, "Play the case") and photograph every stop, through the same pipeline as the slides (`src/ui/debug/audit/capture-cases.ts`; the settling, the picture and the zip are shared with `capture-all.ts`, in `capture-settle.ts` and `capture-shot.ts`).

1. On a Mac, `/preview/?audit` shows **What to take**: **Slides**, **Every case** or **Both**. Choose sizes, then **Capture**. The address does it too: `?audit=frames&capture=1&sizes=iphone,ipad-portrait,mac&cases=all` (`&slides=1` adds the slides; `cases=hist-bleed,hist-tips` names some; `looks=0` leaves out the look-closer pictures). On an iPhone or iPad, `?audit=here` has the same row (`?audit=here&cases=all` starts on it).
2. Each case opens as the patient came and plays with Continue, stop to stop (the days run, the camera sets off, the figure eases onto the stop's model). At every stop, once the camera, the cards and the model are still: the figure with the stop card and the case bar; on a phone the sheet pulled up too; and each **Look closer here** pressed (a Tests card or a view), taken, and put back.
3. **Save zip**: a folder a size, and in it `cases/<NN-id>/` a case (`NN-dayDDD-<stop>.jpg` with its `.json`, `-pulled-up`, `-lookNN-<label>`, and `00-contact-sheet.png`), `cases/manifest.json` (every case, stop, picture, and what was found) and `cases/README.txt`. The zip's top has `cases-manifest.json`, every size's manifest together.

What the pass itself judges at each stop: the stop card is up with this stop's words, whole on the screen, clear of the case bar; the model stands on the stop's day; every Look closer button opens what it names. The self-test's screen rules (fit, edge, labels) are not run here; the picture is for eyes. `tests/capture-cases.test.ts`.

### The promotion pictures, `?promotion`

On a Mac, `/preview/?promotion` makes the pictures for promotion: it takes the slides you name, each settled, in the look of the finished app, and lays every one in a plain outline of a Mac, an iPhone and an iPad (upright) under the app's logo and name. It uses the same capture as `?audit` (`capture-all.ts`, the app in a frame at the device's size), so a slide is as settled as in a capture, with these differences: it goes straight to each slide you name (as an opened link does, on the slide itself, not the case card), at the page's own speed (a clock run faster can leave a card short), the PREVIEW tab and the build and debug marks are not in the picture (the © credit stays), the figure is on **Rich** for the frame only (nothing is saved to the browser), one picture a slide (no choice pictures), 2x on a Mac and an iPad and 3x on an iPhone.

1. Open `/preview/?promotion` (or give the pictures in the address: `?promotion&pick=circulation:1,lobule:4,history:hist-bleed-tips,overview:patients&sizes=mac,iphone`). The box holds the twenty proposed slides and twelve more pictures, one to a line; edit it freely. Three kinds of line:
   - `deck:number`, a slide of a talk.
   - `history:<case>[:<stop>]`, a model patient's case (Histories, Play the case) at one of its stops, counted from 1: the figure with the stop card and the case bar, whose strip is the patient's chronological timeline. With no stop it is the case's last stop, the patient as they are today with the whole course played in the strip. The case ids are the menu's (`hist-bleed`, `hist-ascites`, `hist-pvt`, `hist-bcs`, `hist-tips-narrowed`, `hist-bleed-tips`, `hist-hcv`, `hist-alcohol`, `hist-psvd`, `hist-brto`, `hist-pregnancy`, `hist-cardiac`). The case is started the way Play the case starts it and the stop is jumped to, as the bar's own buttons do.
   - `history:<case>:chart`, the same patient as they are today with the full-screen timeline chart open (History's "See as a chart"): the readings over the whole course in stacked lanes, the medicines' bars and the events. This is the one to use to show a history with graphs.
   - `history:<case>:timeline`, the patient as they are today with History's panel open at the side and the figure still shown: the case's chronological timeline, the days and what happened on each (a Mac, an iPad on its side; on a phone the panel is a sheet).
   - `overview[:<tab>]`, the app's menu open on its first screen: `overview` (the talks), `overview:patients` or `overview:histories`. (The app has no screen of its own called "overview"; this is the front door a person meets.)
   The pictures that are not slides ride in the frame's address as `extras=` (the slides stay in `pick=`; a run of extras alone takes no slide) and go through the same settle, picture, frame, Rich look and © credit as a slide (`audit/capture-promo-extra.ts`, `tests/promo-extra.test.ts`, `tests/promo-frames.test.ts`). The number counts from the first slide of the talk (1), so `lobule:9` is "10 / 12" on the presenter's counter (the title card is its first stop).
2. Choose **iPhone**, **iPad**, **Mac** or **All three**, and press **Make pictures**. Keep the tab in front (all three together run at once). When it ends, each finished picture shows below.
3. **Save zip** gives one file: a folder a size, a JPEG a slide (`03-lobule-4-cirrhosis-narrows-the-sinusoid-iphone.jpg`), and a README with the build and why each slide was chosen.

The outlines are drawn in `src/ui/debug/promo/frames.ts` from rounded shapes (no maker's artwork, logo or model name); the look is in `docs/approved/promotion.md`. The address has no email and no picture can show one: the feedback address is a build variable that the capture frame never draws.

### The stress capture, `?stress`

On any device, `/preview/?stress` (add `&go=1` to start at once, `&layouts=iphone,mac` for fewer layouts) takes about 160 pictures in one small zip, with a written report. It is built on the capture and the promotion pass, not beside them (`src/ui/debug/stress`).

1. **Start stress capture**. The page holds the app in one sized frame at a time (an iPhone, an iPad upright, a Mac) and shows only a bar: the percentage and the time left. Keep the tab in front.
2. In each layout it takes: sixteen key slides (an iPhone and an iPad take the instrument card up and tucked), and on the iPhone and the Mac three pictures inside each of ten transitions plus the menu opening (the press is played with the page's clock and every CSS animation slowed, so a picture does not move it: about 60 ms after the press, about 300 ms, then the settled end), and the menu's three tabs, one case's chart, timeline and fourth stop, and the Settings, Help and Search sheets.
3. **Save zip**: `pictures/<layout>/slides|moves|menus/` with the pictures, and at the top the audit's one zip format (docs/audit.md): `README-FIRST.md` (the rules for the fixing thread, how to read the zip, how far to trust this run), `REPORT.md` (the build, the request and seed, the counts, every finding worst first, what the checks cannot see), `sections/` (every picture with its state, a link that reopens it, each check's pass or fail and any issue, a section a talk, then transitions, then menus), `findings.json` (each finding with a stable id, F-xxxxxx) and `manifest.json` (all of it, for a tool).
4. The checks it makes itself: no card's content reaches past its foot (the capture's card record), and no card changes size after it lands (every card is measured on every frame of a transition). Notes the capture makes (a picture that was not still, one that did not load) are listed as issues.

Cannot do: the real iOS toolbar and notch (the frame's safe edges stand in), frame rate and jank, touch feel, and whether a number is right (the pictures are for that). Everything runs at the page's own speed (never the 60x clock of the all-decks capture: at 60x the app's waits end before a card's content is there, and a card was photographed 39 px tall for 229 px of content, 27 Nov), so a layout takes several minutes. The files are written to the device's own storage as they are made, so a page the browser ends keeps the run (Recover last capture). The slides, moves and menus it takes are in `stress/plan.ts`; `tests/stress-plan.test.ts` and `tests/stress-report.test.ts`.

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

**Words follow US and Baveno VIII usage** (6)

| Rule | Looks at | Why | Owner file |
|---|---|---|---|
| `wording-em-dash` | the screen now | No em-dash in learner text (owner); a lone dash standing for an empty table value is a placeholder, not text | `src/decks/` |
| `wording-older-baveno` | the screen now | The guideline is Baveno VIII only, never VII (owner, 18 Nov 2026) | `src/decks/` |
| `wording-guideline-file` | the screen now | A remark about the authoring source files ("guideline file") is no teaching (production review 28 Nov, P-24) | `src/decks/` |
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
2. Decides from the code, in Node, what the rule says and which file owns it. The 2D app can replay a packet in a layout-only headless run; the 3D app **does not**: no headless browser here (owner's rule), so a replay of the screen is you opening the state link on your Mac. `npm run debug -- links` prints the addresses to open. What the figure was asked to do in the last 60 seconds (every layer set or cleared, with the view, sheet, slide and pick inputs) rides in the packet as `state.log`, and `npm run debug -- packet replay <file>` plays it back in node: each entry with the calls the reconciler made on the scene, and the layers still on at the end.
3. If no rule named it, writes the rule first (with a test that fires and one that must not), so the next bug of its kind finds itself.
4. Fixes the cause at its owner file and checks the whole app for the same bug.
5. Asks you to press Report or run the same check again, and compares the two reports (`npm run debug -- report compare <before> <after>`: `FIXED`, `PARTLY`, `NOT-FIXED` or `REGRESSED`, with everything else that changed).
6. Adds a test from your packet so it cannot return, and posts the push with what to test and what could still be wrong.

## 11. What no tool can judge

How it looks to your eye (beauty, balance, "elegant"), colour after the glass and figure blend, Safari-only layout, real heat in your hand, real GPU speed, and the feel of a motion. These stay with you on your devices. Nothing in the 3D app has been seen on a real GPU yet: the Mac play-test comes first.

Not ported from the 2D app yet, each open work and not forgotten: replay and `compare` of a packet in a browser (by design, section 10), the `affected` specimens, the Slow motion, Procedures and Glyph atlas benches, `?lap`, `?inputs`, `?budget` and the other 2D-only switches, and the self-check rules for cards the 3D app has not built (the 3D app has 32 rules so far; `npm run debug -- rules` lists them).

## 12. For testers

On the live site, Settings > **Send feedback** opens an email draft in the tester's own mail app with the build, the device, the screen size, **a link back to this exact view** (the camera and sliders too) and a few lines on what the app's own checks found on the screen (at most 1,800 characters; the whole link is capped at 6,000 characters so any mail app takes it; the details are never cut, the short report is cut first). A toast then offers **Copy full report**, which puts the whole report on the clipboard to paste under the message. Nothing is sent by the app: the person sends the email. The address comes from the build (`VITE_FEEDBACK_EMAIL`), never from the source, so the row is there only when the build has one.

## 13. The switches (reference)

Address flags, where each works (live site, or the preview and a local run only), and what it does. Generated from the code (`src/ui/debug/flags.ts`); `npm run debug -- flags` prints the same.

<!-- generated:flags -->
| Flag | Where | Group | What it does |
|---|---|---|---|
| `?perf` | everywhere | Measure | The clock's frame panel: median, p95 and worst frame work, the frames over 20 ms with the phase and who asked for them; Copy (src/ui/perf). |
| `?joins` | preview and local run | Measure | Vessel junctions as one merged mesh (docs/junction-skin-spec.md): on by default; ?joins=old is the old overlapping tubes, mesh only the SMV-SV confluence, mesh2 every junction; debug, nomarks, noink, noheads: weld diagnostics (every one of them is a switch in the ?inspect panel, and debug opens it). |
| `?inspect` | preview and local run | Measure | The inspector (src/ui/debug/inspect; ?joins=debug opens it too): an on-screen panel that turns the figure all the way round and changes the joins mode, the junction diagnostics (debug tint, no marks, no ink), the shade mode, the flow marks, the ink, the colours and the wireframe of the tubes and of the skins, and which layers are drawn, live, with Copy. The programs carry its hooks only on a page that asks for it. |
| `?gl` | everywhere | Measure | Every shader program the app can use, compiled on this device: one line each, green or red, with the driver's own log and Copy (src/debug/gl-check.tsx). Open it once per build on the iPhone, the iPad and the Mac. |
| `?watch` | preview and local run | Measure | The motion recorder (preview copy or a local run): keeps 20 seconds of camera, label and card numbers, judges them with the motion rules and shows a red dot with the findings (src/ui/debug/watch). |
| `?debug` | preview and local run | Pages | The debug page (the card gallery, with Report and Full check on its bar; the motion recorder is on by default). ?debug=check is the Phone check, ?debug=full its long walk, ?debug=frame the device frame. |
| `?gallery` | preview and local run | Pages | The old spelling of ?debug (?gallery&sweep=... runs the Sweep; the sweeps still open it so). (old spelling of ?debug) |
| `?check` | preview and local run | Pages | The old spelling of ?debug=check, the Phone check (?check=full for the long walk). (old spelling of ?debug=check) |
| `?sweep` | preview and local run | Pages | The debug page: run the Sweep over these specimens (a list, or affected). |
| `?audit` | preview and local run | Pages | The self-test (src/ui/debug/audit): walks every view, sheet, patient and every slide of every talk by itself, measures layout spill and covered text, load times, fade lengths (snaps), frames a second, hitches and console errors, and ends in one report with Copy. Bare ?audit on a Mac runs the app in iPhone, iPad and Mac frames one after the other; ?audit=here runs this screen only (do this on the iPhone and iPad). No AI, nothing sent anywhere. |
| `?layout` | preview and local run | Pages | Layout only, no GPU (src/boot/layout-only.ts, scripts/layout-check.mjs): the page boots without WebGL, builds the scene's camera and labels but draws no figure, so a browser with no graphics card runs the app in a few seconds. Cards, labels, menus and the copyright line are real DOM and are judged by the self-test as usual; colours of the figure, shapes and shaders are NOT checked. Use with ?audit=here (npm run layout-check does). |
| `?promotion` | preview and local run | Pages | The promotion pictures on a Mac (src/ui/debug/promo, docs/debug.md): ?promotion&pick=lobule:4&sizes=mac,iphone. |
| `?stress` | preview and local run | Pages | The stress capture on any device (src/ui/debug/stress, docs/debug.md): ?stress opens a page with one Start button; it takes key slides, frames inside the main transitions, the menus and sheets in an iPhone, an iPad and a Mac layout, one frame at a time, and ends in one small zip with REPORT.md and notes. As audit=capture&stress=<layout> it is the frame. |
| `?req` | preview and local run | Pages | An audit request (src/ui/debug/request, docs/audit.md): ?stress&req=feature:junctions or ?audit=frames&capture=1&req=random:10@4471 takes the slides the request names (a talk, a slide, a feature's, or a seeded random draw) instead of the page's own set, in the sizes of its layout: parts; the line and the seed are printed in the README. Write + as %2B. |
| `?go` | preview and local run | Pages | Starts the page's run at once (?stress&go=1). |
| `?layouts` | preview and local run | Pages | The stress capture's layouts: layouts=iphone,mac (a comma list of iphone, ipad-portrait, mac); default all. |
| `?safe` | preview and local run | Pages | A framed phone's safe edges, px (safe=47,0,34,0). |
| `?promo` | preview and local run | Pages | The promotion capture frame's pixel ratio (audit=capture&promo=3). |
| `?extras` | preview and local run | Pages | The promotion frame's pictures that are not slides (extras=history:hist-bleed:3,overview:patients): a case at a stop, the menu. |
| `?sizes` | preview and local run | Pages | The self-test frames: which sizes (comma list of device ids: iphone, ipad-portrait, ipad, mac, mac-short, iphone-landscape). |
| `?parallel` | preview and local run | Pages | The self-test frames: parallel=1 runs every size at once (faster; frame rates and timings are then not valid). |
| `?depth` | preview and local run | Pages | The self-test: depth=quick walks the views, three slides of every talk and the collateral patients; depth=full (the default) walks everything. |
| `?speed` | preview and local run | Pages | The self-test: speed=N (1 to 20) runs the page's clock, its timers and every CSS animation N times faster. Layout, words, coverage, errors and settle times stay valid (page time); frame rates and GPU-bound never are (stalls are: frame gaps are measured in real time), and above 4 fade, snap and pop findings are left out too (the page draws only a frame or two of each ease). The report says what it dropped. |
| `?sequence` | preview and local run | Pages | The self-test: sequence=1 walks every talk with Next and Back one press at a time (Back and Next at each stop edge, headings, targets, tab selectors; also an element with data-audit-select counts as a selector); sequence=0 leaves it out. Default: on for depth=full, off for quick (the banner has the toggle "Walk every press"). |
| `?cases` | preview and local run | Pages | The capture plays every model patient's case with Play the case and photographs every stop (the figure with the stop card and the case bar, the card pulled up on a phone, and each Look closer here), into one folder a case with a manifest, in the same zip (src/ui/debug/audit/capture-cases.ts): ?audit=frames&capture=1&sizes=iphone,mac&cases=all (or ?audit=here&cases=all on a device; cases=hist-bleed,hist-tips names some). Cases alone unless slides=1 adds the slides. |
| `?slides` | preview and local run | Pages | The capture with cases: slides=1 takes the slides of the talks as well (before the cases), in the same zip. |
| `?looks` | preview and local run | Pages | The capture of cases: looks=0 leaves out the Look closer here pictures of each stop. |
| `?noglass` | preview and local run | Pages | The self-test: noglass=1 turns the frosted-glass blur off for the run (html[data-noglass]), so a second run shows what the glass costs the talk-open frame rate. |
| `?look` | preview and local run | Pages | The Mac look board (bare ?look; ?look&twod adds the 2D app beside each row): walks about 40 fixed states (patient, view, look, device) in one frame, reads the figure canvas in the frame that draws it, shows it beside the saved baseline and the difference (src/debug/look-board.ts, look/README.md). |
| `?twod` | preview and local run | Pages | The look board: a button per row opens the 2D app's preview of the same patient in the row. |
| `?capture` | preview and local run | Open | One look-board state (the look board's own frame opens it): ?capture&look=dark&preset=cirr-decomp&view=circuit&chevrons=0&orbit=25 applies it in memory (nothing saved) and window.__look hands out the canvas (src/debug/look-app.ts). |
| `?liver` | preview and local run | Open | The cirrhotic liver's cel mock-ups: ?liver=cel1 to cel15 (src/scene/organs/liver-texture.ts); none shows cel15, the standing surface (cel14 soft light, cel13 cobbled soft, cel7 cobbled); c2b the earlier pale-nodule one. |
| `?only` | preview and local run | Pages | The Phone check or the Sweep: just these journeys or specimens (comma list). |
| `?steps` | preview and local run | Pages | The Phone check: steps=0 leaves out the per-step rows. |
| `?fresh` | preview and local run | Pages | The Phone check: fresh=1 forgets a walk the browser was part way through. |
| `?charts` | preview and local run | Pages | The charts gallery (src/ui/charts/gallery). |
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
