# Look and feel: Portal Pressure in 3D

19 Nov 2026, version 1, written for the HVPG slice. The live mocks are `mocks/slice-mocks.html`
(https://claude.ai/artifact/74tCejAXQrfgeSh63L26ZD): deck title, slide with cards, the sideways iPhone wallet and a vessel highlight, in all
five looks. The anatomy in them is procedural placeholder art; everything else (type, colour, cards, ink, motion, layout) is what this spec
asks for. The mocks have not been run in the cloud (your no-headless rule), so look at them on your devices.

Decided on 19 Nov: React with React Three Fiber; placeholder anatomy now, with a medical 3D artist commissioned in parallel; cards and all
teaching text as web text over the 3D, on one shared clock.

## 1. The six rules, applied

| Rule | What it means for this look | How we will know |
|---|---|---|
| Production level | No pop-in, no flash of unstyled cards, no frame where a label lags the picture, no blank canvas while loading | The done bar in `slice-plan.md`, checked on your devices |
| Intuitive | The camera always frames what the slide talks about, in the room the cards leave free; the viewer never gets lost (shots plus a small orbit, ±25°) | A first-time viewer can say what they are looking at on each slide |
| Elegant | Few tones, one ink, one card style, one motion curve; no effect that is not teaching something | Nothing on screen without a job |
| Beautiful | An illustrated atlas, not a game: muted organ tones, clean ink, flat light | Side by side with the 2D app in the same look, the 3D reads as the same family |
| Humanized | Hand-tuned bands and ink weights per look; clinical words written for physicians; numbers say what they mean ("≥10 · CSPH") | Colour is never the only signal |
| Performant | 60 fps on your iPhone during motion; nothing drawn when nothing moves | `?perf` on the device (`slice-plan.md`) |

## 2. Cel shading recipe

| Part | Organs | Vessels | Small parts (catheter, balloon, varices) |
|---|---|---|---|
| Tone bands | 3 | 2 | 2 |
| Band edge | Soft by one pixel (`fwidth`), never blurry | same | same |
| Shadow tone | Base colour × 0.62 on Light and Soft, × 0.50 on Dark, Navy and Black, then 8% toward the ink | same | same |
| Rim light | Thin, lit side only, +0.10 | same | same |
| Specular | None (organs are matte) | One hard dot, +0.32 (wet look) | One hard dot |
| Flow marks | n/a | Light bands that scroll along the vessel at the engine's speed; reversed flow scrolls the other way and turns orange | n/a |
| Light | One fixed light from upper left front; no cast shadows; no ambient occlusion | | |

**Organ depth and organ fill (Settings > Figure depth, 3D only, a deliberate step beyond 2D).** *Organ depth* adds a baked tuck term (`organs/organ-depth.ts`: one byte per vertex, worked out at load from creases and from where one organ meets another) and a soft light from the screen's upper left to the organ painter, in three soft steps in the look's own `og-dark` and `og-light`; off, the painter is exactly 2D's. *Organ fill* chooses the see-through wash (default, the layer's opacity) or solid (the same colour pre-mixed against the page and laid opaque). They are independent switches; both are uniforms (`depthAmt`, `solid`) eased on the clock (`organs/organ-settings.ts`).

The body plate behind the organs is a flat shape in `--organ-body`, no shading, no ink, so the figure reads as a plate in a book.

## 3. Ink

Ink is a back-face copy of each object pushed out by a width in **screen pixels**, so lines stay the same weight at every zoom.

| Object | Mac and iPad | iPhone |
|---|---|---|
| Liver, spleen | 1.8 px | 1.6 px |
| Stomach, bowel, heart | 1.5 px | 1.4 px |
| Vessels | 1.2 px | 1.2 px |
| Catheter, varices | 0.9 to 1.1 px | same |
| Picked vessel (highlight) | +1.6 px | +1.6 px |

