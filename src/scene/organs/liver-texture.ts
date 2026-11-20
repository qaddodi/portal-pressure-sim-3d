// The cirrhotic liver's surface, drawn per pixel instead of per vertex (Mohammad 20 Nov 2026: "the texture of the liver is disgusting for cirrhosis", then "let's implement c2b").
// Root cause of the old blocky look: the nodules were a jittered square grid, and their septa were painted per VERTEX (a vertex every ~3 units) so a 1 to 2 unit
// septum came out as a staircase of tiles. Here the pattern is round nodules of mixed size (a lightly jittered grid of discs, each its own radius; the wall lies
// where two discs meet or in a gap), with the septum, the dome's light and its tone baked into one small texture the organ shader samples per pixel, keyed on the
// vertex's rest place in the 2D figure (so the pattern follows the tissue as the liver reshapes). Pure arithmetic: a node test can run it.


/** The texture's frame in 2D figure units (the liver's outline sits well inside it). */
import { flagValue } from '../../ui/debug/flags.ts';

export const TEX_X0 = 270, TEX_Y0 = 130, TEX_W = 660, TEX_H = 430;
const PX = 1.8;   // texels per 2D unit
export const TEX_PW = Math.round(TEX_W * PX), TEX_PH = Math.round(TEX_H * PX);

const hash = (i: number, j: number, k: number): number => { let h = (i * 374761393 + j * 668265263 + k * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const sstep = (a: number, b: number, x: number): number => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };

interface Cell { edge: number; id: number; dx: number; dy: number }

export interface Surface {
  /** septum 0..1 (the pale fibrous wall) */ sep: number;
  /** dome height 0..1 (1 in the middle of a nodule, 0 on a wall) */ dome: number;
  /** a nodule's own tone, 0..1 */ tone: number;
  /** dome light: -1 crevice / shaded side, +1 lit side */ light: number;
}
const LX = -0.6, LY = -0.8;   // the light's way in the 2D plane (upper left, y down)

/** A rounded dome of `edge` units from the wall, rounding over `w` units: 1 in the middle, a circular shoulder, 0 on the wall. */
const round = (edge: number, w: number): number => { const t = Math.min(1, Math.max(0, edge / w)); return Math.sqrt(1 - (1 - t) * (1 - t)); };

function lit(c: Cell, w: number, crevice: number): number {
  const t = Math.min(1, Math.max(0, c.edge / w)), slope = (1 - t) * (1 - t) * 0.6 + (1 - t) * 0.4;
  const l = Math.hypot(c.dx, c.dy) || 1;
  const facing = (c.dx * LX + c.dy * LY) / l;
  const ao = sstep(0, w * 0.55, c.edge);
  return Math.max(-1, Math.min(1, facing * slope * 1.5 - (1 - ao) * crevice));
}

/** A round nodule at (x, y): the nearest disc of a lightly jittered grid, every disc its own radius (rLo..rHi of a cell). `edge` is units inside the nodule's rim (negative in the gap between discs, which the septum fills), `r` its radius in units. */
function disc(x: number, y: number, s: number, rLo: number, rHi: number, jit: number, seed: number): Cell & { r: number } {
  const gx = x / s, gy = y / s, ix = Math.floor(gx), iy = Math.floor(gy);
  let best = -9, second = -9, id = 0, bx = 0, by = 0, br = 1;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = ix + i + 0.5 + (hash(ix + i, iy + j, seed) - 0.5) * 2 * jit, cy = iy + j + 0.5 + (hash(ix + i, iy + j, seed + 1) - 0.5) * 2 * jit;
    const r = rLo + (rHi - rLo) * hash(ix + i, iy + j, seed + 2), dx = gx - cx, dy = gy - cy, e = r - Math.hypot(dx, dy);
    if (e > best) { second = best; best = e; id = hash(ix + i, iy + j, seed + 3); bx = dx; by = dy; br = r; } else if (e > second) second = e;
  }
  // where two discs overlap the wall lies between them (best == second); in a gap no disc holds the point (best < 0)
  return { edge: Math.min(best, (best - second) * 0.5) * s, id, dx: bx, dy: by, r: br * s };
}
/** Cel mock-ups of the cirrhotic liver (Mohammad 20 Nov: "I hate the cirrhotic look, I want a celshaded look, and a change of colour"), `?liver=cel1..cel4` on the preview copy:
 *  clean round nodules with an ink line between them, the dome in two or three flat bands, and a tawny, olive, rust or straw colour. No flag: the c2b surface above. */
