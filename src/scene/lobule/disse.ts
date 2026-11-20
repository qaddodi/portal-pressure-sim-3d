// The space of Disse's colour, as 2D tints it (lobule-zoom-field.js lyInkInto, DISSE_DEEP; lobule-zoom.js: the sleeve is `LYD`, the lymph's clear teal deepened by 0.85 x lyF as filtration rises). It is one flat tone:
// no light, no shadow, no outline (2D's WALL.ly is 0.2 px) and no marks, so the sleeve is a faint teal line beside each sinusoid, never a bar. The numbers are 2D's own, sRGB 0..1 (the cel shaders band in sRGB, rawColor);
// tests/scene-lobule-disse.test.ts holds every one to the pinned 2D file's text. (It was the palette's 'lymph' tone, a mint green on Light and a bright sage on Dark: olive beside 2D's teal.)
type RGB = readonly [number, number, number];
/** 2D's lymph tint by the lymph's protein (lyProt 0 to 1): the clear teal of the app's --tr-ivc, a touch deeper with more protein. */
const LY_LIGHT = { lo: [0.8, 0.91, 0.92], mid: [0.76, 0.9, 0.91], hi: [0.72, 0.88, 0.9] } as const;
const LY_DARK = { lo: [0.13, 0.33, 0.37], mid: [0.14, 0.36, 0.4], hi: [0.15, 0.39, 0.43] } as const;
/** What the sleeve deepens toward as filtration rises (2D DISSE_DEEP). */
const DISSE_DEEP: RGB = [0.5, 0.78, 0.82], DISSE_DEEP_DARK: RGB = [0.17, 0.48, 0.54];
export const DISSE_COLOURS = { LY_LIGHT, LY_DARK, DISSE_DEEP, DISSE_DEEP_DARK } as const;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** The lymph's clear tint (2D lyInkInto): `prot` is the protein as the lobule shades it, 0 (cirrhotic) to 1 (as plasma), model.ts lymphProtein. */
export function lymphTint(prot: number, dark: boolean): [number, number, number] {
  const c = dark ? LY_DARK : LY_LIGHT, p = Math.min(1, Math.max(0, prot));
  const [a, b, u] = p < 0.45 ? [c.lo, c.mid, p / 0.45] : [c.mid, c.hi, (p - 0.45) / 0.55];
  return [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
}

/** The sleeve's flat colour (2D LYD): the lymph's tint deepened by 0.85 x smooth(1, 4, lymphRate), the hepatic lymph as a multiple of the healthy rate. */
export function disseColour(prot: number, rate: number, dark: boolean): [number, number, number] {
  const ly = lymphTint(prot, dark), deep = dark ? DISSE_DEEP_DARK : DISSE_DEEP, f = 0.85 * smooth(1, 4, rate);
  return [lerp(ly[0], deep[0], f), lerp(ly[1], deep[1], f), lerp(ly[2], deep[2], f)];
}