| Look | Ink colour |
|---|---|
| Light | `#3B2C22` (the app's casing colour) |
| Soft | `#33251A` |
| Dark | `#0E0B09` |
| Navy | `#05080F` |
| Black | `#000000` (organ tones separate from the black ground) |

Where two same-colour tubes join, the ink of one hides inside the other, so joins are seamless. A crease line at joins comes later from the
screen-space edge pass on Mac and iPad only.

## 4. Palette per look

UI tokens are the current app's (`styles/tokens.css` on the preview branch). 3D tones are the app's organ and vessel tokens; the two
marked * are proposed, slightly deeper for contrast against the Soft ground.

| Token | Light | Soft | Dark | Navy | Black |
|---|---|---|---|---|---|
| Background | `#F1EBE0` | `#DDD0B9` | `#1A1917` | `#0E1422` | `#000000` |
| Card surface | `#FCF9F3` | `#F0E9DC` | `#242321` | `#161E30` | `#0D0D0E` |
| Text | `#1B1710` | `#1F1A12` | `#EEEBE5` | `#E9EDF6` | `#F4F4F5` |
| Text 2 | `#463F34` | `#463E31` | `#B7B1A8` | `#A9B2C7` | `#B6B6BC` |
| Accent | `#2E4BB8` | `#3652B8` | `#7C9BFF` | `#7C9BFF` | `#7C9BFF` |
| OK / caution / danger | `#157A58` `#B07A0A` `#C23F2A` | `#0F6B57` `#845200` `#AA3622` | `#34C38F` `#F0B43C` `#F2634D` | same as Dark | same as Dark |
| Body plate | `#E8DFD0` | `#CEC6B7` | `#262421` | `#1A2238` | `#0F0F11` |
| Liver | `#905B49` | `#774433` | `#A88C82` | `#A88C82` | `#A88C82` |
| Spleen | `#7A5F78` | `#634962` | `#93889A` | same | same |
| Gut, stomach | `#AF826E` `#A67A6C` | `#956A57` `#8D6255` | `#AC9289` `#A99088` | same | same |
| Heart | `#9D575C` | `#834046` | `#AE8387` | same | same |
| Portal veins | `#B8326F` | `#A8306A`* | `#E06AA2` | same | same |
| Systemic veins | `#3F7FCB` | `#3A74B8`* | `#79AEEF` | same | same |

Pressure colours and cut-offs stay as in the engine (`pressure-cuts`: HVPG amber 5, red 10; PPG amber 6, red 12) and always come with words.

## 5. Type

Fonts are the app's: Inter for the interface and numbers, Source Serif 4 for titles. Numbers are tabular and lining everywhere.

| Role | Mac and iPad | iPhone portrait | iPhone landscape |
|---|---|---|---|
| Deck title | Serif 44 / 1.08 | Serif 32 | Serif 28 |
| Slide title | Serif 26 / 1.18 (1.53× body) | Serif 22 (1.38×) | Serif 22 (1.38×) |
| Body (teaching line) | Inter 17 / 1.5 | Inter 16 / 1.45 | Inter 16 / 1.45 |
| Data text, tags | Inter 13 | Inter 13 | Inter 12 minimum |
| Kicker | Inter 11 caps, +0.09em | same | same |
| Big number | Inter 40 semibold | 40 | 32 |

Text **never shrinks to fit**. When a card does not fit, the figure gives up room, then the card splits into pages; nothing scrolls inside a card,
and no card is taller than the screen.

## 6. Cards

- "Soft lift" (your 19 Nov pick): card surface, 1 px hairline in the text colour at about 12%, radius 16, a two-layer shadow in the look's
  shadow colour. **Glass (owner, 19 Nov 2026: "the UI should match 2D"):** cards, the pill, the wallet strip and the settings panel are frosted like the 2D
  app's: the figure behind blurred at 22 px with a little saturation, under the surface at 66 %. Settings > Blur effect, On by default on every device;
  Off is the solid surface (`html[data-noglass]`). The browser's backdrop blur does it, on the compositor behind each card, so the glass is the card's own place every frame.
- Padding, widths and type are the 2D app's per screen: see `docs/card-parity-2d.md` (the earlier 24 to 26 px, 430 px and 330 px are gone).
- A card appears only when its content is laid out and its fonts are loaded; text never appears before its card.
- Tags (labels on the figure) are small pills in the look's glass colour, with a coloured dot and words.

## 7. Motion

One clock drives everything, in this order: engine frame, tweens, camera, render, tag positions.

| Move | Time | Curve | Notes |
|---|---|---|---|
| Camera shot to shot | 950 ms | ease in-out cubic | Straight from any view to any view; may overlap card moves (18 Nov rule) |
| Card enters | 280 ms | ease out (0.2, 0.7, 0.2, 1) | Rises 12 to 28 px and fades in; only transform and opacity |
| Wallet swap | 280 ms | same | The leaving card drops and fades; the strip text swaps |
| Tags during a camera move | Fade out, back in 180 ms after landing | linear fade | Labels fade between spots, never slide |
| Number change | 0.4 s roll | as today | One roll time app-wide |
| Flow marks | Engine speed | constant | Never backward unless flow reverses |
| Idle | Nothing drawn | | Rendering stops when nothing moves |

## 8. Layout and the camera

**Room first.** Cards take their room, then the camera frames the subject in the free room left over by shifting the projection centre. The art
is never squeezed and the camera never fights the cards.

| Device | Layout |
|---|---|
| Mac, iPad landscape | Teaching card top left; data card bottom right; figure in the rest |
| iPad portrait | Teaching card top; data card bottom; figure between |
| iPhone portrait | Figure on top; one card as a sheet at the foot; tap a vessel to pick it |
| iPhone landscape | **Wallet**: a 330 px column inside the 59 px safe area; one card centred, the other as a 44 px strip at the foot; tap or swipe to swap; figure on the right |

Safe areas are always respected (59 px at the sides in landscape, 59 top and 34 bottom in portrait).

## 9. Vessel highlight

The picked vessel gets a bolder outline in its own deep colour (white on the dark looks), which **runs on downstream and fades**, and reaches only
a short way upstream ("long ahead, short behind", from the 19 Nov highlight mocks). It also lifts a hair. **Nothing else is dimmed.** The data card
names the vessel, its pressure and flow, and the gradient with words ("PPG 14 · high").

## 10. Contrast

- Body text at least 4.5:1 against its card in every look; small data text at least 4.5:1; ink at least 3:1 against the organs it outlines.
- Every colour signal also has words or a shape (pill text, labels, flow direction).
- The Soft look's two proposed vessel tones (section 4) exist only for contrast; confirm or reject them.

## 11. Look questions: answers (Mohammad, 19 Nov, 2:23 PM ET)

1. **Bands:** 3 on organs, 2 on vessels, as in the mocks. Decided.
2. **Ink weight:** as in section 3. Decided for now; can change later.
3. **Soft look:** the two deeper vessel tones (`#A8306A` portal, `#3A74B8` systemic) are accepted.
4. **Flow marks:** option A (Mohammad, 19 Nov, 2:28 PM ET). Final. The setting stays so the others can be tried later.

| Option | What it looks like |
|---|---|
| **A (chosen)** | Chevrons in the 2D app's colours (black on light vessels, cream on dark, orange when reversed), on the vessels the slide talks about and the picked vessel; the rest still |
| B | The same chevrons on every vessel, fainter on the vessels the slide does not mention |
| C | Soft light bands (as in the mocks) on every vessel, speed from flow |
| D | Marks run only for a few seconds after a change (a new preset, a slider, a treatment), then fade, so the still figure is calm |
