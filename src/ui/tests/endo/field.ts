// The scope's field as geometry (Tests › Endoscopy). The 2D app shades a per-pixel picture of the distal esophagus (endo-gl.js: a lumen seen down its axis, four varix columns
// winding along the wall, band knuckles) in a context of its own. The 3D app has one drawer for pictures like this (the charts' shared GL, src/ui/charts/gl.ts: flat-filled triangles), so the
// field is built there as a cel-shaded frame from the SAME columns: the shader's own formulas for where a column runs (endo-columns.copied.js columnAngle), how wide it is and how high it
// stands, where a knuckle sits and how large, and the same light model; each ring of the wall and each piece of a column is one flat colour. Pure (no DOM): tests/b11-endo.test.ts reads it.
import { columnAngle, columnConsts, FIELD_T, NCOL } from '../copied/endo-columns.copied.js';
import { nz, h2, sstep } from '../copied/endo-field.copied.js';
import { SCOPE_TOKENS } from '../copied/scope-tokens.copied.js';
import { parseColour, type Rgba } from '../../charts/colour.ts';

export { FIELD_T, NCOL };
export const TAU = Math.PI * 2;
const K = columnConsts() as { c0: number[]; c1: number[] };
/** the varix columns' own jitter of width (the shader's k1.z) */
const wj = (c: number) => K.c1[c * 4 + 2]!;

/** What the field shows (endo-gl.js shade(): grow, vis, red 0..1, def[4] (0 engorged .. 1 strangulated), kn[16] (0 none .. 1 a cinched band with its knuckle)). */
export interface FieldState { grow: number; vis: number; red: number; def: readonly number[]; kn: readonly number[] }

export const ampK = (grow: number) => 0.03 + 0.28 * grow;
/** a column's width in radians at rest (before deflation) */
export const w0full = (c: number, grow: number) => 0.055 + 0.27 * grow + wj(c);
export const w0 = (c: number, grow: number, df: number) => w0full(c, grow) * (1 - 0.2 * df);
/** the beading of a large varix along its length (1 for a small one) */
export const bead = (c: number, z: number, grow: number) => 1 + sstep(0.45, 0.6, grow) * 0.3 * Math.sin(2.3 * z + K.c0[c * 4 + 3]!);
/** where column c runs at depth z (radians clockwise from the right, y down) */
export const centreAt = (c: number, z: number, st: FieldState) => columnAngle(c, z, st.grow, st.def[c] ?? 0) as number;
/** the screen radius, in units of the lumen's radius, at depth z; and the depth at a radius */
export const rhoOf = (z: number) => 1 / (z * FIELD_T);
export const zOf = (rho: number) => 1 / (Math.max(rho, 0.01) * FIELD_T);


// ── colour: the shader's own tokens and light ──
const tok = (n: string): [number, number, number] => { const c = parseColour((SCOPE_TOKENS as Record<string, string>)[n]!); return [c[0] * 255, c[1] * 255, c[2] * 255]; };
const mixv = (a: number, b: number, t: number) => a + (b - a) * t;
const mix3 = (a: readonly number[], b: readonly number[], t: number | readonly number[]): [number, number, number] => {
  const k = typeof t === 'number' ? [t, t, t] : t;
  return [mixv(a[0]!, b[0]!, k[0]!), mixv(a[1]!, b[1]!, k[1]!), mixv(a[2]!, b[2]!, k[2]!)];
};
export const INK = {
  alb: tok('endo-mucosa'), deep: tok('endo-mucosa-deep'), zline: tok('endo-zline'), vessels: tok('endo-vessels'), small: tok('endo-varix-small'), varix: tok('endo-varix'), crest: tok('endo-crest'),
  halo: tok('endo-band-halo'), band: tok('endo-band'), near: tok('endo-light-near'), far: tok('endo-light-far'), glint: tok('endo-glint'), lumen: tok('endo-lumen'), wale: tok('red-wale'),
};

/** The mucosa at depth z before light (endo-gl.js: pale pink near the lens, warmer and redder with depth). */
export function mucosa(z: number): [number, number, number] {
  const tint = sstep(1.2, 7, z);
  return mix3(INK.alb, INK.deep, [tint * 0.7, tint * 0.8, tint * 0.65]);
}
/** The tip light on a smooth wall at depth z: the shader's diff · atten (NL = 1 / √(1 + z²) on a wall with no relief). */
export function wallLight(z: number): { diff: number; atten: number } {
  const d2 = 1 + z * z, NL = 1 / Math.sqrt(d2), atten = 1.7 / (1 + d2 * 0.12);
  return { diff: Math.min(1.1, NL * 0.72 + 0.3) * atten, atten };
}
/** A surface colour (0..255) under the tip light at depth z and screen radius rho (units of R): the light's own tint, the dark lumen far down, the lens's vignette, the display's gamma. */
export function lit(col: readonly number[], z: number, rho: number, o: { ao?: number; lift?: number; spec?: number } = {}): Rgba {
  const { diff } = wallLight(z), lc = mix3(INK.near, INK.far, sstep(1.5, 8, z)), ao = o.ao ?? 1, spec = o.spec ?? 0;
  let r = (col[0]! / 255) * diff * ao * (lc[0] / 255) * (o.lift ?? 1) + spec * 0.95, g = (col[1]! / 255) * diff * ao * (lc[1] / 255) * (o.lift ?? 1) + spec * 0.95, b = (col[2]! / 255) * diff * ao * (lc[2] / 255) * (o.lift ?? 1) + spec * 0.95;
  const lum = sstep(5.5, 18, z);
  r = mixv(r, INK.lumen[0] / 255, lum); g = mixv(g, INK.lumen[1] / 255, lum); b = mixv(b, INK.lumen[2] / 255, lum);
  const vg = 1 - 0.58 * sstep(0.64, 1, rho);
  const f = (x: number, e: number) => Math.min(1, Math.pow(Math.min(1.2, Math.max(0, x * vg)), e));
  return [f(r, 0.82), f(g, 0.92), f(b, 0.9), 1];
}
/** The profile of a column across its width, at u widths from the crest (the shader's exp(-|u|^2.6)). */
export const profile = (u: number) => Math.exp(-Math.pow(Math.abs(u), 2.6));
export { nz, h2, sstep };
