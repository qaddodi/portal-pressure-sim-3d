# About Hales Engine: the flyer

A two-page PDF for colleagues: what Hales Engine is and what the Portal Pressure Simulator does. Page 1 has Stephen Hales's 1733 experiment as an engraving, with the history and what the engine is. Page 2 draws the engine as an electrical circuit.

- **Two sizes, one set of words:**
  - `/about/hales-engine.pdf` (`public/about/`): 8 × 12 in (2:3), two pages. It prints on Letter or A4 with a cream margin.
  - `/about/hales-engine-iphone.pdf`: 390 × 844 pt pages, the same size as the iPhone tester guide, so a phone shows each page at full width with no zoom. It is about four pages, with a portrait circuit and larger type.
- **Offline:** it is never held offline. `scripts/pwa.mjs` leaves `about/` out of the service worker's list, as it does the guides.

## Files

| File | What it is |
|---|---|
| `flyer.html` | **The words**, and the 8 × 12 in layout. Edit the text here, and only here. A block with `class="desk-only"` (such as "Overleaf") stays out of the iPhone version. |
| `phone.html` | The iPhone layout's styles only. `render.cjs` takes `flyer.html`'s blocks in order and starts a new page when the next block doesn't fit. A heading always stays with the block after it. |
| `circuit.py` | Draws `circuit.svg` (landscape, for the 8 × 12 in pages) and `circuit-phone.svg` (portrait, for the iPhone: the same parts, top to bottom). |
| `gemini-original.jpg` | The engraving exactly as Gemini made it (25 Nov 2026), from the prompt below. |
| `comp.py` | Makes the page backgrounds from the original. It removes a stray squiggle, shrinks the scene into the top half and refills the page with the image's own paper. |
| `page1-bg.jpg`, `page2-bg.jpg` | The 8 × 12 in backgrounds `comp.py` makes. |
| `scene.jpg`, `paper-tile.jpg` | The iPhone pictures `comp.py` makes: the scene alone, and the paper as a seamless low-contrast tile. |
| `render.cjs` | Builds both PDFs. It refuses to build if "2D" or "3D" appears anywhere, if text runs into a footer, if two blocks overlap, if a block is taller than an iPhone page, or if the credits are left alone on the last page. |
| `built-from.json` | The sha256 of each source the PDF was built from. `tests/hales-flyer.test.ts` fails when a source changed and the PDF wasn't rebuilt. |

## Rebuild after an edit

```
cd art/hales-flyer
python3 comp.py gemini-original.jpg page1-bg.jpg 0.72 0.115     # only after a new image
python3 comp.py gemini-original.jpg page2-bg.jpg 0 0            # only after a new image
python3 comp.py gemini-original.jpg scene.jpg scene             # only after a new image
python3 comp.py gemini-original.jpg paper-tile.jpg tile         # only after a new image
python3 circuit.py                                              # only after a circuit change (needs Pillow for comp.py only)
cd ../..
node art/hales-flyer/render.cjs [--png /tmp/pages]              # needs Playwright's Chromium; writes both PDFs and built-from.json
node --test tests/hales-flyer.test.ts
```

**A new Gemini image.** Save it over `gemini-original.jpg`, then check where its scene sits. `comp.py` crops the scene at fixed fractions of the page (`sx0..sy1`), which fit this image. A new image needs those fractions, and the squiggle patch, set again.

## Rules

- **One engine, one app.** The flyer never mentions "2D" or "3D", or any earlier version (owner, 26 Nov 2026). `render.cjs` and the test both check this.
- **The © line is the app's one line.** `flyer.html` has an empty `<b data-credit>` in each footer, and `render.cjs` fills it from `scripts/credit.mjs`, whose source is `CREDIT` in `src/ui/shell/words.ts`. To change the line, edit it there and rebuild.
- **The circuit is drawn from the engine's own network.** The nodes come from `topology.js`. The liver's three resistances come from the `pre`, `sin` and `post` fibrosis terms in `scenario.js`. It is simplified to one resistor per segment.
- **Hales's facts are as checked below.** The mare's age and an mmHg conversion are left out on purpose, because sources disagree.

---

## 1. Gemini background prompt

**Format:** portrait **3:4** (US Letter; for A4 use **2:3**). Ask for the largest size Gemini offers, then upscale to about 2550 × 3400 px (300 dpi Letter). Keep everything important inside the middle 90%, so either paper size can be cropped from one image.

**Layout the prompt asks for:**
- **Top 15%:** a quiet, nearly empty sky or plaster wall, for the title.
- **Next 35%:** the scene, with the tall glass tube rising up the right-hand third.
- **Bottom 50%:** plain aged paper with only a faint fade of the scene's floor. The body text goes here.

The image carries no words: Gemini draws letters badly, and the type is set on top.

**Paste into Gemini:**

