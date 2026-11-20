// What the scene paints with, derived from the one looks table (src/looks/looks.ts: look-and-feel.md sections 2, 3, 4 and 9).
// The catheter's silver and the balloon's amber are the only tones the scene adds; the balloon is the look's caution colour.
import { LOOKS, LOOK_IDS, type LookId } from '../looks/looks.ts';
import { ORGAN_TONES_2D, type OrganTones2D } from '../looks/organ-tones.copied.ts';

export { LOOK_IDS };
export type { LookId };

/** Keys of the scene's painted parts. Vessel keys pick the tone; `cath` and `balloon` are the HVPG catheter. */
export type ToneKey = 'liver' | 'spleen' | 'kidney' | 'gut' | 'stomach' | 'heart' | 'portal' | 'sys' | 'cath' | 'balloon';

export interface Palette {
  /** Canvas clear colour, the app's ground. */
  bg: string;
  /** Flat body plate behind the organs (no shading, no ink). */
  body: string;
  ink: string;
  /** Shadow tone = base × shade, then 8% toward the ink (section 2). */
  shade: number;
  tones: Record<ToneKey, string>;
  /** Picked-vessel outline: white on the dark looks, the vessel's own deep colour (× 0.5) on the light ones (section 9). */
  highlight: 'deep' | 'white';
  /** 2D's organ painter for this look (--og-*: three tones per organ, light, dark, volume shade, the gut's opacity), copied by scripts/copy-organ-tones.mjs. */
  organs: OrganTones2D;
  /** The organ layer's opacity on the page (2D's #organs > .organ, Soft's own) and the kidney's own. */
  organLayer: number; kidneyLayer: number;
}

const CATHETER_LIGHT = '#C9CCD2';
const CATHETER_SOFT = '#C4C6CC';
const CATHETER_DARK = '#D9DBE0';

export function hexToRgb255(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const lin = (c: number) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
export function luminance(hex: string): number { const [r, g, b] = hexToRgb255(hex); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); }
export function contrast(a: string, b: string): number { const la = luminance(a), lb = luminance(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); }

/** Ink must stand off the organ it outlines by at least this (look-and-feel.md section 10 asks for 3:1; a hair over so rounding never lands under it). */
export const INK_ON_ORGAN = 3.05;

/** The organ tone as the scene paints it: the token itself when the ink already stands off it, otherwise the token lightened toward white
 *  (in sRGB, so the hue stays) by the least that reaches the ratio. Light and Soft's liver, spleen and heart are the ones that move (19 Nov,
 *  Mohammad: "do what you see best"). The cards' `--organ-*` variables keep the token, so only the 3D organs are a touch lighter. */
export function organTone(hex: string, ink: string): string {
  if (contrast(ink, hex) >= INK_ON_ORGAN) return hex;
  const [r, g, b] = hexToRgb255(hex);
  for (let t = 0.01; t <= 1; t += 0.01) {
    const mix = (c: number) => Math.round(c + (255 - c) * t);
    const out = '#' + [mix(r), mix(g), mix(b)].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
    if (contrast(ink, out) >= INK_ON_ORGAN) return out;
  }
  return '#FFFFFF';
}

/** Light's organ layer: a deliberate step from 2D's .55 (Mohammad, 19 Nov 2026: "Richer Light (layer .72)"), the same as Soft's, so the Light liver reads brown, not chalky. */
export const LIGHT_ORGAN_LAYER = 0.72;

/** The dark looks' organ layer (Dark, Navy, Black): 2D's .55 let the organs sink into the ground (Mohammad, 20 Nov: "the anatomy view should be more contrast, it's very basically dark now"); this is the step that lifts them clear of it
 *  while the vessels (brighter caps, cel-style TUBE.LCAP_DARK) still stand off them. Pinned by tests/dark-contrast.test.ts. */
export const DARK_ORGAN_LAYER = 0.72;

export function paletteFor(id: LookId): Palette {
  const l = LOOKS[id];
  const organ = (hex: string) => organTone(hex, l.ink);
  return {
    bg: l.bg, body: l.plate, ink: l.ink, shade: l.shadeK,
    highlight: l.scheme === 'dark' ? 'white' : 'deep',
    organs: ORGAN_TONES_2D[id], organLayer: id === 'light' ? LIGHT_ORGAN_LAYER : l.scheme === 'dark' ? DARK_ORGAN_LAYER : ORGAN_TONES_2D[id].layer, kidneyLayer: ORGAN_TONES_2D[id].kidney,
    tones: {
      liver: organ(l.liver), spleen: organ(l.spleen), kidney: organ(l.kidney), gut: organ(l.gut), stomach: organ(l.stomach), heart: organ(l.heart), portal: l.portal, sys: l.systemic,
      cath: id === 'light' ? CATHETER_LIGHT : id === 'soft' ? CATHETER_SOFT : CATHETER_DARK, balloon: l.caution,
    },
  };
}

export const PALETTES: Readonly<Record<LookId, Palette>> = Object.fromEntries(LOOK_IDS.map((id) => [id, paletteFor(id)])) as Record<LookId, Palette>;

/** The colour of a picked vessel's outline in a look (section 9). */
export function highlightColour(p: Palette, tone: ToneKey): string {
  // the dark looks lift the vessel's own tone toward white (a hard white band read as a block, 20 Nov); the light looks take half of it, deeper
  if (p.highlight === 'white') { const [r, g, b] = hexToRgb255(p.tones[tone]).map((v) => Math.round(v + (255 - v) * 0.6)); return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join(''); }
  const [r, g, b] = hexToRgb255(p.tones[tone]).map((v) => Math.round(v * 0.5));
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

const MARK_FORWARD = ['#14110D', '#F4EAD2'] as const;
const MARK_REVERSED = ['#FF8A2B', '#FFD2A0', '#6B2A00', '#3A1500'] as const;

/** Flow-mark colours for a vessel tone in a look: the 2D app's rule (black on light vessels, cream on dark; orange when flow reverses), chosen
 *  per vessel by contrast, since a "light" vessel is a different one in each look. Reversed stays orange-brown, light or deep as needed. */
export function flowMarkColours(p: Palette, tone: ToneKey): { forward: string; reversed: string } {
  const base = p.tones[tone];
  const best = (list: readonly string[]) => list.reduce((a, b) => (contrast(a, base) >= contrast(b, base) ? a : b));
  return { forward: best(MARK_FORWARD), reversed: best(MARK_REVERSED) };
}
