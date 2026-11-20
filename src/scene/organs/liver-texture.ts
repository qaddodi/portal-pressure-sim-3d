// The cirrhotic liver's surface, drawn per pixel instead of per vertex (Mohammad 20 Nov 2026: "the texture of the liver is disgusting for cirrhosis").
// Root cause of the blocky look: the nodules were a jittered square grid (cells 0.15..0.85 of a square), and their septa were painted per VERTEX (a vertex every
// ~3 units) so a 1 to 2 unit septum came out as a staircase of tiles. Here the pattern is an irregular, size-varying (additively weighted) Voronoi of rounded
// domes, with the septum, the dome's light and its crevice shade baked into one small texture the organ shader samples per pixel, keyed on the vertex's rest place
// in the 2D figure (so the pattern follows the tissue as the liver reshapes). Pure arithmetic: a node test can run it.
// `?liver=a|b|c|d` (preview copy) picks one of four looks to compare; no flag keeps the old surface until one is chosen.

export type LiverLook = 'a' | 'b' | 'c' | 'd' | 'c1' | 'c2' | 'c3' | 'c4' | 'c2a' | 'c2b' | 'c2c' | 'c2d';
export const LIVER_LOOKS: readonly LiverLook[] = ['a', 'b', 'c', 'd', 'c1', 'c2', 'c3', 'c4', 'c2a', 'c2b', 'c2c', 'c2d'];

/** The texture's frame in 2D figure units (the liver's outline sits well inside it). */
export const TEX_X0 = 270, TEX_Y0 = 130, TEX_W = 660, TEX_H = 430;
const PX = 1.8;   // texels per 2D unit
export const TEX_PW = Math.round(TEX_W * PX), TEX_PH = Math.round(TEX_H * PX);

