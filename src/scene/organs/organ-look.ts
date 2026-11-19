// The colour an organ wears in a given state: the look's tone, taken toward grey by a lens other than Pressure, toward the plate when dimmed, ghosted
// (a removed spleen), dusky with congestion (the 2D figure's --lv-cong-base), tawny with cirrhosis (--lv-nod) and red with a bleed's blood.
// Pure arithmetic on sRGB triples (0..1), as the cel shaders band in sRGB (materials/cel.ts rawColor), so the tests run it without three.js.
import { LENS_GREY, LUMA } from '../disease/copied/anatomy-b4.ts';
import { smooth01 } from '../disease/copied/num.js';

export type RGB = readonly [number, number, number];
export const rgbOf = (hex: string): [number, number, number] => { const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
export const mix = (a: RGB, b: RGB, t: number): [number, number, number] => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** The 2D liver's congestion colours (tokens.css --lv-cong-base and its alpha, light looks and dark looks), its septa and its nodules. */
export const LIVER_TOKENS = {
  light: { cong: rgbOf('#6E1F38'), congA: 0.44, sep: rgbOf('#FFF4E6'), sepA: 0.25, nod: rgbOf('#C9955C'), nodA: 0.216 },
  dark: { cong: rgbOf('#2A0C18'), congA: 0.3, sep: rgbOf('#E8C4AE'), sepA: 0.21, nod: rgbOf('#6E4428'), nodA: 0.2025 },
};
/** A septum is painted twice as pale as 2D's flat fill (the 3D liver has no gloss beneath, so at 2D's strength a wall and a nodule would differ by 2%). */
export const SEPTUM_BOOST = 1;
/** How much of the pool's red the stomach wall takes below the blood's surface (the 2D pool is drawn at 0.92). */
export const POOL_TINT = 0.75;
/** The embolized spleen's dead part: the stage's colour at 0.8 (app-06-plate.css .pse-dead), and its edge line at 0.7. */
export const PSE_DEAD_A = 0.8, PSE_EDGE_A = 0.7;
/** What a lens other than Pressure does to the organs (organ-dim.js LENS_GREY), and the ghost a removed spleen is (stage-diaphragm.js: opacity 0.14). */
export { LENS_GREY };
export const SPLENIC_GHOST = 0.14;

import { QUIET_WASH } from '../camera/quiet.ts';

export interface OrganState {
  /** 1: the organ's own colours, 0: grey (a lens other than Pressure) */
  sat: number;
  /** 1: opaque, lower: toward the plate */
  dim: number;
  /** a ghosted organ: share of itself left (1 whole) */
  ghost: number;
  /** liver only: `septum` 0 inside a nodule, 1 on the pale fibrous wall between two (the 2D lv-sep under lv-nod) */
  congestion: number; tint: number; cirrhosisNod: number; septum: number;
  /** spleen only: the infarcted lower part, 0..1 (partial embolization), toward the stage's colour */
  dead: number;
  /** stomach only: blood in it, 0..1 */
  blood: number;
  /** quiet depth on a turn (camera/quiet.ts): 0 face on, 1 fully turned; the wash (not the ink) eases toward the plate by QUIET_WASH */
  quiet: number;
}
export const PLAIN: OrganState = { sat: 1, dim: 1, ghost: 1, congestion: 0, tint: 0, cirrhosisNod: 0, septum: 0, dead: 0, blood: 0, quiet: 0 };

export interface OrganInks { plate: RGB; dark: boolean; bleed: RGB; /** the stage's colour (2D --stage-bg) */ bg: RGB }

export function organColour(base: RGB, s: OrganState, k: OrganInks): [number, number, number] {
  let c: [number, number, number] = [base[0], base[1], base[2]];
  // congestion: the dusk comes in with the congestion, and the tint (sinusoidal pressure) hands over to it across g 0..0.5 (stage-diaphragm.js updateOrgans)
  const tk = k.dark ? LIVER_TOKENS.dark : LIVER_TOKENS.light;
  const dusk = Math.min(1, s.congestion * tk.congA * 1.6 + s.tint * (1 - smooth01(s.congestion / 0.5)) * 0.5);
  if (dusk > 0) c = mix(c, tk.cong, dusk);
  // cirrhosis: the pale septa lie over the whole liver and the tawny nodules over them, so a nodule is tawny on pale and a septum only pale (stage-organs.js lv.sep, lv.nod)
  if (s.cirrhosisNod > 0) {
    c = mix(c, tk.sep, s.cirrhosisNod * tk.sepA * (1 + SEPTUM_BOOST * s.septum));
    if (s.septum < 1) c = mix(c, tk.nod, s.cirrhosisNod * tk.nodA * (1 - s.septum));
  }
  if (s.dead > 0) c = mix(c, k.bg, PSE_DEAD_A * s.dead);
  if (s.blood > 0) c = mix(c, k.bleed, POOL_TINT * s.blood);
  if (s.sat < 1) { const l = LUMA[0]! * c[0] + LUMA[1]! * c[1] + LUMA[2]! * c[2]; c = [l + (c[0] - l) * s.sat, l + (c[1] - l) * s.sat, l + (c[2] - l) * s.sat]; }
  const a = s.dim * s.ghost * (1 - QUIET_WASH * s.quiet);
  if (a < 1) c = mix(k.plate, c, a);
  return c;
}
/** The ink colour of an organ: its own, faded the same way into the plate. */
export function organInk(ink: RGB, s: OrganState, k: OrganInks): [number, number, number] {
  const a = s.dim * s.ghost;
  return a < 1 ? mix(k.plate, ink, a) : [ink[0], ink[1], ink[2]];
}
