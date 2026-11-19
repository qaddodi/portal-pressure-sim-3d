# Cards: the same as the 2D app on every device (19 Nov 2026)

Owner: "how we see cards on iPhone vs Mac vs iPad vs landscape iPhone should all be the same if not better."
The 2D app's rules are ported as pure functions in `src/ui/layout/rules2d.ts`; `src/ui/layout/plan.ts` places the cards with them.
`tests/ui-parity-2d.test.ts` holds the port to `tests/fixtures/parity-2d.json`, which `scripts/gen-parity-2d.mjs --from <2D checkout>` writes
from the 2D modules (devices, card-scale, card-type, card-shuffle) and the 2D stylesheet's own formulas (`--pz-b`, `--pz-cm`, `--pz-cp`, `--pz-cw`),
for the 7 device sizes and 9 more. Run the script again after a 2D card change; `PPS_2D_DIR=<2D checkout> npm test` checks the fixture against it.

| Screen (2D name) | Layout | Cards |
|---|---|---|
| Mac, iPad on its side (`wide`, `short` under 860 px tall) | floating | words top left, data card UNDER it at the same width (gap 0.6 margin); a pair a little too tall rises into the top margin (≥ 4 px); 2D then shrinks the data blocks, 3D stands the data card beside (nothing shrinks) and, past that, pages the words |
| iPhone upright (`stack`) | stacked | data card on top (8 px), figure between (keeps 30 % of the height, gives way to 22 %), words at the foot above the bar; where the figure and the words need the room the data card comes in closed (a 48 px strip at the top, tap or swipe opens it and the words become the strip) |
| iPad upright (`tab`) | stacked at 70 % width | the same plan |
| iPhone on its side (`short` + sideways) | the wallet | one column centred on the screen, 400 px first, wider (460 … 640) only for a slide that needs the height; the card in front, the other a 48 px strip at the foot |

Type is the 2D roles (`cardScale`): a floating card's words in `body` (17–28 px, scaled by the screen's height), its heading in `title`; a stacked card's
line in `lab` and heading in `val` (×1.45 on iPhone, ×1.39 on iPad), 22 px words on an iPhone on its side. Nothing shrinks to fit: more height comes from a wider
wallet column, then a page.

Where the 3D app differs on purpose (all "better", none smaller type):
- the presenter bar stands at the foot (a column of buttons at the right edge on an iPhone on its side, where the wallet takes the foot); the 2D pill sits inside the words' card;
- a pair that cannot stack on a floating screen stands side by side or pages instead of shrinking the data card's blocks;
- the words alone on an iPhone on its side also widen (the 2D app shrinks them).
