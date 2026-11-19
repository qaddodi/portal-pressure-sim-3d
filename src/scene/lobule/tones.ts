// The tones the lobule and the sinusoid add to the scene's palette (src/scene/palette.ts has the organs and the two vessel tones). They are derived
// from the same looks table, never typed per look, and added to a copy of the palette under extra keys, so the cel materials (CelObject.applyPalette)
// read them like any other tone. The scene thread may fold these keys into ToneKey later; nothing here depends on that.
import { LOOKS, type LookId } from '../../looks/looks.ts';
import { PALETTES, type Palette, type ToneKey, hexToRgb255 } from '../palette.ts';

export const EXTRA_TONES = [
  'cord1', 'cord2', 'cord3', 'floor', 'field', 'sin0', 'sin1', 'sin2', 'artery', 'bile', 'lymph', 'amber', 'collagen', 'stellate', 'kupffer', 'fen', 'disse', 'endo', 'nucleus', 'bileLight',
] as const;
export type ExtraTone = (typeof EXTRA_TONES)[number];

/** For CelOptions.tone, which is typed to the scene's own keys. */
export const tone = (t: ExtraTone | ToneKey): ToneKey => t as ToneKey;

const hex = (r: number, g: number, b: number) => '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('').toUpperCase();
const mix = (a: string, b: string, t: number) => { const A = hexToRgb255(a), B = hexToRgb255(b); return hex(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t); };

/** A hepatocyte's colour by its zone (the 2D cordTone): zone 3, around the central vein, is deeper and warmer (blue drops most, red least). q = 0 at the central vein, 1 at the portal edge. */
export function cordTone(rgb: [number, number, number], q: number, dark = false): [number, number, number] {
  const t = Math.min(1, Math.max(0, (q - 0.3) / 0.45)), s = t * t * (3 - 2 * t);
  const k = (dark ? 0.12 : 0.16) * (1 - s);
  return [rgb[0] * (1 - 0.35 * k), rgb[1] * (1 - 0.8 * k), rgb[2] * (1 - k)];
}
/** The hepatocyte's own tone per look, the 2D lobule's pale salmon plates (the handout shots: about #D0A39E between the cords, #C58B74 in congested zone 3), not the organ's liver brown. */
const CELL_BASE: Record<'light' | 'soft' | 'dark', string> = { light: '#DCA898', soft: '#CD9684', dark: '#B58C84' };
/** The three zones' cord tones. Zone 3 (around the central vein) is deeper and warmer, as the 2D cordTone does it. */
export function cordHex(look: LookId, zone: 1 | 2 | 3, dark: boolean): string {
  const q = zone === 1 ? 0.85 : zone === 2 ? 0.5 : 0.15;
  const base = LOOKS[look].scheme === 'dark' ? CELL_BASE.dark : look === 'soft' ? CELL_BASE.soft : CELL_BASE.light;
  const [r, g, b] = hexToRgb255(base);
  const c = cordTone([r / 255, g / 255, b / 255], q, dark);
  return hex(c[0] * 255, c[1] * 255, c[2] * 255);
}

/** The palette with the lobule's and sinusoid's own tones added. Values come from the 2D tokens (styles/tokens.css --lz-*, --sv-gl-*), per scheme. */
export function extendPalette(p: Palette, id: LookId): Palette {
  const l = LOOKS[id], dark = l.scheme === 'dark';
  const tones: Record<string, string> = { ...p.tones };
  tones.cord1 = cordHex(id, 1, dark);
  tones.cord2 = cordHex(id, 2, dark);
  tones.cord3 = cordHex(id, 3, dark);
  // the tissue between the plates: a little deeper than the cells, so each tile reads as a tile
  tones.floor = mix(tones.cord2, l.ink, dark ? 0.1 : 0.14);
  // the neighbouring lobules: the same tissue with a third of its contrast cut, toward the page (NEIGHBOUR_FLAT)
  tones.field = mix(tones.floor, l.bg, 0.3);
  // blood in the sinusoid is portal blood becoming hepatic-vein blood: portal tone toward systemic by generation (the lens colours override it on the tubes)
  tones.sin0 = mix(p.tones.portal, p.tones.sys, 0.2);
  tones.sin1 = mix(p.tones.portal, p.tones.sys, 0.5);
  tones.sin2 = mix(p.tones.portal, p.tones.sys, 0.8);
  tones.artery = l.danger;
  tones.bile = dark ? '#A3A55F' : '#7C8040';          // --bile-duct, --lz-duct-cell
  tones.lymph = dark ? '#6F9A7C' : '#CBE2C0';          // --lz-lymph over the cells: a clear, faint green (paler than the bile duct)
  tones.amber = l.caution;
  tones.collagen = dark ? '#C9B692' : '#CDAF7E';       // --lz-septum / --collagen, deeper so it reads on the pale cells
  tones.stellate = dark ? '#C99A72' : '#D9AE82';       // --sv-gl-hsc-quiet over --sv-gl-hsc-active
  tones.kupffer = dark ? '#9C86C6' : '#B296D6';        // --sv-gl-kupffer
  tones.fen = l.ink;
  tones.disse = mix(tones.cord2, tones.lymph, dark ? 0.55 : 0.7);
  tones.endo = dark ? '#7C7694' : '#D2CBE6';           // --sv-gl-endo-sheet
  tones.nucleus = dark ? '#7A4F63' : '#9A6272';        // --sv-gl-nucleus, lighter so the cell stays pink around it
  tones.bileLight = mix(tones.cord2, tones.bile, 0.35);
  return { ...p, tones: tones as Palette['tones'] };
}

/** The look's extended palettes, made once. */
export const LOBULE_PALETTES: Readonly<Record<LookId, Palette>> = Object.fromEntries(
  (Object.keys(PALETTES) as LookId[]).map((id) => [id, extendPalette(PALETTES[id], id)]),
) as Record<LookId, Palette>;
