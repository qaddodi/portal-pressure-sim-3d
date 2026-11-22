# Humanized design

The owner's standing design rules, in one place (22 Nov 2026). "Humanized" means the app looks and reads as if one careful person drew
and wrote it: a medical atlas and an attending's voice, not a generic AI interface. Read this before any UI, copy, mock or figure change.
Where this file and `docs/look-and-feel.md` differ, this file wins; where the owner says something new in a thread, he wins, and the
change is added here in the same push.

## 0. The hard bans (no exceptions, no "just this once")

| Never | Instead |
|---|---|
| A pill with a dot (`● Patent`), a status chip, a badge, a coloured dot before words | The state as plain words in its colour: "Patent" in `--ok`. A bar, a rule or the number itself carries the signal |
| Rows of rounded tiles, segmented pill toggles, icon-per-item grids, three cards in a row | Ruled rows and typography; a choice is underlined words; an action is plain text or a real button |
| Hint popups, coach marks, "Tip:" bubbles (owner: "don't half-ass it with popups") | Make the control say what it does. Hover hints stay as they are; nothing new pops up to explain |
| Anything that snaps, pops in, or steps colour | It glides or fades; colours blend as gradients (section 2) |
| Selectable text, pinch zoom | Text is not selectable (inputs are); page zoom stays disabled |
| Calculators (ANTICIPATE was dropped) | Teach with the model; the Child-Pugh/MELD card is the one kept |
| AI words in copy: delve, crucial, seamless, leverage, robust, "Let's", "Key takeaways", emoji | Plain words a person would say (section 4) |
| Decorative gradients, glow accents, neon on dark, drop shadows for show | Colour only where it means something; the one shadow is the card's soft lift |

Glass is the one owner exception to the usual "no glassmorphism" advice: cards, the bar and sheets are frosted like 2D's (owner, 19 Nov).
Keep it, but never add new glass surfaces or glows beyond it.

## 1. Before you design anything

- **Mock means mock.** If the owner asks to mock, show options or design styles: deliver pictures to compare, push nothing to the app until
  he picks. "He didn't like the mocks" is not permission to build.
- Load the `human-designer` (and for words, `human-writer`) skill before any mock.
- Check every mock against section 0 before sending. A mock with a dot-pill is a failed mock.
- Mocks use the app's real tokens, fonts and colour functions, and are checked at 4x before they are sent.
- Match 2D for layout, words, data and behaviour by default; depart only where it is clearly better, and say so.

## 2. Motion: everything eases

| Do | Don't |
|---|---|
| Every change glides or fades, palette changes included | A value, label, card or colour that changes in one frame |
| Card rail: old card out 340 ms, new card in 520 ms from the right after the old is gone; back reverses; one at a time | Two cards overlapping, a card fading in place, a card that resizes on arrival |
| A label's state change crossfades (`restyle()` in `src/scene/labels/roll.ts`) | Writing tone, text or visibility straight onto a showing label |
| Theme change: labels, chrome and scene fade together on one 320 ms token; components read `useLookId()` | A component reading `useSettings(s => s.look)` and turning colour ahead of the figure |
| Numbers roll (0.4 s, one roll time app-wide) | Digits that jump |
| Per-frame writes are `transform` and `opacity` only, on the one clock | Layout properties or React state per frame |
| Reduce Motion cross-fades (240-420 ms); nothing appears or vanishes in one frame | Treating Reduce Motion as "skip the transition" |

## 3. Layout

- **Cards:** side cards are 340 px on Mac and iPad landscape (`M.sideCardW`). The card stack is always vertically centred: top margin equals
  bottom margin.
- A card appears only when its content is laid out and its fonts are loaded. Text never shrinks below the floor (fitted data cards may shrink
  down to 12 px, then the card pages). Nothing scrolls inside a card; no card is taller than the screen.
- Chips on deck slides are compact like 2D's; slide choice buttons sit on one row.
- **Procedures use the one-row step rail** (`ProcRow.tsx`, `cards/proc-rail.ts`) for every procedure. Step names are measured and scaled to fit
  (10 px floor), wrap last, never an ellipsis. A per-step line sits under the rail and crossfades.
- **Settings and editors are ruled sheets** (layout M1, owner 22 Nov): plain rows on hairlines (name left, value and small line right, a chevron), no tiles; a row opens in place with its controls indented under it, no band, no margin line, no
  underline. A choice between words is told by weight (the chosen word heavier and darker), never a pill, thumb or underline; Done and status are plain words. One shared editor (`src/ui/action/stent/`) serves every stent card;
  `.ac-seg` and the stent chart's switch carry the same choice look. Not a grid of toggles.
- Room first: the cards take their room and the camera frames the subject in what is left.
- **The lens legend (key) stands where it reads best, and only when needed** (owner, 22 Nov: "just choose best location", "only use the lens legend when needed").
  It never floats over the figure between cards. A stream lens (Origin, First pass) names what the instrument card beside it counts, so its key is
  the first row of that data card (`CardKey.tsx`) and comes and goes with the card. A ramp lens (pressure, pressure drop, flow, heat) explains the
  figure's colouring, so it stands in the foot of the story card (`key-dock.ts`). It is shown only on a slide that changes the lens from the one
  before it, or has lens buttons of its own: a run of slides on one lens names it once. `keyPlace` in `scene/labels/key.ts` is the one rule.

