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
export interface Cel { name: string; /** the liver's colour at full scarring (sRGB hex) */ colour: string; /** share of it taken (0..1) */ a: number; /** flat tones on a nodule: 2 (lit, body) or 3 (lit, body, shade) */ bands: 2 | 3; /** ink line strength, 0..1 */ ink: number; /** band contrast on the wash */ shade: number }
export const CELS: Record<string, Cel> = {
  cel1: { name: 'tawny ochre', colour: '#C98F3A', a: 0.62, bands: 3, ink: 0.7, shade: 0.34 },
  cel2: { name: 'muted olive-tan', colour: '#A89A5C', a: 0.62, bands: 3, ink: 0.7, shade: 0.34 },
  cel3: { name: 'desaturated rust', colour: '#A8634A', a: 0.58, bands: 2, ink: 0.9, shade: 0.3 },
  cel4: { name: 'straw yellow', colour: '#D9B966', a: 0.62, bands: 3, ink: 0.55, shade: 0.3 },
};
export const celLook = (): Cel | null => { const v = flagValue('liver'); return v !== null && CELS[v] ? CELS[v]! : null; };
function celSurface(x: number, y: number, cel: Cel): Surface {
  const c = disc(x, y, 17, 0.46, 0.78, 0.2, 61), w = Math.max(3, c.r * 0.6);
  const l = lit(c, w, 0.2);
  // flat bands: the lit cap, the body, the shaded foot (a 2-band nodule drops the cap)
  const light = l > 0.3 && cel.bands === 3 ? 0.9 : l < -0.28 ? -0.9 : 0;
  // the ink line: a crisp bold wall where nodules meet or part
  return { sep: cel.ink * (1 - sstep(0.15, 0.75, c.edge)), dome: c.edge <= 0 ? 0 : round(c.edge, w), tone: 0.5, light };
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
export const noduleBumpAt = (x: number, y: number): number => 0.2 * surfaceAt(x, y).dome;
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
