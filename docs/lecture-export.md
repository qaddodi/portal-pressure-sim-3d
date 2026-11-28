# Lecture export: talks as Markdown outlines in one zip

Built 28 Nov 2026 (owner: "export any lecture of my choosing, many at once, into one .zip, like instantaneously"). Node only: no browser, no GPU, no approval.

```
npm run export:lectures -- all                              every talk
npm run export:lectures -- tips-complete,ascites            these talks
npm run export:lectures -- "deck:tips-complete+slide:ascites:3"   the audit's request grammar (deck:, slide:, random:12@4471/deck, feature:)
  --list        the talks and their slide counts
  --size <id>   the screen the cards are planned for (mac default; mac-short, ipad, ipad-portrait, iphone, iphone-landscape)
  --no-wire     Markdown only
  --notes       add each slide's speaker notes and the question for the room
  --out <dir>   default /mnt/project-files/lecture-export/ when it exists, else ./exports/
  --dir         also write the files unzipped
```

## What is in the zip

`INDEX.md` (every talk and its slides), `lectures/<talk>.md` (one per talk), `lectures/wire/NN-<slide>.svg` (one per slide).

For every slide: the case or question card it opens on; **Card 1** (the title and the line, with each `{reading}` printed in its tile's own format from that slide's state, bold and cut-offs as the card sets them, the equation, sides, causes, caveat and source line, the buttons and sliders on the card); **Card 2** (the instrument and its words, the tiles with their readings and the key ones marked, the summary table with its numbers, the liver-function card); **Figure** (what the camera is centred on, how far in as a share of the whole figure's height, the turn and tilt, which organs stand in the room and how much of each, which are cut by the room's edge, where each labelled station stands and how far from the room's edge (under 40 px is said), the lens, marks, glows, catheter, procedure, the vessels in the room widest first); the patient the slide stands on; and the planned layout in numbers.

## Where the numbers come from

- **Readings**: the baked per-slide states (`public/baked/charts-<key>-<talk>.json`, `ui/charts/baked/`), through `mergeStates`, the same source the cards read before the worker has its own. A talk whose file is missing is baked first, once (`scripts/bake-charts.mjs --only`, about 7 to 15 s a talk). After that a talk takes tens of milliseconds.
- **Words and cards**: `loadSource` and `toDeck` (the deck as the app plays it), the card's own line parser and number format (`ui/text/line.ts`, `tokens.ts`).
- **Camera and room**: the slide's own plan (`decks/hp/plan.ts`), the layout planner (`ui/layout/plan.ts`) for where the cards stand and the room they leave, and the scene's own room solver and lens (`scene/camera/room.ts`, `shots.ts`).

## What the wireframe is, and is not

A flat SVG: the placed organs' outlines and the vessels the figure draws (`scene/vessels/network.ts`, their own courses and radii) projected through the slide's camera, the labelled stations, and the cards where the planner puts them. About 2 ms a slide.

It shows framing, zoom and where things stand. It does **not** show shading, the look, real text wrapping or a card's true height (card heights are estimated from the characters; only the page measures them), and the vessels are the network's, not the patient's: a collateral or a shunt is dashed and faint because node does not know whether this patient has opened it. The Lobule, Sinusoid and Circuit views are not drawn (the slide says so). It is a plan of intent, not a measurement of a frame: it cannot see an overlap or a clip that only the page makes.

`tests/lecture-export.test.ts` runs every talk through it (every slide has a heading and a whole SVG, no unfilled braces, under 250 ms a slide on average).
