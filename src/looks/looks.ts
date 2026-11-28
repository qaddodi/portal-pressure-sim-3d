// The five looks: UI tokens and 3D tones in one table (docs/look-and-feel.md sections 3 and 4).
// UI tokens become CSS custom properties on :root (applyLook); the 3D scene reads the same table through lookTones().
export type LookId = 'light' | 'soft' | 'dark' | 'navy' | 'black';
import { pressureViolet, pressureWine } from '../scene/lenses/pressure-ramp.ts';
import { TOKENS } from '../ui/charts/looks2d/theme-tokens.js';
export type LookChoice = LookId | 'system';
export const LOOK_IDS: readonly LookId[] = ['light', 'soft', 'dark', 'navy', 'black'];
export const LOOK_LABELS: Record<LookChoice, string> = { light: 'Light', soft: 'Soft', dark: 'Dark', navy: 'Navy', black: 'Black', system: 'System' };

export interface Look {
  scheme: 'light' | 'dark';
  bg: string; /** card surface */ card: string; /** glass pill/tag fill */ glass: string; text: string; text2: string; text3: string; accent: string; accentSoft: string;
  /** hairline edge of a card */ edge: string; /** shadow strength (alpha scale) */ sa: number;
  ok: string; caution: string; danger: string;
  /** ink on an accent fill (2D --on-accent, tokens.css: tests/colour-tokens.test.ts keeps the two equal) and on a danger fill (--on-danger, 3D's own) */ onAccent: string; onDanger: string;
  /** body plate behind the organs: flat, no shading, no ink */
  plate: string;
  /** hull outline colour */
  ink: string;
  /** shadow colour as "r g b" for rgb(var(--shadow-rgb) / a) */
  shadowRgb: string;
  /** organ tones */
  liver: string; spleen: string; gut: string; stomach: string; heart: string; /** the left kidney's own plum (2D --organ-kidney) */ kidney: string;
  /** vessel tones */
  portal: string; systemic: string;
  /** shadow-band multiplier on the base colour (spec section 2) */
  shadeK: number;
}

// Blush: the lighter palette for Light and Soft (Mohammad, 28 Nov 2026: "L2S2", picked from palette-mocks-28nov; docs/approved/palette-blush.md).
// Every tissue and organ is lighter, a little less chroma, a touch rosier (OKLab, hue -5 degrees).
// The far lobules are painted from their own two tones, a lighter cell over a deeper gap (--og-field-1 and -2),
// so they stay readable under the blur and the wash. Vessel identities, the pressure and flow ramps, the status colours and the grounds are untouched.
//
// The 2D token table (looks2d/theme-tokens.js) is generated and never edited, so the lobule's four tissue tokens are laid over it here, once, before any reader builds a look's tokens
// (it is part of looks.ts, which lz-colours.ts imports for it: one file fewer in the boot entry, whose file ceiling the separate file hit). The page's CSS variables carry the same values (lookVars), for the readers that take them from the document (the sinusoid's palette).

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

const darkOrgans = { liver: '#A88C82', spleen: '#93889A', kidney: '#A07E8E', gut: '#AC9289', stomach: '#A99088', heart: '#AE8387', portal: '#E06AA2', systemic: '#79AEEF' };
const darkSignals = { ok: '#34C38F', caution: '#F0B43C', danger: '#F2634D', onDanger: '#15140F', accent: '#7C9BFF', accentSoft: 'rgba(124,155,255,.13)' };

