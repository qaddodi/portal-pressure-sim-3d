# Rebuilding the app in 3D with cel shading

Version 3, 19 Nov 2026, 2 PM ET. Research and recommendations only; no code changed. What is new since version 2:

- It now fits the **three repos** you approved today: `qaddodi/hales-engine` (the shared body-wide pressure engine, portal first),
  `qaddodi/portal-pressure-sim-3d` (the 3D cel-shaded rebuild, its own Pages address) and the current `portal-pressure-simulator`, which keeps
  working while the engine moves out (thread "Move the engine into hales-engine" is doing that now).
- It grows the **cel portal sketch** you liked into a plan: what it already proves, what has to change before it is the real figure (section 4).
- Section 11 gives **pros and cons for every decision** you have to make, with a recommendation for each.

Earlier versions: `rebuild-ui-options-2d-v1.md` (2D). The sketch: `cel-mock/cel-portal-mock.html`, live at
https://claude.ai/artifact/ApoEe4HeEF8SJnuSKuCNqQ. Tool facts are from what I know up to mid 2026; anything marked "check" should be confirmed
before a thread builds on it. Effort figures are estimates, not measurements.

## 0. Decisions made

| Date | Decision | Section |
|---|---|---|
| 19 Nov 2026 | Rebuild in 3D with cel shading; keep only the engine (now `qaddodi/hales-engine`) | 1 |
| 19 Nov 2026 | Repos: `hales-engine` (private, shared engine), `portal-pressure-sim-3d` (private, own Pages), the 2D app keeps working | 2 |
| 19 Nov 2026 | **React with React Three Fiber** for the 3D app | 11.1 |
| 19 Nov 2026 | **Placeholder anatomy now; a medical 3D artist commissioned in parallel** | 11.3 |
| 19 Nov 2026 | **Cards and all teaching text as web text over the 3D, on one shared clock** | 11.6 |
| 19 Nov 2026 | Plan the slice before building it, so even the slice never looks bad | 10 |

The look-and-feel spec, the slice plan and the live mocks of four screens are in `/mnt/project-files/rebuild-3d/` and in the 3D repo's
`docs/`. Mocks: https://claude.ai/artifact/74tCejAXQrfgeSh63L26ZD. Still open: 11.2, 11.4, 11.5, 11.7 to 11.15 (the slice plan assumes the
recommended option for each), and the look questions at the end of `look-and-feel.md`.

## 1. The short answer

- **Renderer:** Three.js, written as components with React Three Fiber (R3F). WebGL2 as the tested default, WebGPU switched on per device once
  it proves itself on your iPhone.
- **Look:** the sketch's look, kept: banded toon light, hard rim and specular, ink outlines from a back-face copy. A screen-space edge pass adds
  inner lines on the Mac and iPad.
- **Text:** cards and teaching text stay crisp web text over the 3D, placed every frame from 3D anchor points by the same clock as the camera.
- **Art:** Blender to glTF. Organs are meshes; vessels are centrelines turned into tubes at load so the engine drives their size, colour and flow.
- **Engine:** `hales-engine`, consumed by both apps at a tagged version, running in a worker behind a typed protocol.
- **Decks:** the same deck data; each `cam` becomes a named 3D camera shot.

## 2. The three repos and how they fit

```
hales-engine (private)            the physics: core solver + modules/portal (later pulmonary, intracranial...)
  ├─ core/        solver, linalg, events, explain, scenario runner
  ├─ modules/portal/  topology, physiology, cut tables, presets, acceptance tests
  ├─ worker/      worker-core + protocol.d.ts (typed messages)
  └─ tags v0.x    each release is a git tag both apps pin to

portal-pressure-simulator (public)   today's 2D app, unchanged on screen, imports the engine from hales-engine
portal-pressure-sim-3d (private)     the 3D rebuild, imports the same engine tag, own Pages address
```

**What this buys.** Both apps run the same physics, so the 3D app can be checked against the 2D app number for number on every preset. The
engine's acceptance tests live once, with the engine. A future pulmonary or intracranial app is a new UI over a new module, not a new engine.

**Things to know about this setup** (details and choices in section 11):

- **A private repo does not hide the engine.** Whatever runs in the browser ships as JavaScript every visitor can read. Private keeps the source,
  history and tests private, not the running code.
- **Pages from a private repo needs a paid GitHub plan** (Pro or above; check your plan). The published site itself is still public.
- **Builds in private repos spend Actions minutes** (public repos do not). Your 18 Nov rule bans minutes for checks; a deploy is a build too. The
  current app already has a branch-based Pages mode (`gh-pages` branch, AGENTS.md, 12 Nov), so the 3D app can build on your Mac or in a cloud
  thread and push the built site to `gh-pages` with no Actions run at all.
