// Colours as [r, g, b, a] in 0..1 (straight alpha, sRGB), and the two mixes the 2D chart looks use: color-mix in srgb and in oklab,
// premultiplied, with a missing percentage the rest of 100 and a total under 100 lowering the alpha (CSS Color 5).

export type Rgba = readonly [number, number, number, number];

export const TRANSPARENT: Rgba = [0, 0, 0, 0];

/** '#RGB', '#RRGGBB', '#RRGGBBAA' or rgb()/rgba() text → Rgba. Anything else reads as opaque black (loud in a test, never a quiet fallback). */
export function parseColour(s: string): Rgba {
  const t = s.trim().toLowerCase();
  if (t === 'transparent' || t === 'none') return TRANSPARENT;
  if (t[0] === '#') {
    const h = t.length === 4 || t.length === 5 ? [...t.slice(1)].map((c) => c + c).join('') : t.slice(1);
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255;
    return [n(0), n(2), n(4), h.length >= 8 ? n(6) : 1];
  }
  const m = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/.exec(t);
  if (m) {
    const a = m[4] === undefined ? 1 : m[4].endsWith('%') ? parseFloat(m[4]) / 100 : parseFloat(m[4]);
    return [+m[1]! / 255, +m[2]! / 255, +m[3]! / 255, a];
  }
  return [0, 0, 0, 1];
}

export const withAlpha = (c: Rgba, a: number): Rgba => [c[0], c[1], c[2], Math.max(0, Math.min(1, c[3] * a))];

export const toCss = (c: Rgba): string => `rgba(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)}, ${+c[3].toFixed(3)})`;

const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gam = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function toOklab(c: Rgba): [number, number, number] {
  const r = lin(c[0]), g = lin(c[1]), b = lin(c[2]);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function fromOklab(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const c = (v: number) => Math.max(0, Math.min(1, gam(v)));
  return [c(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s), c(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s), c(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)];
}

/** color-mix(in <space>, a pa%, b pb%). pb defaults to 100 − pa. */
export function mix(space: 'srgb' | 'oklab', a: Rgba, pa: number, b: Rgba, pb?: number): Rgba {
  let p1 = pa, p2 = pb ?? 100 - pa;
  const sum = p1 + p2;
  if (sum <= 0) return TRANSPARENT;
  const k = Math.min(1, sum / 100);
  p1 /= sum; p2 /= sum;
  const alpha = a[3] * p1 + b[3] * p2;
  if (alpha <= 0) return TRANSPARENT;
  const ch = (c: Rgba): [number, number, number] => (space === 'oklab' ? toOklab(c) : [c[0], c[1], c[2]]);
  const ca = ch(a), cb = ch(b);
  // premultiplied interpolation, then back
  const v = [0, 1, 2].map((i) => (ca[i]! * a[3] * p1 + cb[i]! * b[3] * p2) / alpha) as [number, number, number];
  const out = space === 'oklab' ? fromOklab(v[0], v[1], v[2]) : v;
  return [out[0], out[1], out[2], alpha * k];
}

/** Relative luminance (WCAG) and contrast ratio, for the tests that judge a chart's text. */
export const luminance = (c: Rgba) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
export function contrast(a: Rgba, b: Rgba): number {
  // a over an opaque b
  const o: Rgba = [a[0] * a[3] + b[0] * (1 - a[3]), a[1] * a[3] + b[1] * (1 - a[3]), a[2] * a[3] + b[2] * (1 - a[3]), 1];
  const x = luminance(o) + 0.05, y = luminance(b) + 0.05;
  return Math.max(x, y) / Math.min(x, y);
}
