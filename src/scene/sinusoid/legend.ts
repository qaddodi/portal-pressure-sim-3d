// The Protein legend stands in the top bar beside the lens key (ProteinLegend.tsx; owner, 20 Nov), only while the sinusoid is the view.
export const legendOn = (view: string, drawn: boolean): boolean => view === 'sinusoid' && drawn;
/** The hepatocytes' face on Disse, µm from the sinusoid's axis (the lumen, the endothelium, the space of Disse: 5 + 0.8 + 3.4): where a tall screen's legend must stay clear of. */
export const FACE_UM = 5 + 0.8 + 3.4;

/**
 * The ONE source of the protein's colour. The scene's particles (palette.copied.js reads `--sv-gl-albumin` for the fill and
 * `--sv-gl-albumin-edge` for the rim; view.ts resolves the first to `fill` here) and the legend's swatch (ProteinLegend.tsx writes
 * these token names onto the swatch) name the same two tokens, so the key never promises a colour the particles do not wear, in any look.
 * Owner, 26 Nov: "in sinusoid view the legend that says Protein doesn't show a yellow circle resembling protein".
 * (The dot had been stripped with the pill on 22 Nov; a swatch in the scene's own colour is a figure mark, not a pill.)
 */
export const ALBUMIN_TOKENS = { fill: '--albumin', edge: '--sv-gl-albumin-edge' } as const;

/**
 * Every entry of the sinusoid's key: its word, the swatch's shape and the tokens the swatch is painted from.
 * tests/legend-swatches.test.ts pins each against the scene element it names.
 */
export const SINUSOID_KEY = [{ word: 'Protein', shape: 'circle', ...ALBUMIN_TOKENS }] as const;