- **How the 3D app gets the engine:** the engine thread set the 2D app up with a pinned copy synced by a script (19 Nov; tags cannot be pushed
  from the cloud yet). The slice plan uses the same for the 3D app, so no token is needed at build time.

## 3. What 3D changes against the bible rules

| Rule | What 3D brings | What it costs |
|---|---|---|
| Production level | Maintained tools (Three.js, Blender, glTF) instead of hand-rolled renderers | A new asset pipeline the current app never had |
| Intuitive | Depth makes "behind the liver", "into the lobule", "the cut face" obvious; a camera move explains anatomy | The viewer must never get lost: few authored shots, limited orbit |
| Elegant, beautiful | Cel shading reads like an illustrated atlas, stays clean at any zoom, and the five looks become five ramps | Needs art direction and real anatomy art |
| Humanized | Hand-tuned bands, ink weight and colour, not a render-engine look | Easy to look like a game if colours are loud |
| Performant | One renderer, render only when something changes | 3D costs more GPU memory and pixels than 2D on a phone |
| Text never shrinks, nothing scrolls | Unchanged with DOM cards | Lost if cards move into the scene without a layout engine |

## 4. From the sketch to the real figure

**What the sketch already proves.**

1. The look works with very little: three tone bands, a rim, a dot of specular and an ink hull. No textures, no shadows.
2. **Engine numbers can drive the art directly.** The HVPG slider stands in for the engine: one number per vessel pushes the tube's surface
   outward (swelling) and blends its colour toward the 5 and 10 mmHg tokens. That is the pattern for every vessel, varix and collateral.
3. **Labels cannot lag the picture.** The labels are DOM, placed after the camera moves, in the same frame callback. No second loop exists.
4. A camera move ("Dive to liver") is one eased value; cards and labels follow for free.

**What has to change before it is the real figure.**

| In the sketch | In the app | Why |
|---|---|---|
| Outline thickness in world units (thinner when far) | Thickness in screen pixels (scale the push by clip-space depth), 1.5 px on phones, set per look | Even ink at every zoom, like a drawing |
| One colour per vessel tube | One data texture, one texel per vessel: pressure, flow, area, saturation; the shader reads it | All vessels update with one upload a frame, no per-vessel CPU work |
| Procedural blobs | Blender organs, glTF | Atlas quality; the sketch shapes are placeholders |
| Tubes that just overlap at joins | Same, plus a small blend at each join and the edge pass for the crease line | Overlapping same-colour tubes join seamlessly in 3D, which removes most of today's join bugs; the hull draws no line where tubes meet, so the edge pass (or a painted ring) marks the crease where wanted |
| No flow shown | Chevrons as a stripe pattern that scrolls along each tube's length coordinate at the engine's speed; blood as instanced particles along centrelines | Constant speed, never backward, never vanish, and nothing to stitch at joins, because the stripe follows the tube's own coordinate; reversal is a sign change, shown in orange |
| Renders every frame | Renders on demand: only while the camera, a tween or the model is moving | The biggest battery and heat saver on a phone |
| Free drag orbit | Authored shots per deck slide, with a small limited orbit for exploring | The viewer never gets lost |
| Labels can overlap each other | One screen-space label solver, after projection, that knows card boxes | Same rule as today (labels never under cards), now in one place |
| `requestAnimationFrame` directly | One `frameFor`-style scheduler, the only loop | Same rule as today's AGENTS.md |

**3D-specific wins worth planning for.** Cut views become a clipping plane with a filled cap (looks like an illustrated section). The lobule dive
becomes a real camera move into an instanced hexagonal lobule. Endoscopy becomes a camera inside the oesophagus tube looking at varices that
swell from the same engine numbers. TIPS and DIPS become a stent mesh following a needle path through real 3D liver.

## 5. The stacks, ranked for 3D cel shading