## 4. Words

| Do | Don't |
|---|---|
| Talk to "you", with contractions: "That patient didn't load. Try again, or choose another from Patients." | "Error", "could not", "did not", "the 3D app" |
| Say what happened, then what to do, in one or two short sentences | Long notes that fade mid-sentence; internal details (`1200 of 5011 kB`) in front of a tester |
| Red only when something failed and the person must act | Red for a note that merely explains a choice the app made |
| Clinical text for US physicians: US spelling (esophagus, hemorrhage, color), standard terms (HVPG, WHVP, FHVP, PPG, CSPH, TIPS, EVL), "minus" or − for a subtraction, ≥10 mmHg with no space | Lay words ("scarring", "a tap"), metaphors, explaining what every physician knows |
| Baveno VIII is the only guideline named on screen; other sources live in the speaker notes | AASLD, EASL or Baveno VII on screen |
| Numbers say what they mean: "PPG 14 · high", "≥10 · CSPH"; colour always comes with words or a shape | Colour as the only signal |

Note timing follows length (about 250 ms a word, 3.2-10 s) and a note stays while a finger or pointer is on it.

## 5. The figure

- **Cel shaded:** clear flat bands, bold ink outlines, flat light from the upper left. Organs keep their original look (3-tone organ bands were
  tried and hated). The cirrhotic liver default is cel15: nodular outline, faint soft face, no drawn cells. Lobule fibrosis has no black ink.
- **Flow marks are 2D's chevrons**, never bands or stripes: 130 px pitch, calm and laminar in healthy vessels, turbulence only past a real
  narrowing. Bile and lymph carry streaks in their own colours.
- **Vessels like 2D:** connected, smooth tapers, proper junctions, no gaps, stubs, necks or flat ends. A vessel merging into a faded one fades
  on approach so both share the fade at the junction; open ends just fade, no cap.
- **Highlight is a glow**, in the item's own colour, fading toward both ends. No thicker outline, no recolour.
- **Devices are realistic, never cartoony**, and light, never dark-shaded: scopes slim, smooth, glossy black with fine white cm marks and a
  long creased bending section, always inside the esophagus; probes rest on the organ edge; beams and waves are see-through; tight, small,
  faint contact shadows only; TIPS stent warm champagne `#F2D488` at 55%, cells tiled by arc length. Banding adds nothing to the scope and
  never moves it.
- **Fluids** are volumetric with organic curves (ascites has real depth, no flat sides); see-through with a surface line.

## 6. Callouts and readouts

- **Callouts follow 2D:** a 4 px red ring, a red leader of the same weight, red words, a soft blur inside the ring, placed in clear space.
- Leaders never cross vessels; names clear the tube edge by 3 px; leaders keep 8 px of air; the © credit is a keep-out.
- **Readouts appear only once the reading has settled and the camera has settled**, never mid-dive or mid-zoom, and never flicker while measuring.
  A small move of what they point at is carried (they glide), not a cut.
- Labels on the figure are words with the labels' outline halo (station labels in their colour), not bubbles or pills with dots.

## 7. Self-check before you call it done

1. Section 0: any pill, dot, chip, badge, tile row, popup hint? Remove it.
2. Does anything change in one frame? Make it ease.
3. Read every on-screen line aloud: would a person say it, would an attending correct a word?
4. Does colour carry a meaning, and is it backed by words or a shape?
5. Would this pass for a page of a hand-drawn medical atlas next to the 2D app?
6. Look at it yourself on `/preview/` in the built-in browser (never headless). Until it has been seen on screen, report it as "pushed, not yet seen".

## Known places that still break these rules (fix at the root when touched)

- The toast (`.sh-toast` in `src/ui/shell/shell.css`) has an accent dot: being redesigned from the notes mocks in
  `/mnt/project-files/visual-mocks/notes/`. The error and wait notes (`ErrorNote`, `wait-cue`) go with it.
- Taken off (22 Nov): value, term, disease, case and lens pills in slide words (`.pz-val`, `.pz-dz`, `.pz-site`, `.pz-lens-t`), the ladders rate tags,
  the patient preview's facts, the Compare badge, the Trials and stent choices, the Over time trace toggles, the findings tool's lesion tags, the
  sinusoid key ("Protein" in its colour, no frosted pill, no dot), the History row's dot, and the capsules the charts drew themselves (Gut to heart's HVPG and PPG readings, the flows bar's names under narrow parts, the Path card's source, the Tests profile's bracket labels); `no-dot-pills.test.ts` fails a chart frame that draws a capsule. They live in `src/ui/humanized.css`, because `src/ui/css2d` is
  copied unchanged; `tests/no-dot-pills.test.ts` fails on any new pill, chip, badge or dot, or a 2D re-copy that brings one. A new exception needs a reason there.
- Kept on purpose: rounded bars of controls (`.zoom-pill`, `.float-pill`, `.pzb-pill`), the Treat card's ruled rows with a tick box, the step rail's dots (mock A),
  the Appearance swatches, the callout leaders' anchor dots on the figure, the build marker, the scope card's data cells (`.endo-chip`).
- `docs/look-and-feel.md` section 6 still describes figure tags as "small pills ... with a coloured dot": superseded by section 6 here.