```
A single-page portrait illustration in the style of an original 18th-century copperplate engraving, as if it were a plate from a 1733 English natural-philosophy book. Fine line engraving with cross-hatching and stipple shading, printed in warm sepia-brown ink on aged cream laid paper, with soft foxing and a faint plate-mark border. Calm, scholarly, dignified.

Scene (upper middle of the page only): a quiet English country parsonage yard in about 1710, with a timber barn wall and soft daylight. An elderly-looking country clergyman-scientist in a plain black cassock, white clerical bands and a short powdered wig stands beside a very tall, thin, vertical glass tube. The tube is about three metres tall, held upright by a wooden post with brass clamps, and runs up the right-hand third of the picture well above his head. Inside it is a slim column of liquid, the only touch of colour in the whole image, a muted oxblood red, reaching about nine-tenths of the way up. A small wooden measuring rod with simple tick marks stands beside the tube. The clergyman looks up at the top of the column with quiet curiosity and holds a quill and a small notebook. A calm chestnut mare lies resting on clean straw in the lower left, seen side-on and peaceful, her head and neck relaxed. A thin brass pipe leads from beneath her, discreetly hidden in the straw, to the foot of the tube. No wound is shown.

Composition: the top 15% of the page is open, pale, almost empty sky or plain plastered wall with only very light hatching, for a title. The scene sits in the band from about 15% to 50% of the page height. Below that, the floor and straw fade softly into plain aged paper, so the bottom half of the page is calm, light and nearly empty, with only the faintest paper texture, for body text. Use a light vignette at the edges and a slim engraved ruled border around the whole page. High contrast in the scene, very low contrast everywhere else. Looks good both printed and small on a phone screen.

Palette: sepia-brown ink (#4A3424), cream paper (#F3EAD7), parchment shadows (#E2D3B5), and the single accent of muted oxblood (#7A2A22) only inside the tube.

Avoid: any text, letters, numbers, captions, signatures or watermarks; blood outside the tube; wounds, cuts, gore, restraints or a distressed animal; surgical instruments on display; modern objects, lab coats, stethoscopes or electricity; bright or saturated colours; photographic realism, 3D render, CGI, cartoon or anime style; heavy dark backgrounds; clutter in the top and bottom areas meant for text; borders with ornate scrollwork; extra fingers or deformed hands; more than one tube.
```

**Notes on the prompt:**
- Gemini has no separate negative-prompt box, so the **Avoid:** line sits inside the prompt. If it still adds lettering, send a short follow-up such as "same image, remove all text and numbers".
- **Accuracy versus taste.** In Hales's own account the mare was tied down on her back and the tube was put straight into her crural artery. The prompt shows her resting and the connection hidden. That keeps the flyer non-gory without changing the facts the copy states.
- The figure "evokes" Hales and is not a portrait. The well-known painted portrait of him is by Thomas Hudson. If you want a closer likeness, attach an image of that portrait to Gemini and add "the clergyman resembles the attached portrait".
- **If Gemini crowds the bottom half anyway:** ask it to "fade the bottom half to plain paper". Or lay a cream panel at about 85% opacity behind the text in the PDF. That reads better on a phone in any case.

---

## 2. Flyer copy

The text now lives in one place: [flyer.html](flyer.html), rendered as [hales-engine.pdf](../../public/about/hales-engine.pdf). It is no longer copied here, so the two can't drift apart.

- **Page 1:** the engraving, the Hales history, what Hales Engine is, and how the Portal Pressure Simulator uses it.
- **Page 2:** the engine drawn as an electrical circuit, with a legend (pressure as voltage, flow as current). It then explains how to read the circuit, including why HVPG misses presinusoidal disease, what the engine adds beyond a plain circuit, and what the simulator lets you do.

**Rule (26 Nov):** the flyer never mentions another version of the app or of the engine. That means no "2D" and no "3D" anywhere. `render.cjs` fails the build if either appears in the page text, the alt text or the circuit labels. It also fails if any text runs into the footer or two blocks overlap.

---

## Notes for review

**Facts checked**
- Hales's dates (1677–1761), his parish at Teddington (from 1709), and the 1733 *Haemastaticks* as volume II of the *Statical Essays*. Sources: Britannica, Westminster Abbey, Hektoen International.
- The experiment's details, quoted from Hales: the left crural artery, a brass pipe with a 1/6-inch bore, a 9-foot glass tube, a rise of 8 ft 3 in above the left ventricle, and a swing of 2–4 inches with each pulse.
- "Around 1710": Hektoen says probably December 1710. Another source implies about 1711. The copy says "around".
- The fire-engine air chamber. Hales wrote it himself, and Kim Parker's history page quotes him. Borelli hinted at the idea about 50 years earlier, which is why the copy does not call Hales the inventor. Otto Frank formalised it in 1899 (Wikipedia and Parker).
- Left out on purpose:
  - the mare's age, because sources disagree (14 or 10 years);
  - a conversion to mmHg, because the horse was restrained and different sources give different figures;
  - the goose windpipe, because it belongs to a different one of his experiments.