| Rank | Stack | Fit | iPhone | Effort to parity | Main risk |
|---|---|---|---|---|---|
| 1 | **Three.js + R3F** (Threlte equal second), DOM cards, hull outlines, Blender to glTF | Largest ecosystem for exactly these parts: toon materials, drei `Outlines` and `Html`, `postprocessing`, troika text, `gltfjsx`, `uikit` | Good within the budget in section 8 | 10 to 16 weeks plus art | 3D art is a new dependency; React must stay out of the frame loop |
| 2 | **Babylon.js** | Very good: built-in outline and cel tools, Node Material Editor for tuning the look visually | Good, heavier engine (over 1 MB) | Similar | Engine size; its GUI does not suit long text |
| 3 | **PlayCanvas** | Good: light, fast, the best browser scene editor | Very good | Similar | Smaller stylised-shader community; hosted editor |
| 4 | **Needle Engine** over Three.js | Good if the artist builds scenes in Blender or Unity | Good | Similar | Licence terms (check), runtime conventions |
| No | Unity web, Godot web | | Large builds, iPhone memory kills the tab, poor for long text; Godot web has no WebGPU, no C# | | |
| No | Raw WebGPU | | | | Writing a renderer again is how the current UI reached 137,000 lines |
| No | Spline, Rive, Lottie, slide frameworks | Spline only for trying looks; Rive and Lottie are 2D; decks are already better data than any slide tool | | | |

## 6. Cel shading techniques and cost

| Technique | Cost on a phone | Use |
|---|---|---|
| Banded diffuse, 2 to 4 tones | Free | Everywhere (the sketch) |
| Hard rim light, hard specular dot | Free | Everywhere (the sketch) |
| Back-face hull outline | One extra draw per object, twice the vertices, no extra screen memory | All devices (the sketch) |
| Screen-space edges from depth and normals | One full-screen pass plus a normal buffer: at 2x on an iPhone about 10 to 25 MB GPU memory and 1 to 3 ms a frame (estimate) | Mac and iPad; optional on iPhone |
| Flat cast shadows | One extra depth pass | Skip; a soft painted contact shadow under organs instead |
| Clipped cut faces with caps | Cheap | Cut views, TIPS tract |
| Hatching or halftone in the shadow band | Cheap in screen space | A look option, later |
| Anti-aliasing | MSAA 4x is cheap on Apple GPUs | Default |

Each of the five looks becomes data: a shadow tone, a light tone, an ink colour and a background, per organ class.

## 7. Text, cards and the 3D in one clock

One frame callback, in this order: read the latest engine frame, advance tweens, move the camera, render, project every anchor to the screen,
solve labels, write DOM transforms. Cards and labels share the camera matrix of the picture they sit on, so they cannot lag it. A test fails any
second frame loop, as `no-raw-raf` does today. Cards claim screen room first; the camera then frames the subject in what is left, which in 3D
means moving the camera rather than squeezing the art. Labels that must hide behind an organ are drawn in the scene as SDF text; keep those few.

## 8. iPhone memory and battery budget

| Item | Budget |
|---|---|
| Rendering | On demand; 60 fps only while something moves |
| Pixel ratio | Cap at 2 on iPhone (3x is 2.25 times the pixels; flat cel art looks sharp at 2x) |
| Triangles on screen | Under about 300k |
| Draw calls | Under about 100 a frame (merge static organs, instance particles and lobule cells; hulls double the count) |
| GPU textures | Under about 32 MB, KTX2 compressed; most cel art needs none |
| Full-screen buffers | Scene plus at most one post buffer on iPhone |
| Context loss | Handle it and rebuild the scene; iOS drops GPU contexts under memory pressure |

## 9. Asset pipeline: Blender to glTF

1. Reference: the current 2D plate for proportions and the topology edge IDs for names.
2. Blender: low to mid poly organs; vessels as curves with a radius per point, named by edge ID (`PV_TRUNK`, `SPL`, `SMV`...); camera shots as
   named cameras matching deck `cam` names; morph targets for spleen size, ascites and the shrunken cirrhotic liver; collaterals modelled in their
   true places, revealed along their length by the engine's flow.
3. Export `.glb`; vessel centrelines as node extras or a small JSON beside it.
4. Optimise with `gltf-transform` (Meshopt or Draco, KTX2, prune). Target a few MB for the whole body.
5. Load with `gltfjsx` as components; rebuild tubes from centrelines at runtime.

## 10. Migration plan

**Phase 0, now: engine out (in progress).** `hales-engine` gets the engine with its history and acceptance tests; the 2D app imports it and
shows the same numbers. Add `protocol.d.ts` and tag `v0.1.0`.

**Phase 1: look and contract (1 week).** You try the sketch on the iPhone, iPad and Mac. Threads make three style frames of one view in each look
(two-tone thin ink, three-tone thick ink, three-tone with hatching). Write the deck schema (checked against all 38 decks), the layout rules and
the one-clock rule into the 3D repo's AGENTS.md.

