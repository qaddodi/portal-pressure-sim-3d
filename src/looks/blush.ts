// Blush: the lighter palette for Light and Soft (Mohammad, 28 Nov 2026: "L2S2", picked from palette-mocks-28nov; docs/approved/palette-blush.md).
// Every tissue and organ is lighter, a little less chroma, a touch rosier (OKLab, hue -5 degrees).
// The far lobules are painted from their own two tones, a lighter cell over a deeper gap (--og-field-1 and -2),
// so they stay readable under the blur and the wash. Vessel identities, the pressure and flow ramps, the status colours and the grounds are untouched.
//
// The 2D token table (looks2d/theme-tokens.js) is generated and never edited, so the lobule's four tissue tokens are laid over it here, once, before any reader builds a look's tokens
// (the readers import this file: looks.ts, lz-colours.ts). The page's CSS variables carry the same values (lookVars), for the readers that take them from the document (the sinusoid's palette).
import { TOKENS } from '../ui/charts/looks2d/theme-tokens.js';

/** The tissue tokens per look: the hepatocyte (-1), the gap between plates (-2) and the plate's line (-3) in the lobule, and the neighbours' own cell and gap (field). */
export const BLUSH_TOKENS: Readonly<Record<'light' | 'soft', Readonly<Record<string, string>>>> = {
  light: { 'og-liver-1': '#F6D0C4', 'og-liver-2': '#E1A395', 'og-liver-3': '#B17165', 'og-field-1': '#FFD0C0', 'og-field-2': '#B76C5C' },
  soft: { 'og-liver-1': '#D39987', 'og-liver-2': '#C27D66', 'og-liver-3': '#8E5845', 'og-field-1': '#E4967C', 'og-field-2': '#8C3414' },
};
/** The organs' base tones per look (the figure's liver, spleen, kidney, gut, stomach, heart). */
export const BLUSH_ORGANS: Readonly<Record<'light' | 'soft', Readonly<Record<'liver' | 'spleen' | 'kidney' | 'gut' | 'stomach' | 'heart', string>>>> = {
  light: { liver: '#AB7A6E', spleen: '#947E96', kidney: '#A27F99', gut: '#CBA293', stomach: '#C29A90', heart: '#B67880' },
  soft: { liver: '#9B6B5F', spleen: '#857088', kidney: '#94718A', gut: '#BA9284', stomach: '#B28A81', heart: '#A66971' },
};

for (const look of ['light', 'soft'] as const) Object.assign((TOKENS as Record<string, Record<string, string>>)[look]!, BLUSH_TOKENS[look]);
// (Dark, Navy and Black stack on Light, so the field tones are pinned to their own cell and gap: the neighbours there are painted as before.)
{
  const T = TOKENS as Record<string, Record<string, string>>;
  for (const look of ['dark', 'navy', 'black']) {
    const row = T[look]; if (!row) continue;
    row['og-field-1'] = row['og-liver-1'] ?? T.dark!['og-liver-1']!; row['og-field-2'] = row['og-liver-2'] ?? T.dark!['og-liver-2']!;
  }
}
