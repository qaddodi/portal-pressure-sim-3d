// A cel object in a colour the palette has no tone for (a clot's deep red, the blood): the object is made with the nearest tone and recoloured here,
// in the same way CelObject.applyPalette bands it (shadow = colour x shade, 8% toward the ink).
import { type CelObject, rawColor } from '../materials/cel.ts';
import { type Palette } from '../palette.ts';
import { LOOKS, type LookId } from '../../looks/looks.ts';
import { mix, rgbOf, type RGB } from '../organs/organ-look.ts';

export const hexOf = (c: RGB): string => '#' + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');

/** The look's danger red, deepened toward the ink: the clot's colour (2D: a deep translucent red, darkest where thickest). */
export function clotColour(look: LookId, p: Palette): RGB { return mix(rgbOf(LOOKS[look].danger), rgbOf(p.ink), 0.38); }

/** The clot's three cel tones (plan 11, mock A "Mural cast", /mnt/project-files/visual-mocks/clot/clot-mocks.html, acute): the mock's own hexes, per look; not re-picked. Soft takes Light's, Navy and Black take Dark's. The ink is the look's own. */
export const CLOT_TOKENS: Record<LookId, { shade: string; base: string; lift: string }> = {
  light: { shade: '#7c2c2c', base: '#9c4036', lift: '#bf5c4c' },
  soft: { shade: '#7c2c2c', base: '#9c4036', lift: '#bf5c4c' },
  dark: { shade: '#5b1d1f', base: '#7e2c2b', lift: '#a5413a' },
  navy: { shade: '#5b1d1f', base: '#7e2c2b', lift: '#a5413a' },
  black: { shade: '#5b1d1f', base: '#7e2c2b', lift: '#a5413a' },
};
export const clotTokens = (look: LookId): { shade: string; base: string; lift: string } => CLOT_TOKENS[look];
/** Paints a clot object with its three tones (uniforms of its fill program). */
export function paintClot(o: CelObject, t: { shade: string; base: string; lift: string }): void {
  const u = o.toon.uniforms;
  for (const [k, hex] of [['clotShade', t.shade], ['clotBase', t.base], ['clotLift', t.lift]] as const) {
    rawColor(hex, u[k]!.value as ReturnType<typeof rawColor>);
  }
}
/** The look's danger red with a little of the plate: blood. */
export function bloodColour(look: LookId, p: Palette): RGB { return mix(rgbOf(LOOKS[look].danger), rgbOf(p.ink), 0.12); }

export function recolour(o: CelObject, c: RGB, p: Palette): void {
  const u = o.toon.uniforms, ink = rgbOf(p.ink);
  (u.color!.value as ReturnType<typeof rawColor>).setRGB(c[0], c[1], c[2]);
  (u.shade!.value as ReturnType<typeof rawColor>).setRGB(c[0] * p.shade * 0.92 + ink[0] * 0.08, c[1] * p.shade * 0.92 + ink[1] * 0.08, c[2] * p.shade * 0.92 + ink[2] * 0.08);
  (o.ink.uniforms.color!.value as ReturnType<typeof rawColor>).setRGB(ink[0], ink[1], ink[2]);
}