**Phase 2: slice (2 weeks).** In `portal-pressure-sim-3d`: the sketch rebuilt properly on R3F, live engine from the pinned tag, the portal tree,
IVC and hepatic veins as data-driven tubes, scrolling chevrons, three shots, one teaching card and the pressure ladder as DOM, the HVPG deck,
render on demand. You test on the iPhone before anything else is built.

**Phase 3: art (in parallel, 3 to 6 weeks).** Blender anatomy replaces placeholders view by view through the glTF pipeline.

**Phase 4: the figure (3 to 4 weeks).** Collaterals and varices by flow, ascites and spleen morphs, cut views, TIPS and DIPS, catheter and
balloon, lobule dive, circuit view.

**Phase 5: cards, instruments, decks (3 to 4 weeks).** Tiles, ladders, charts, Doppler, endoscopy, EUS, Fibroscan, TIPS editors, the wallet on
landscape iPhone, all 38 decks, settings, looks, Send feedback, tester guides.

**Phase 6: switch over** when you say the 3D app is at parity on your devices. The 2D app can stay online at its address as long as you want.

## 11. Your decisions, with pros and cons

Each has my recommendation in bold. The ones that block Phase 2 come first.

### 11.1 Code framework for the 3D app

| Option | Pros | Cons |
|---|---|---|
| **React + R3F** | Largest set of ready parts (drei, postprocessing, uikit, gltfjsx); most examples, so threads write it best; hires are easy | React's re-render model must be kept out of the frame loop; about 45 KB more than Svelte |
| Svelte 5 + Threlte | Less code, reads like HTML, tiny runtime | Fewer ready parts (some pieces written by hand), fewer examples |
| Plain Three.js, no framework | Smallest, total control | You rebuild components, state and UI plumbing yourself, which is how the current app grew |

### 11.2 WebGL2 or WebGPU first

