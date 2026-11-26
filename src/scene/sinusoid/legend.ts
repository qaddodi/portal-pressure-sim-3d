// The sinusoid's key is not a legend any more (Mohammad, 26 Nov: "just callout the sinusoid somewhere with a leader and then move the protein legend to be a callout with a
// circle next to it"). THE RULE:
// a key entry that names a thing the figure draws is a callout ON the figure, a name with a leader to that thing, its mark (the swatch's circle in the thing's own colour) at the
// leader's end; the top bar
// keeps only the keys that name a SCALE (the lens key's ramps). A new entry for a thing in the sinusoid is added to SINUSOID_CALLOUTS and is a callout by being there: names.ts
// lays it out, SinusoidCaptions.tsx
// draws it, tests/protein-callout.test.ts holds every entry to the rule (and that nothing in the top bar names such a thing again).
import type { NameKey } from './names.ts';

/** The hepatocytes' face on Disse, µm from the sinusoid's axis (the lumen, the endothelium, the space of Disse: 5 + 0.8 + 3.4): where a tall screen's names must stay clear of. */
export const FACE_UM = 5 + 0.8 + 3.4;

/**
 * The ONE source of the protein's colour. The scene's particles (palette.copied.js reads `--sv-gl-albumin` for the fill and
 * `--sv-gl-albumin-edge` for the rim; view.ts resolves the first to `fill` here) and the callout's circle (SinusoidCaptions.tsx writes
 * these token names onto it) name the same two tokens, so the mark never promises a colour the particles do not wear, in any look.
 * Owner, 26 Nov: "in sinusoid view the legend that says Protein doesn't show a yellow circle resembling protein".
 */
export const ALBUMIN_TOKENS = { fill: '--albumin', edge: '--sv-gl-albumin-edge' } as const;

/** One callout that stands for a key entry: the name it is laid out as (names.ts), its word, and the circle at its leader's end, painted from the tokens of the thing it points at. */
export interface KeyCallout { readonly key: NameKey; readonly word: string; readonly mark: { readonly shape: 'circle'; readonly fill: string; readonly edge: string } }
/** Every callout the sinusoid's key became. tests/legend-swatches.test.ts pins each mark against the scene element it names. */
export const SINUSOID_CALLOUTS: readonly KeyCallout[] = [{ key: 'alb', word: 'Protein', mark: { shape: 'circle', ...ALBUMIN_TOKENS } }];
/** The callout for a name key, or undefined when the name is not a key entry. */
export const calloutOf = (key: string): KeyCallout | undefined => SINUSOID_CALLOUTS.find((c) => c.key === key);
/** The circle's diameter (px), as the key's swatch was (2D: .sv-legend i.alb { width: 8px; height: 8px }). */
export const MARK_PX = 8;
