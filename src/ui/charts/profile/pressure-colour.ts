// The pressure colour ramp (2D: colormap.js pressureColor): the look's --ramp-pressure stops, mixed in OKLab, read from a 256-step table over 0 to 35 mmHg,
// each colour rounded to whole 0-255 channels as the 2D app rounds it. The stops come from the 2D theme tokens (looks2d/theme-tokens.js) of the look.
import { tokensOfLook } from '../looks2d/theme-tokens.js';
import type { Rgba } from '../colour.ts';
import type { LookId } from '../../../looks/looks.ts';

const LUT_N = 256, LUT_MAX = 35;
const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const delin = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const ch255 = (c: number) => Math.round(Math.min(1, Math.max(0, delin(c))) * 255);

/** sRGB (0-1 each) to OKLab. */
export function toOklab(r: number, g: number, b: number): [number, number, number] {
  r = lin(r); g = lin(g); b = lin(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
/** OKLab to sRGB in whole numbers 0-255. */
export function fromOklab(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [ch255(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), ch255(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), ch255(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
}

/** A ramp token's stops: [position, '#rrggbb'] (cssRamp). */
export const rampStops = (text: string): [number, string][] => [...text.matchAll(/(#[0-9a-f]{6})\s+(-?[\d.]+)/gi)].map((m) => [+m[2]!, m[1]!]);

const luts = new Map<LookId, [number, number, number][]>();
function lutOf(look: LookId): [number, number, number][] {
  let lut = luts.get(look);
  if (lut) return lut;
  const stops = rampStops((tokensOfLook(look) as Record<string, string>)['ramp-pressure']!);
  if (stops.length < 2) throw new TypeError('a colour ramp needs two stops');
  const hex = (h: string, i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
  const lab = stops.map(([, h]) => toOklab(hex(h, 1), hex(h, 3), hex(h, 5)));
  lut = [];
  for (let i = 0; i < LUT_N; i++) {
    const p = (i / (LUT_N - 1)) * LUT_MAX;
    let k = 0;
    while (k < stops.length - 2 && p > stops[k + 1]![0]) k++;
    const p0 = stops[k]![0], t = Math.min(1, Math.max(0, (p - p0) / (stops[k + 1]![0] - p0)));
    const A = lab[k]!, B = lab[k + 1]!;
    lut.push(fromOklab(A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t, A[2] + (B[2] - A[2]) * t));
  }
  luts.set(look, lut);
  return lut;
}

/** The pressure's colour at p mmHg in `look`, as 0-255 channels. */
export function pressureRgb(look: LookId, p: number): [number, number, number] {
  return lutOf(look)[Math.round((Math.min(LUT_MAX, Math.max(0, p)) / LUT_MAX) * (LUT_N - 1))]!;
}
/** The same as a colour a frame draws with. */
export function pressureColour(look: LookId, p: number, alpha = 1): Rgba {
  const c = pressureRgb(look, p);
  return [c[0] / 255, c[1] / 255, c[2] / 255, alpha];
}
