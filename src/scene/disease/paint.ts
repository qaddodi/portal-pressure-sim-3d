// A cel object in a colour the palette has no tone for (a clot's deep red, the dye, the blood): the object is made with the nearest tone and recoloured here,
// in the same way CelObject.applyPalette bands it (shadow = colour x shade, 8% toward the ink).
import { type CelObject, rawColor } from '../materials/cel.ts';
import { type Palette } from '../palette.ts';
import { LOOKS, type LookId } from '../../looks/looks.ts';
import { mix, rgbOf, type RGB } from '../organs/organ-look.ts';

export const hexOf = (c: RGB): string => '#' + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');

/** The look's danger red, deepened toward the ink: the clot's colour (2D: a deep translucent red, darkest where thickest). */
export function clotColour(look: LookId, p: Palette): RGB { return mix(rgbOf(LOOKS[look].danger), rgbOf(p.ink), 0.38); }
/** The look's danger red with a little of the plate: blood. */
export function bloodColour(look: LookId, p: Palette): RGB { return mix(rgbOf(LOOKS[look].danger), rgbOf(p.ink), 0.12); }

export function recolour(o: CelObject, c: RGB, p: Palette): void {
  const u = o.toon.uniforms, ink = rgbOf(p.ink);
  (u.color!.value as ReturnType<typeof rawColor>).setRGB(c[0], c[1], c[2]);
  (u.shade!.value as ReturnType<typeof rawColor>).setRGB(c[0] * p.shade * 0.92 + ink[0] * 0.08, c[1] * p.shade * 0.92 + ink[1] * 0.08, c[2] * p.shade * 0.92 + ink[2] * 0.08);
  (o.ink.uniforms.color!.value as ReturnType<typeof rawColor>).setRGB(ink[0], ink[1], ink[2]);
}
