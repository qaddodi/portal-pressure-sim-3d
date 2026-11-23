# Approved: step markers (the numbers 1, 2 on the figure and in the words)

**Reference:** option 4, "Words only", of the step-disc mocks (`/mnt/project-files/step-disc-mocks/step-disc-options.png`, `option-D.png`, `zoom-step-1.png`). Mohammad, 23 Nov 2026: "honestly, go with 4".

## Traits
- No disc, no glass, no face. The number is a bold numeral (Inter 700) in the text colour with the names' halo (`--lb-halo`), centred in the box the old disc had.
- On the figure: 1.75 x the names' size (21 px at 12). The leader (about 1.4 px, ink) and its dot are unchanged; a group's number keeps one leader to each vessel.
- In the words (`.pz-step`): the numeral alone, bold, text colour, on the words' baseline, .9em, no disc.
- Centred: `.cl[data-fig="step"]` has `align-items: center` (Inter's digits are centred on a line box at line-height 1).

- The talk-so-far chart's numbered stops (Pressure over the talk: 1 to 7 over the plot, the latest beside its year) follow the same rule (23 Nov, review bbe955e5 item 7): bold numeral with the card's halo, the latest in the full text colour, no ring.

## Rejected / replaced
- The white frosted disc with a dark numeral (the 19-23 Nov look). Replaced by his choice, not a bug.
- Not chosen: 1 plain centred disc, 2 ring-end leader, 3 gradient disc with a tapered leader.

## Never
- A glow, a pill, a chip or a dot-and-pill; a box behind the numeral.
