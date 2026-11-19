// The tones the lobule and the sinusoid add to the scene's palette (src/scene/palette.ts has the organs and the two vessel tones). They are derived
// from the same looks table, never typed per look, and added to a copy of the palette under extra keys, so the cel materials (CelObject.applyPalette)
// read them like any other tone. The scene thread may fold these keys into ToneKey later; nothing here depends on that.
import { LOOKS, type LookId } from '../../looks/looks.ts';
import { PALETTES, type Palette, type ToneKey, hexToRgb255 } from '../palette.ts';

export const EXTRA_TONES = [
  'cord1', 'cord2', 'cord3', 'floor', 'sin0', 'sin1', 'sin2', 'artery', 'bile', 'lymph', 'amber', 'collagen', 'stellate', 'kupffer', 'fen', 'disse',
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
/** The three zones' cord tones, from the look's liver tone (zone representatives q = 0.85, 0.5, 0.15). */
export function cordHex(liver: string, zone: 1 | 2 | 3, dark: boolean): string {
  const q = zone === 1 ? 0.85 : zone === 2 ? 0.5 : 0.15;
  const [r, g, b] = hexToRgb255(liver);
  // the 2D tone eases work in 0..1; the zone's deepening is stronger here so three flat bands read as three zones
  const c = cordTone([r / 255, g / 255, b / 255], q, dark);
  return hex(c[0] * 255, c[1] * 255, c[2] * 255);
}

/** The palette with the lobule's and sinusoid's own tones added. */
export function extendPalette(p: Palette, id: LookId): Palette {
  const l = LOOKS[id], dark = l.scheme === 'dark';
  const tones: Record<string, string> = { ...p.tones };
  tones.cord1 = cordHex(p.tones.liver, 1, dark);
  tones.cord2 = cordHex(p.tones.liver, 2, dark);
  tones.cord3 = cordHex(p.tones.liver, 3, dark);
  tones.floor = mix(l.plate, tones.cord2, 0.45);
  // blood in the sinusoid is portal blood becoming hepatic-vein blood: portal tone toward systemic by generation
  tones.sin0 = mix(p.tones.portal, p.tones.sys, 0.2);
  tones.sin1 = mix(p.tones.portal, p.tones.sys, 0.5);
  tones.sin2 = mix(p.tones.portal, p.tones.sys, 0.8);
  tones.artery = l.danger;
  tones.bile = dark ? '#A4AD5E' : '#7C8A34';
  tones.lymph = dark ? '#8FCFA0' : '#6FAE80';
  tones.amber = l.caution;
  tones.collagen = dark ? '#C9B692' : '#D8C6A0';
  tones.stellate = dark ? '#E0B25A' : '#C99432';
  tones.kupffer = dark ? '#8DB0D8' : '#5B7FAE';
  tones.fen = l.ink;
  tones.disse = mix(l.plate, tones.lymph, 0.35);
  return { ...p, tones: tones as Palette['tones'] };
}

/** The look's extended palettes, made once. */
export const LOBULE_PALETTES: Readonly<Record<LookId, Palette>> = Object.fromEntries(
  (Object.keys(PALETTES) as LookId[]).map((id) => [id, extendPalette(PALETTES[id], id)]),
) as Record<LookId, Palette>;