export interface Cel {
  name: string; /** the liver's colour at full scarring (sRGB hex) */ colour: string; /** share of it taken (0..1) */ a: number;
  /** flat tones on a nodule: 2 (body, shade) or 3 (lit cap, body, shade) */ bands: 2 | 3; /** ink line between nodules, 0..1 */ ink: number; /** band contrast on the wash */ shade: number;
  /** cell size in 2D units, disc radius range (of a cell) and grid jitter */ size: number; rLo: number; rHi: number; jit: number;
  /** the lit cap's and the shaded foot's thresholds on the dome light (-1..1) */ cap: number; foot: number;
  /** mesh bump scale (the base c2b is 0.2) and the rim's scallop scale (1 = 0.014) */ bump: number; rim: number;
  /** soft look (cel8..cel11, 20 Nov: "more cartoony, less dramatic, not flat"): the band edges ease over this much of the dome light (0: the hard bands above, a stair-step once baked) and the dome has a rounded valley
   *  (a cubic ease) instead of the disc's vertical wall, so the surface and the outline are gentle waves, never a serration */
  soft?: number;
  /** the "soft valleys" look (cel12, Mohammad 20 Nov: "it needs to be subtle"): no nodule grid at all; a smooth warped low-frequency field of broad irregular lobules, darkened only in its valleys by a few percent,
   *  no lit cap, no wall, no line; the rim waves with the same field. `size` is its wavelength in 2D units. */
  field?: true;
  /** how much of the mesh's own (bumpy) normal the organ's shade steps follow at full scarring, 0..1 (1: all, the old look; less: the smoothed rest normal, organ-shader.ts shadeK) */
  raw?: number;
}
const BIG = { size: 17, rLo: 0.46, rHi: 0.78, jit: 0.2, cap: 0.3, foot: -0.28, bump: 0.2, rim: 1 };
export const CELS: Record<string, Cel> = {
  cel1: { name: 'tawny ochre', colour: '#C98F3A', a: 0.62, bands: 3, ink: 0.7, shade: 0.34, ...BIG },
  cel2: { name: 'muted olive-tan', colour: '#A89A5C', a: 0.62, bands: 3, ink: 0.7, shade: 0.34, ...BIG },
  cel3: { name: 'desaturated rust', colour: '#A8634A', a: 0.58, bands: 2, ink: 0.9, shade: 0.3, ...BIG },
  cel4: { name: 'straw yellow', colour: '#D9B966', a: 0.62, bands: 3, ink: 0.55, shade: 0.3, ...BIG },
  // Cobbled, after the patient-education cirrhosis plate Mohammad sent (20 Nov): terracotta, the whole surface packed with small round bumps of mixed size, each a lit cap over a body over a
  // shaded underside, no ink lines between them (a faint crevice only), the outline lumpy all the way round.
  cel5: { name: 'terracotta, fine bumps', colour: '#B0603F', a: 0.74, bands: 3, ink: 0.16, shade: 0.4, size: 8.5, rLo: 0.42, rHi: 0.9, jit: 0.3, cap: 0.22, foot: -0.2, bump: 0.5, rim: 1.4 },
  cel6: { name: 'terracotta, chunkier bumps', colour: '#A95A3B', a: 0.74, bands: 3, ink: 0.16, shade: 0.42, size: 12, rLo: 0.4, rHi: 0.9, jit: 0.3, cap: 0.22, foot: -0.2, bump: 0.6, rim: 1.7 },
  cel7: { name: 'warm brown, finest bumps', colour: '#9A5238', a: 0.76, bands: 3, ink: 0.12, shade: 0.38, size: 6.5, rLo: 0.45, rHi: 0.92, jit: 0.32, cap: 0.2, foot: -0.18, bump: 0.4, rim: 1.2 },
  // The soft family (Mohammad 20 Nov: the cirrhotic liver "really looks rough"; he wants it "more cartoony and less dramatic and not flat"): bigger nodules, bands eased instead of cut, a gentle bump, a wavy rim.
  cel8: { name: 'broad soft nodules', colour: '#A8603F', a: 0.7, bands: 3, ink: 0.14, shade: 0.34, size: 20, rLo: 0.55, rHi: 0.86, jit: 0.18, cap: 0.35, foot: -0.3, bump: 0.28, rim: 1, soft: 0.4, raw: 0.5 },
  cel9: { name: 'pillow lumps', colour: '#A55C3C', a: 0.72, bands: 2, ink: 0.3, shade: 0.36, size: 15, rLo: 0.62, rHi: 0.95, jit: 0.2, cap: 0.3, foot: -0.22, bump: 0.35, rim: 1.1, soft: 0.3, raw: 0.5 },
  cel10: { name: 'quiet surface, wavy rim', colour: '#A8634A', a: 0.62, bands: 2, ink: 0.08, shade: 0.22, size: 26, rLo: 0.7, rHi: 0.95, jit: 0.15, cap: 0.3, foot: -0.2, bump: 0.12, rim: 1.4, soft: 0.5, raw: 0.3 },
  cel11: { name: 'knuckles, soft shade', colour: '#9E5538', a: 0.74, bands: 3, ink: 0.2, shade: 0.4, size: 11, rLo: 0.5, rHi: 0.85, jit: 0.25, cap: 0.3, foot: -0.2, bump: 0.38, rim: 1.2, soft: 0.18, raw: 0.6 },
  // Subtle (Mohammad 20 Nov, after cel8..cel11 "all suck... it needs to be subtle"; Opus's read: a regular grid, the same highlight on every nodule, a line round each cell and a strong tint all read as rough):
  // a smooth surface with a few broad faint shadowy dips, a few percent of shade, a slight warm-tan shift, and a gently waving rim (0.8 of the rim height: about 3 figure units).
  cel12: { name: 'soft valleys, subtle', colour: '#B07A45', a: 0.38, bands: 2, ink: 0, shade: 0.22, size: 60, rLo: 0, rHi: 1, jit: 0, cap: 0, foot: 0, bump: 0.15, rim: 0.8, soft: 1, raw: 0, field: true },
};
/** The standing cirrhotic liver is cel12, the subtle soft valleys (Mohammad 20 Nov: "it needs to be subtle", "let me see 1"; before it cel7, "Cel7 for now"); `?liver=cel1..cel11` shows the other cel options and `?liver=c2b` the earlier pale-nodule surface. */
export const DEFAULT_CEL = 'cel12';
export const celLook = (): Cel | null => { const v = flagValue('liver'); if (v === 'c2b') return null; return CELS[v ?? ''] ?? CELS[DEFAULT_CEL]!; };
/** Smooth value noise at (x, y) (one lattice unit = 1): a hash at each lattice point, blended by a quintic ease, 0..1, C2 across the lattice. */
function vnoise(x: number, y: number, seed: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const e = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const a = hash(ix, iy, seed), b = hash(ix + 1, iy, seed), c = hash(ix, iy + 1, seed), d = hash(ix + 1, iy + 1, seed), u = e(fx), v = e(fy);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** The soft lobes' height (0..1) at (x, y) in 2D units: two octaves (wavelength `wl` and half of it), the lattice warped by a third noise of a quarter of `wl`, so the lobes are broad and irregular and never a grid. */
export function softField(x: number, y: number, wl = 60): number {
  const wx = (vnoise(x / (wl * 0.28), y / (wl * 0.28), 7) - 0.5) * wl * 0.3, wy = (vnoise(x / (wl * 0.28), y / (wl * 0.28), 8) - 0.5) * wl * 0.3;
  const px = x + wx, py = y + wy;
  const v = 0.65 * vnoise(px / wl, py / wl, 11) + 0.35 * vnoise(px / (wl * 0.5) + 3.7, py / (wl * 0.5) + 1.3, 12);
  // value noise sits near the middle: widen it so the lobes use the whole 0..1
  return Math.min(1, Math.max(0, 0.5 + (v - 0.5) * 2.1));
}
function fieldSurface(x: number, y: number, cel: Cel): Surface {
  const h = softField(x, y, cel.size), valley = 1 - sstep(0.25, 0.6, h);
  // soft relief and no more: the valleys take a soft shade, the lobes' tops a faint lift (a third of it), no hard cap, no wall, no line (the first cut, a 5 % shade, read as no change at all on the device)
  return { sep: 0, dome: sstep(0, 1, h), tone: 0.5, light: -0.6 * valley + 0.35 * sstep(0.55, 0.9, h) };
}
function celSurface(x: number, y: number, cel: Cel): Surface {
  if (cel.field) return fieldSurface(x, y, cel);
  const c = disc(x, y, cel.size, cel.rLo, cel.rHi, cel.jit, 61), w = Math.max(2, c.r * 0.6);
  const l = lit(c, w, 0.2);
  // flat bands: the lit cap, the body, the shaded foot (a 2-band nodule drops the cap)
  const soft = cel.soft ?? 0;
  const light = soft > 0
    ? 0.9 * (cel.bands === 3 ? sstep(cel.cap - soft, cel.cap + soft, l) : 0) - 0.9 * (1 - sstep(cel.foot - soft, cel.foot + soft, l))
    : l > cel.cap && cel.bands === 3 ? 0.9 : l < cel.foot ? -0.9 : 0;
  const dome = c.edge <= 0 ? 0 : round(c.edge, w);
  // the line: crisp where nodules meet or part, faint on the cobbled looks
  return { sep: cel.ink * (1 - sstep(0.15, 0.75, c.edge)), dome: soft > 0 ? sstep(0, 1, dome) : dome, tone: 0.5, light };
}
/** The surface at (x, y) in 2D units: round nodules of mixed size (c2b of the options Mohammad picked from: size 13, discs 0.34 to 0.78 of a cell, septa at 45%, a soft dome shade). */
export function surfaceAt(x: number, y: number): Surface {
  const cel = celLook(); if (cel) return celSurface(x, y, cel);
  const c = disc(x, y, 13, 0.34, 0.78, 0.26, 43), w = Math.max(2, c.r * 0.7);
  return { sep: 0.45 * (1 - sstep(-0.1, 0.9, c.edge)), dome: c.edge <= 0 ? 0 : round(c.edge, w), tone: c.id, light: lit(c, w, 0.35) };
}
/** The shade's strength on the wash and the tone spread (none: the colour is the liver's own). */
export const SHADE = 0.16, TONE = 0;
export const shadeNow = (): number => celLook()?.shade ?? SHADE;
/** The nodule's bump for the mesh (0..1): the dome, scaled by how much of it the mesh can carry. */
export const noduleBumpAt = (x: number, y: number): number => (celLook()?.bump ?? 0.2) * surfaceAt(x, y).dome;
/** How much of the mesh's own normal the shade steps keep at full scarring (1: the standing look). */
export const rawNormalShare = (): number => celLook()?.raw ?? 1;
/** The rim's scallop scale (1: the standing 0.014). */
export const rimScale = (): number => celLook()?.rim ?? 1;
/** The dome at a point (0..1): what the liver's outline follows. */
export const domeAt = (x: number, y: number): number => surfaceAt(x, y).dome;

/** The texture bytes (RGBA, TEX_PW x TEX_PH, row 0 at TEX_Y0): R the septum, G the nodule's tone, B the light (0.5 none), A 255. */
export function bake(): Uint8Array {
  const out = new Uint8Array(TEX_PW * TEX_PH * 4), f = surfaceAt;
  for (let j = 0; j < TEX_PH; j++) {
    const y = TEX_Y0 + (j + 0.5) / PX;
    for (let i = 0; i < TEX_PW; i++) {
      const s = f(TEX_X0 + (i + 0.5) / PX, y), o = (j * TEX_PW + i) * 4;
      out[o] = Math.round(s.sep * 255); out[o + 1] = Math.round(s.tone * 255); out[o + 2] = Math.round((0.5 + 0.5 * s.light) * 255); out[o + 3] = 255;
    }
  }
  return out;
}