**Engine claims, checked against the hales-engine repo**
- Lumped-parameter, pure JS, no DOM, no dependencies, runs in a Web Worker, on the main thread or in Node: `README.md`.
- Tube law, compliance, Frank–Starling heart, three-element Windkessel arterial pulse, respiration: `src/core/physiology.js`.
- The network from gut to right atrium: `src/portal/topology.js`, with 50 nodes.
- Disease course (varices, collaterals, ascites, bleeding), TIPS and other shunts, and four drugs (propranolol, carvedilol, terlipressin, octreotide): `src/portal/engine.js` and `scenario.js`.
- Twenty presets, from healthy through pre-hepatic to cardiac causes: `scenario.js`.
- Golden-hash checks: `test/golden.mjs`.
- Lungs and brain: the README describes them as *future* modules, and the copy says "planned".
- Vendored, pinned copy: the README.
- The circuit is drawn from the engine's own network: `topology.js`, and the `pre`/`sin`/`post` liver resistances in `scenario.js`. It is simplified to one resistor per segment.

**Checked and left out**
- The "From readings" inverse search. The engine's own wording is careful: it searches for model scenarios and never makes a diagnosis. Fitting that in would need a sentence of caveats, so it stays out. It can be added if you want it.
- Why the engine is named after Hales. The repo doesn't say, so the copy only implies it and doesn't claim a reason.

**For you to confirm**
- The © line follows the repo's LICENSE ("Copyright (c) 2026 Mohammad Almeqdadi, MD. All rights reserved."). The app's About screen isn't in the repositories this thread can read, so check that the wording matches.
- Whether to credit anyone else, such as clinical reviewers or AI assistance in development.
- Whether the line "An educational model, not a diagnostic tool" matches the app's existing disclaimer wording.

Sources: [Hektoen International](https://hekint.org/2017/01/29/stephen-hales-the-priest-who-pioneered-clinical-physiology/), [Britannica](https://www.britannica.com/biography/Stephen-Hales), [Westminster Abbey](https://www.westminster-abbey.org/abbey-commemorations/commemorations/stephen-hales), [K. Parker, Imperial College](https://kparker.bg-research.cc.ic.ac.uk/wave_intensity_web/history_hales.htm), [Windkessel effect (Wikipedia)](https://en.wikipedia.org/wiki/Windkessel_effect).

---

## Review of Gemini's first image (25 Nov 2026)

**Mock-up:** [hales-engine.pdf](../../public/about/hales-engine.pdf). The page is 8 × 12 in (2:3). It uses the image as delivered, re-composed, with the copy set over it.

**What works**
- The engraving style and sepia palette.
- The tube is the only red, and it reads at a glance.
- No text in the image, no gore, and a clean border.
- It still reads when shrunk to phone width.

**What missed, and the cause**
- **The scene filled 11–74% of the page instead of 15–50%.** That left only about 19% clear for text, so the copy did not fit.
  - Cause: image models don't follow percentage layouts. Writing a "stricter" prompt won't make this reliable, so the fix belongs in the layout.
  - Fix: the PDF places the scene itself. The mock crops the scene, scales it to 72% and sets it in the top half. Paper texture taken from the image's own blank area fills the rest. The script is `comp.py`.
  - Next time, ask Gemini for **just the scene as a vignette on plain paper**, with no page layout. Every later image then drops into the same template.
- **The horse is fully tinted chestnut.** That breaks the rule that only the tube is red. Its white foreleg marking also looks like a bandage.
- **Hales looks elderly.** Around 1710 he was about 33. This was my prompt's mistake ("elderly-looking"). The well-known Hudson portrait shows him old, so either reading is defensible; pick one.
- **A small squiggle by the tube's foot**, a pseudo-signature, was removed in the mock.
- **Minor scale issue:** the tube is about 7½ ft against the figure, and the column about 6½ ft, rather than 9 ft and 8 ft 3 in. That's fine for a picture, but it is why the copy carries the numbers.

### Revised prompt (scene only, the layout is done in the PDF)

```
An original 18th-century copperplate engraving, as a single vignette illustration from a 1733 English natural-philosophy book: fine line engraving, cross-hatching and stipple, printed in sepia-brown ink on aged cream laid paper. Monochrome sepia throughout, with exactly one accent of colour: a muted oxblood red (#7A2A22) inside the glass tube only.

Scene: a timber barn wall beside a country parsonage, about 1710, soft daylight. A clergyman-scientist in his early thirties, in a plain black cassock, white clerical bands and a short powdered wig, stands looking up with quiet curiosity, holding a quill and a small notebook. Beside him a very tall, thin, vertical glass tube, about one and a half times his height, is clamped with brass to a wooden post; a slim column of oxblood liquid fills it to nine-tenths of its height. A plain wooden measuring rod leans against the post. A calm mare, drawn in the same sepia ink as everything else, lies resting on straw at the left, head relaxed; a thin brass pipe runs hidden through the straw to the foot of the tube.

Composition: the scene is a vignette whose edges fade softly into blank paper on all sides, with generous empty paper around it. No page border, no frame.

Avoid: any text, letters, numbers, signatures, monograms or watermarks; colour on the horse or anywhere except inside the tube; bandages, wounds, blood outside the tube, restraints or a distressed animal; modern objects; photographic realism, 3D render, cartoon style; a page border or frame; more than one tube.
```
