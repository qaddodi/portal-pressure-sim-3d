// The clot's three flat tones, ONE set of colour uniforms every vessel and junction skin program shares by reference (the clot is painted in their fragment stages: clot-field.ts). The clot layer writes them on a look change.
import { Color } from 'three';
import { rawColor } from '../materials/cel.ts';
import { CLOT_TOKENS } from './paint.ts';

export const CLOT_TONES = { clotShade: { value: new Color() }, clotBase: { value: new Color() }, clotLift: { value: new Color() } };
/** Paints the tones (paint.ts clotTokens: per look). */
export function setClotTones(t: { shade: string; base: string; lift: string }): void {
  rawColor(t.shade, CLOT_TONES.clotShade.value); rawColor(t.base, CLOT_TONES.clotBase.value); rawColor(t.lift, CLOT_TONES.clotLift.value);
}
setClotTones(CLOT_TOKENS.light);