| Option | Pros | Cons |
|---|---|---|
| **WebGL2 default, WebGPU opt-in per device** | Mature on every iPhone and iPad you own; the most tested Three.js path | Misses WebGPU's lower CPU cost per draw until switched on |
| WebGPU first (Three's WebGPURenderer and TSL) | Newer API, compute shaders for blood, one shader language for both paths | Safari's WebGPU is recent (Safari 26); more chance of device-specific bugs; older iPhones fall back anyway |

### 11.3 Who makes the 3D anatomy

| Option | Pros | Cons |
|---|---|---|
| **Commission a medical or stylised 3D artist** | Atlas quality, made for cel shading and for this topology, you own it | Cost and a few weeks; needs a clear brief (the sketch plus style frames) |
| Adapt open anatomy (BodyParts3D, Z-Anatomy) | Free, anatomically accurate | CC BY-SA: derived models must be shared alike and credited; realistic meshes need heavy cleanup to look illustrated |
| AI 3D generators (text or image to mesh; check current tools and their licences) | Fast first drafts | Rough topology, uneven anatomy, licence terms vary; still needs a person to clean up |
| Procedural only (like the sketch) | No dependency, threads can do it all | Will look schematic, not atlas-like |

A mix works: procedural now so code moves, the artist's files dropped in later.

### 11.4 How realistic the anatomy should be

| Option | Pros | Cons |
|---|---|---|
| **Stylised and simplified, true positions (an illustrated atlas)** | Teaches clearly, suits cel shading, cheap to render | A purist may want more detail |
| Realistic shapes with cel shading | Impressive, accurate | Busy to read at phone size; more triangles and art cost |
| Schematic (sketch level) | Cheapest | Looks like a diagram, not a body |

### 11.5 Outline method

| Option | Pros | Cons |
|---|---|---|
| **Hull on all devices, add the edge pass on Mac and iPad** | Cheap everywhere; richer lines where there is room | Two looks to keep consistent; iPhone has no crease lines at joins |
| Hull only | Cheapest, one look | No lines at inner creases or where organs overlap |
| Edge pass only | Uniform lines everywhere, creases included | Extra screen memory and time on every device; can draw noise on curved surfaces |

### 11.6 Cards and text: web text over 3D, or inside the scene

| Option | Pros | Cons |
|---|---|---|
| **Web text (DOM) over the 3D** | Sharpest text, never shrinks, screen readers and Dynamic Type work, layout rules are CSS | Breaks today's "nothing off the GPU" rule as written (motion is still composited on the GPU) |
| In-scene text (uikit, SDF) | One coordinate system; keeps the rule | Softer small text; accessibility and inputs rebuilt by hand; younger tools |

### 11.7 Glass behind cards

| Option | Pros | Cons |
|---|---|---|
| **"Soft lift" shadow only on iPhone; glass on Mac and iPad** | No sampling cost where memory is tight; keeps the look you chose on 19 Nov | Two treatments to keep consistent |
| Glass everywhere (blurred copy of the frame under each card) | One look | One more full-screen buffer and blur on the phone |
| Soft lift everywhere | Simplest | Loses the glass look |

### 11.8 Camera freedom

| Option | Pros | Cons |
|---|---|---|
| **Authored shots per slide, small limited orbit when exploring** | The viewer never gets lost; decks stay cinematic | Less freedom for curious users |
| Free orbit and zoom | Exploratory, game-like | Easy to get lost; labels and cards fight odd angles |
| Fixed shots only | Simplest, most predictable | Loses the point of 3D in free play |

### 11.9 How the 3D app gets the engine

| Option | Pros | Cons |
|---|---|---|
| Pinned git dependency on a tag | One line in `package.json`; both apps pin a version; upgrades are deliberate | Needs a GitHub token wherever the build runs (the repo is private) |
| Git submodule | No package tooling | Submodules confuse threads and are easy to leave out of date |
| GitHub Packages (npm registry) | Proper versioned package | Publishing step and token setup; more moving parts |
| **Pinned copy synced by a script at a recorded commit (in use, 19 Nov)** | No token at build time; the pin is explicit; same as the 2D app | A re-sync step to upgrade; a test must check the copy matches its pin |

### 11.10 Repo visibility and hosting for the 3D app

| Option | Pros | Cons |
|---|---|---|
| **Private repo, build off Actions (on your Mac or in a thread), push the built site to `gh-pages`** | Source stays private; no Actions minutes | Pages for private repos needs GitHub Pro or above (check your plan); someone has to run the build |
| Private repo, Pages through Actions | Automatic deploys | Spends Actions minutes, against your 18 Nov rule; also needs a paid plan |
| Public repo (like today's app) | Free Pages and free Actions | Source visible (the running code is visible either way) |

### 11.11 Where the decks live

| Option | Pros | Cons |
|---|---|---|
| **2D app owns them until switch-over; the 3D app copies them by a script and adds 3D fields** | No disruption to today's app; one clear owner | A copy for a while; edits during the overlap must be re-copied |
| A shared content package (third repo or inside `hales-engine`) | One source for both apps | Deck fields (`cam`, `cutouts`, card names) are UI-specific, so a shared package mixes physics and presentation |
| Rewrite decks for 3D | Slides designed for 3D from the start | Redoes checked clinical text; risk of errors |

### 11.12 Engine protocol for future organs

| Option | Pros | Cons |
|---|---|---|
| **Freeze today's portal protocol as v1 now; add a module name to messages when the second organ arrives** | No delay for the 3D work; no guessing about pulmonary needs | One protocol change later |
| Design a general multi-organ protocol now | Ready for any organ | Designed without the second organ's real needs; delays the slice |

### 11.13 Scope of the first 3D release

| Option | Pros | Cons |
|---|---|---|
| **Core first: Anatomy view, the 10 most taught decks, main cards; the rest after** | You can teach with it in weeks, not months; feedback shapes the rest | Two apps in use for a while |
| Full parity before anyone uses it | One switch-over | Months before you can use it; risk of building things you would change |

### 11.14 What happens to the 2D app meanwhile

| Option | Pros | Cons |
|---|---|---|
| **Bug fixes and clinical text only; no new visual features** | Effort goes into the 3D app; the 2D app stays reliable for teaching | Known visual issues in 2D may wait |
| Keep improving both | Nothing stalls in 2D | Doubles the work; the 2D work is thrown away at switch-over |
| Freeze completely | Maximum focus | Bugs you hit while teaching stay |

### 11.15 Testing under your rules

| Option | Pros | Cons |
|---|---|---|
| **Engine tests in `hales-engine`; unit tests for the pure parts of the 3D app (tube building, label solver, deck schema, one-clock rule); you test on devices; play-tests on your Mac** | Fast, fits "never slow runs" and no Actions minutes | No automated picture checks |
| Add headless picture checks | Catches visual regressions | Software GL cannot judge cel shading or speed; against your rules |

## 12. Summary of recommendations

R3F; WebGL2 first; commission the anatomy and start procedural; stylised atlas realism; hull everywhere plus the edge pass on bigger screens; DOM
cards; soft lift on iPhone; authored shots with a small orbit; a pinned engine copy synced by script; private repo built off Actions and pushed to
`gh-pages`; decks copied from the 2D app until switch-over; freeze the portal protocol as v1; a core-first release; the 2D app on fixes only;
tests that stay fast and off Actions.