const hash = (i: number, j: number, k: number): number => { let h = (i * 374761393 + j * 668265263 + k * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
const sstep = (a: number, b: number, x: number): number => { const u = Math.min(1, Math.max(0, (x - a) / (b - a))); return u * u * (3 - 2 * u); };

/** Smooth value noise, 0..1. */
function vnoise(x: number, y: number, k: number): number {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, k), b = hash(ix + 1, iy, k), c = hash(ix, iy + 1, k), d = hash(ix + 1, iy + 1, k);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

interface Cell { edge: number; id: number; dx: number; dy: number }
/** An additively weighted Voronoi cell lookup at (x, y) 2D units, cell size `s` units: `edge` is how far (units) the point is inside its cell from the wall; (dx, dy) points from the cell's middle. */
function cell(x: number, y: number, s: number, jit: number, wvar: number, warp: number, seed: number): Cell {
  if (warp > 0) { x += (vnoise(x / 38, y / 38, seed + 11) - 0.5) * 2 * warp; y += (vnoise(x / 38 + 9, y / 38 + 4, seed + 12) - 0.5) * 2 * warp; }
  const gx = x / s, gy = y / s, ix = Math.floor(gx), iy = Math.floor(gy);
  let d1 = 9, d2 = 9, id = 0, bx = 0, by = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = ix + i + 0.5 + (hash(ix + i, iy + j, seed) - 0.5) * 2 * jit, cy = iy + j + 0.5 + (hash(ix + i, iy + j, seed + 1) - 0.5) * 2 * jit;
    const dx = gx - cx, dy = gy - cy, w = wvar * hash(ix + i, iy + j, seed + 2);
    const d = Math.hypot(dx, dy) - w;
    if (d < d1) { d2 = d1; d1 = d; id = hash(ix + i, iy + j, seed + 3); bx = dx; by = dy; } else if (d < d2) d2 = d;
  }
  return { edge: (d2 - d1) * s * 0.5, id, dx: bx, dy: by };
}

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

type Field = (x: number, y: number) => Surface;
const FIELDS: Record<string, { f: Field; /** mesh bump scale (a finer nodule than the mesh can show lifts less) */ bump: number; /** the shade's strength on the wash */ shade: number; /** tone spread */ tone: number }> = {
  // A: pebbled. Medium rounded nodules of mixed size, thin pale septa, soft shading: the 2D liver's nodules, but irregular and round.
  a: { bump: 1, shade: 0.34, tone: 0.5, f: (x, y) => {
    const c = cell(x, y, 21, 0.4, 0.3, 6, 1);
    return { sep: 1 - sstep(0.5, 1.9, c.edge), dome: round(c.edge, 6), tone: c.id, light: lit(c, 6, 0.55) };
  } },
  // B: bridged. Large nodules ringed by broad fibrous bands with small ones and hair septa inside: macronodular cirrhosis as a plate shows it.
  b: { bump: 0.9, shade: 0.3, tone: 0.4, f: (x, y) => {
    const big = cell(x, y, 40, 0.34, 0.3, 8, 21), small = cell(x, y, 15, 0.4, 0.22, 4, 31);
    const sepBig = 1 - sstep(0.9, 3.6, big.edge), sepSmall = 0.42 * (1 - sstep(0.3, 1.2, small.edge));
    return { sep: Math.max(sepBig, sepSmall), dome: round(big.edge, 9) * (0.6 + 0.4 * round(small.edge, 4)), tone: big.id * 0.6 + small.id * 0.4, light: Math.max(-1, Math.min(1, lit(big, 9, 0.5) * 0.7 + lit(small, 4, 0.3) * 0.5)) };
  } },
  // C: micronodular. Small, dense, even nodules with fine septa: the hobnail liver of early or alcohol-related cirrhosis. Reads as a grain, never a grid.
  c: { bump: 0.28, shade: 0.4, tone: 0.7, f: (x, y) => {
    const c = cell(x, y, 10.5, 0.42, 0.18, 3, 41);
    return { sep: 1 - sstep(0.3, 1.1, c.edge), dome: round(c.edge, 3), tone: c.id, light: lit(c, 3, 0.7) };
  } },
  // D: cel. The illustrated look: bold flat bands on each rounded nodule (a lit cap, a mid, a shaded foot) and a fine pale septum, like the figure's other cel organs.
  d: { bump: 1, shade: 0.42, tone: 0.25, f: (x, y) => {
    const c = cell(x, y, 25, 0.38, 0.3, 6, 51);
    const l = lit(c, 7, 0.9), band = l > 0.28 ? 0.8 : l < -0.25 ? -0.8 : 0;
    return { sep: 1 - sstep(0.35, 1.3, c.edge), dome: round(c.edge, 7), tone: c.id, light: band + (l - band) * 0.12 };
  } },
};

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
/** Micronodular, rounded (Mohammad 20 Nov: "micronodules more uniform in shape but different sizes", and "without so many variation in colour"): round nodules of mixed size, the tone spread nearly gone. */
function micro(size: number, rLo: number, rHi: number, jit: number, sepW: number, sepA: number, domeFrac: number, crev: number, seed: number): Field {
  return (x, y) => {
    const c = disc(x, y, size, rLo, rHi, jit, seed), w = Math.max(2, c.r * domeFrac);
    return { sep: sepA * (1 - sstep(-0.1, sepW, c.edge)), dome: c.edge <= 0 ? 0 : round(c.edge, w), tone: c.id, light: lit(c, w, crev) };
  };
}
// c1: round nodules, sizes 0.5 to 0.72 of a cell (they overlap, the wall lies between), tone spread a tenth. c2: a wider spread of sizes (small ones beside big ones), colour even. c3: small and flat: only the septum draws them.
// c4: no tone, the modelled dome carries them.
FIELDS.c1 = { bump: 0.28, shade: 0.3, tone: 0.1, f: micro(11, 0.36, 0.74, 0.26, 1.0, 1, 0.7, 0.55, 41) };
FIELDS.c2 = { bump: 0.28, shade: 0.26, tone: 0.04, f: micro(13, 0.34, 0.78, 0.26, 0.9, 0.85, 0.7, 0.5, 43) };
FIELDS.c3 = { bump: 0.2, shade: 0.14, tone: 0.05, f: micro(9.5, 0.36, 0.72, 0.26, 0.9, 0.8, 0.7, 0.35, 45) };
FIELDS.c4 = { bump: 0.35, shade: 0.4, tone: 0, f: micro(12, 0.38, 0.76, 0.26, 1.0, 0.9, 0.75, 0.7, 47) };

// Subtler c2 (Mohammad 20 Nov: "variations of c2, more subtle textures"): c2's round nodules of mixed size with the texture turned down in steps.
// c2a: the septa at 70%, the dome shade a quarter lower. c2b: septa at half, shade lower still, colour flat. c2c: no visible wall to speak of, the nodules read by soft light alone.
// c2d: the faintest: a hint of wall and light, the surface almost smooth.
FIELDS.c2a = { bump: 0.24, shade: 0.2, tone: 0.02, f: micro(13, 0.34, 0.78, 0.26, 0.9, 0.6, 0.7, 0.4, 43) };
FIELDS.c2b = { bump: 0.2, shade: 0.16, tone: 0, f: micro(13, 0.34, 0.78, 0.26, 0.9, 0.45, 0.7, 0.35, 43) };
FIELDS.c2c = { bump: 0.2, shade: 0.28, tone: 0, f: micro(13, 0.34, 0.78, 0.26, 0.9, 0.28, 0.75, 0.3, 43) };
FIELDS.c2d = { bump: 0.14, shade: 0.1, tone: 0, f: micro(13, 0.34, 0.78, 0.26, 0.9, 0.22, 0.75, 0.25, 43) };

/** The surface of look `k` at (x, y) in 2D units. */
export const surfaceAt = (k: LiverLook, x: number, y: number): Surface => FIELDS[k].f(x, y);
export const lookShade = (k: LiverLook): number => FIELDS[k].shade;
export const lookTone = (k: LiverLook): number => FIELDS[k].tone;
/** The dome at a point (0..1), whatever the look's bump scale: what the liver's outline follows. */
export const lookDome = (k: LiverLook, x: number, y: number): number => FIELDS[k]!.f(x, y).dome;
/** The nodule's bump for the mesh (0..1): the dome, scaled by how much of it the mesh can carry. */
export const lookBump = (k: LiverLook, x: number, y: number): number => FIELDS[k].bump * FIELDS[k].f(x, y).dome;

/** The texture bytes (RGBA, TEX_PW x TEX_PH, row 0 at TEX_Y0): R the septum, G the nodule's tone, B the light (0.5 none), A 255. */
export function bake(k: LiverLook): Uint8Array {
  const out = new Uint8Array(TEX_PW * TEX_PH * 4), f = FIELDS[k].f;
  for (let j = 0; j < TEX_PH; j++) {
    const y = TEX_Y0 + (j + 0.5) / PX;
    for (let i = 0; i < TEX_PW; i++) {
      const s = f(TEX_X0 + (i + 0.5) / PX, y), o = (j * TEX_PW + i) * 4;
      out[o] = Math.round(s.sep * 255); out[o + 1] = Math.round(s.tone * 255); out[o + 2] = Math.round((0.5 + 0.5 * s.light) * 255); out[o + 3] = 255;
    }
  }
  return out;
}