export const LOOKS: Record<LookId, Look> = {
  light: { scheme: 'light', bg: '#F1EBE0', card: '#FCF9F3', glass: 'rgba(252,249,243,.92)', text: '#1B1710', text2: '#463F34', text3: '#5A5347', accent: '#2E4BB8', accentSoft: 'rgba(46,75,184,.10)', edge: 'rgba(59,44,34,.12)', sa: 0.16, ok: '#157A58', caution: '#8F6208', danger: '#C23F2A', onAccent: '#FFFFFF', onDanger: '#FFFFFF',
    plate: '#E8DFD0', ink: '#3B2C22', shadowRgb: '46 22 34', ...BLUSH_ORGANS.light, portal: '#B8326F', systemic: '#3F7FCB', shadeK: 0.62 },
  // Soft's two vessel tones are the proposed deeper ones, accepted by the owner on 19 Nov.
  soft: { scheme: 'light', bg: '#DDD0B9', card: '#F0E9DC', glass: 'rgba(240,233,220,.84)', text: '#1F1A12', text2: '#463E31', text3: '#514838', accent: '#3652B8', accentSoft: 'rgba(54,82,184,.11)', edge: 'rgba(51,37,26,.14)', sa: 0.18, ok: '#0F6B57', caution: '#845200', danger: '#AA3622', onAccent: '#FFFFFF', onDanger: '#FFFFFF',
    plate: '#CEC6B7', ink: '#33251A', shadowRgb: '46 22 34', ...BLUSH_ORGANS.soft, portal: '#A8306A', systemic: '#3A74B8', shadeK: 0.62 },
  dark: { scheme: 'dark', bg: '#1A1917', card: '#242321', glass: 'rgba(30,29,27,.95)', text: '#EEEBE5', text2: '#B7B1A8', text3: '#A69E95', ...darkSignals, onAccent: '#15140F', edge: 'rgba(255,255,255,.08)', sa: 0.5, plate: '#262421', ink: '#0E0B09', shadowRgb: '0 0 0', ...darkOrgans, shadeK: 0.5 },
  navy: { scheme: 'dark', bg: '#0E1422', card: '#161E30', glass: 'rgba(16,23,42,.95)', text: '#E9EDF6', text2: '#A9B2C7', text3: '#8F99B3', ...darkSignals, onAccent: '#0B1120', edge: 'rgba(255,255,255,.08)', sa: 0.5, plate: '#1A2238', ink: '#05080F', shadowRgb: '0 0 0', ...darkOrgans, shadeK: 0.5 },
  black: { scheme: 'dark', bg: '#000000', card: '#0D0D0E', glass: 'rgba(10,10,11,.95)', text: '#F4F4F5', text2: '#B6B6BC', text3: '#9C9CA4', ...darkSignals, onAccent: '#0A0A0B', edge: 'rgba(255,255,255,.09)', sa: 0.6, plate: '#0F0F11', ink: '#000000', shadowRgb: '0 0 0', ...darkOrgans, shadeK: 0.5 },
};

/** The look a choice means right now ('system' follows the device). */
export function resolveLook(choice: LookChoice, prefersDark: boolean): LookId {
  return choice === 'system' ? (prefersDark ? 'dark' : 'light') : choice;
}

/** CSS custom properties for a look: the one list the page and its tests read. */
export function lookVars(id: LookId): Record<string, string> {
  const l = LOOKS[id];
  return {
    // (names as in docs/mocks/slice-mocks.html, which the cards thread codes to)
    '--bg': l.bg, '--surface': l.card, '--glass': l.glass, '--text': l.text, '--text-2': l.text2, '--text-3': l.text3,
    '--accent': l.accent, '--accent-soft': l.accentSoft, '--ok': l.ok, '--caution': l.caution, '--danger': l.danger, '--on-danger': l.onDanger,
    '--sys': l.systemic, '--edge': l.edge, '--sa': String(l.sa),
    '--organ-body': l.plate, '--ink': l.ink, '--shadow-rgb': l.shadowRgb,
    '--organ-liver': l.liver, '--organ-spleen': l.spleen, '--organ-gut': l.gut, '--organ-stomach': l.stomach, '--organ-heart': l.heart,
    '--vein-portal': l.portal, '--vein-systemic': l.systemic,
    // the lobule's tissue as Blush has it (blush.ts), for the readers that take it from the document
    ...(id === 'light' || id === 'soft' ? Object.fromEntries(Object.entries(BLUSH_TOKENS[id]).map(([k, v]) => ['--' + k, v])) : {}),
    // the pressure ramp's 12 and 20 mmHg stops as flat colours (CSS tints of the HVPG against PPG plane): the ramp's own (scene/lenses/pressure-ramp.ts), set inline so they beat the 2D stylesheet's copy
    '--ramp-violet': pressureViolet(id), '--ramp-wine': pressureWine(id),
  };
}

/** The tokens the 2D stylesheet (src/ui/styles/tokens.css) defines for each look, keyed on `data-theme` and `data-palette`. They are not written inline, or the inline value would beat the stylesheet and the lifted 2D chrome would keep a 3D colour. */
const TOKENS_FROM_2D = new Set(['--bg', '--surface', '--glass', '--text', '--text-2', '--text-3', '--accent', '--accent-soft', '--ok', '--caution', '--danger']);
/** 2D's attributes for a look (looks.js): Light, Soft and Dark are themes; Navy and Black are palettes of the dark theme. */
export function themeAttrs(id: LookId): { theme: 'light' | 'soft' | 'dark'; palette: 'navy' | 'black' | null } {
  if (id === 'navy' || id === 'black') return { theme: 'dark', palette: id };
  return { theme: id, palette: null };
}

export function applyLook(id: LookId, root: HTMLElement = document.documentElement): void {
  for (const [k, v] of Object.entries(lookVars(id))) { if (TOKENS_FROM_2D.has(k)) root.style.removeProperty(k); else root.style.setProperty(k, v); }
  const a = themeAttrs(id);
  root.dataset.theme = a.theme;
  if (a.palette) root.dataset.palette = a.palette; else delete root.dataset.palette;
  root.dataset.look = id;
  root.style.colorScheme = LOOKS[id].scheme;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', LOOKS[id].bg);
}

/** '#RRGGBB' → [r, g, b] in 0..1 (what a shader uniform takes). */
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
