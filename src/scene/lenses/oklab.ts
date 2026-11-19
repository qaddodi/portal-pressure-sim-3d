// Lens ramps are interpolated in OKLab, as the 2D app's colormap.js does, so a ramp looks the same here. Colours are '#RRGGBB' in, sRGB 0..1 out
// (the scene's shaders band and write sRGB as is, see materials/cel.ts rawColor).
import type { Ramp } from './tokens.copied.ts';

export type Rgb = [number, number, number];
export type Lab = [number, number, number];

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const delin = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
export const hexToRgb01 = (hex: string): Rgb => { const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
export const rgb01ToHex = (c: readonly number[]): string => '#' + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('').toUpperCase();

export function toOklab([r, g, b]: Rgb): Lab {
  r = lin(r); g = lin(g); b = lin(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
export function fromOklab([L, a, b]: Lab): Rgb {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const c = (v: number) => Math.min(1, Math.max(0, delin(v)));
  return [c(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), c(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), c(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
}

/** A ramp ready to sample: stop positions and their OKLab colours. */
export interface Sampler { pos: number[]; lab: Lab[]; at(p: number, out?: Rgb): Rgb }

export function sampler(ramp: Ramp): Sampler {
  if (ramp.length < 2) throw new TypeError('a colour ramp needs two stops');
  const pos = ramp.map((s) => s[1]);
  const lab = ramp.map((s) => toOklab(hexToRgb01(s[0])));
  return {
    pos, lab,
    at(p, out = [0, 0, 0]) {
      const x = Math.min(pos[pos.length - 1]!, Math.max(pos[0]!, p));
      let k = 0;
      while (k < pos.length - 2 && x > pos[k + 1]!) k++;
      const t = Math.min(1, Math.max(0, (x - pos[k]!) / (pos[k + 1]! - pos[k]!)));
      const a = lab[k]!, b = lab[k + 1]!;
      const rgb = fromOklab([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]);
      out[0] = rgb[0]; out[1] = rgb[1]; out[2] = rgb[2];
      return out;
    },
  };
}

/** Straight three-colour scale (the Change lens: low, mid, high), interpolated in sRGB as the 2D app's deltaColor does. */
export function delta3(low: Rgb, mid: Rgb, high: Rgb, d: number, range = 12, out: Rgb = [0, 0, 0]): Rgb {
  const t = Math.max(-1, Math.min(1, d / range)), f = Math.abs(t), end = t < 0 ? low : high;
  for (let i = 0; i < 3; i++) out[i] = Math.round((mid[i]! + (end[i]! - mid[i]!) * f) * 255) / 255;
  return out;
}
