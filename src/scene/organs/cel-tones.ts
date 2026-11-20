// The cel shaded organs' colours (Mohammad, 20 Nov 2026: "the colors are wrong"): the base of each organ is its own 2D tone, og-N-2 of the look (Dark's liver is 2D's brown-red), flat; the shade and the lit are the same hue and saturation,
// one flat lightness step darker and lighter (CEL_STYLE.ORGAN.TONES), never mixed toward white, black or the grey og-light / og-dark, so a dark look's liver stays brown-red in all three tones and nothing glosses.
// Pure arithmetic on sRGB (0..1), so the tests run it without three.js. The see-through wash does not read this file.
import { CEL_STYLE } from '../cel-style.ts';
import type { LookId } from '../palette.ts';
import { ORGAN_TONES_2D, type OrganTones2D } from '../../looks/organ-tones.copied.ts';
import { LOOK_IDS } from '../palette.ts';
import { rgbOf, type RGB } from './organ-look.ts';

export type CelOrgan = 'liver' | 'spleen' | 'stomach' | 'eso' | 'heart' | 'ra' | 'kidney' | 'bowel' | 'colon';
export const CEL_ORGANS: readonly CelOrgan[] = ['liver', 'spleen', 'stomach', 'eso', 'heart', 'ra', 'kidney', 'bowel', 'colon'];
/** The 2D tone set each cel organ takes (2D gives the small bowel and the colon one, `gut`). */
export const TOKEN_OF: Record<CelOrgan, keyof OrganTones2D['tones']> = { liver: 'liver', spleen: 'spleen', stomach: 'stomach', eso: 'eso', heart: 'heart', ra: 'ra', kidney: 'kidney', bowel: 'gut', colon: 'gut' };

/** The look a palette's organ tokens belong to. */
export const lookOfOrgans = (o: OrganTones2D): LookId => LOOK_IDS.find((id) => ORGAN_TONES_2D[id] === o) ?? 'light';

/** The organ's id in the scene's organ layer (layer.ts ORGAN_STYLE) to its cel organ; the duodenum wears the stomach's tone. */
export const CEL_OF: Record<string, CelOrgan> = {
  heart: 'heart', 'heart-ra': 'ra', liver: 'liver', spleen: 'spleen', stomach: 'stomach', duodenum: 'stomach', 'kidney-l': 'kidney', bowel: 'bowel', colon: 'colon',
};

function toHsl(c: RGB): [number, number, number] {
  const [r, g, b] = c, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (d < 1e-9) return [0, 0, l];
  const s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function fromHsl(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}
/** `h` turned toward `target` (degrees) by at most `max`, along the short way round. */
function turn(h: number, target: number, max: number): number {
  const d = ((target - h + 540) % 360) - 180;
  return (h + Math.max(-max, Math.min(max, d)) + 360) % 360;
}

export interface CelTones { shade: RGB; base: RGB; lit: RGB; /** a darker, ink-like tone for the art's fine lines */ line: RGB }

/** The three tones of a base colour: the same hue and saturation, lightness a step down and a step up (CEL_STYLE.ORGAN.TONES). */
export function tonesOf(base: RGB): CelTones {
  const T = CEL_STYLE.ORGAN.TONES, [h, s, l] = toHsl(base);
  const shade = fromHsl(h, s, Math.max(0, l - Math.max(l * T.SHADE_L, T.SHADE_MIN)));
  const lit = fromHsl(h, s, Math.min(1, l + Math.max((1 - l) * T.LIT_L, T.LIT_MIN)));
  const line = fromHsl(h, s, l * (1 - T.LINE_L));
  return { shade, base, lit, line };
}

/** The base colour of an organ in a look: its 2D tone og-N-2, exactly. */
export const celBase = (look: LookId, organ: CelOrgan): RGB => rgbOf(ORGAN_TONES_2D[look].tones[TOKEN_OF[organ]][1]);
/** The shade, base and lit tones of an organ in a look. */
export const celTones = (look: LookId, organ: CelOrgan): CelTones => tonesOf(celBase(look, organ));
