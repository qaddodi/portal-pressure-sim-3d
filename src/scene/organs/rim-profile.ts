// The tilt of an organ's surface in from its silhouette, as a smooth function of the distance from the rim. The organ files are 2D's outlines inflated into pillows whose height depends only on the distance to the
// outline (art/organs-simple/build.py zprof: sqrt(1 - (1 - t)^2), t = distance / radius), so the surface stands up vertical at the rim and flattens within a few units: the cel shade (organ-shader.ts: the dark crescent on the
// lower right, the lit edge on the upper left, the depth steps) lives in exactly that strip. Cut by the interpolated vertex normal, that strip is one or two rows of 5-unit triangles whose own rows are not
// equally far from the rim, and the crescent's edge came out as the triangles' saw-teeth (Mohammad, 22 Nov: "how is this smoothed?"). So in the strip the shader takes the tilt from the profile at the pixel's
// INTERPOLATED distance to the rim (a linear field: its contours are parallel to the rim whatever the triangulation) and keeps the interpolated normal only for the direction round the rim.
// The profile is measured from each organ's own smoothed normals when it is built (prepare.ts), so the look is the one it had; only its jag is gone. This file is the JS twin of the GLSL in organ-shader.ts.

/** How far in the profile reaches, scene units (0.03: 9 of the figure's units), and the number of points it is sampled at (evenly, the first on the rim, the last at ZONE). */
export const RIM_ZONE = 0.03;
export const RIM_KNOTS = 8;
/** The speck guard (both twins): the strip's direction round the rim, n.xy / |n.xy|, is noise where the shade normal nearly faces the eye, and across one pixel it swings by up to 180 degrees there. The strip's share therefore fades in with |n.xy| from
 *  RIM_SPECK[0] (none) to RIM_SPECK[1] (all). The healthy pillows (heart, spleen, kidney, liver) have no pixel of the strip below 0.3 and are not touched; the stomach, the bowel and the duodenum, which have face-on patches inside their strip, are. */
export const RIM_SPECK = [0.1, 0.3] as const;

/** The profile of `nz` (a normal's z, 1 flat to 0 edge-on) against `rimD` (scene units) over the FRONT surface (the shader draws no other), from samples (prepare.ts: points inside the strip's triangles): the median of those near each knot, rising from the rim inward, to 4 places.
 *  Empty knots take their neighbours'. */
export function fitRimProfile(rimD: ArrayLike<number>, nz: ArrayLike<number>): number[] {
  const step = RIM_ZONE / (RIM_KNOTS - 1), bins: number[][] = Array.from({ length: RIM_KNOTS }, () => []);
  for (let i = 0; i < rimD.length; i++) { const d = rimD[i]!; if (d < RIM_ZONE - 1e-6) bins[Math.min(RIM_KNOTS - 1, Math.round(d / step))]!.push(nz[i]!); }
  const prof = bins.map((b) => { if (!b.length) return NaN; b.sort((x, y) => x - y); return b[b.length >> 1]!; });
  for (let i = 0; i < RIM_KNOTS; i++) if (Number.isNaN(prof[i]!)) { let j = i - 1; while (j >= 0 && Number.isNaN(prof[j]!)) j--; let k = i + 1; while (k < RIM_KNOTS && Number.isNaN(prof[k]!)) k++; prof[i] = j >= 0 ? prof[j]! : k < RIM_KNOTS ? prof[k]! : 1; }
  for (let i = 1; i < RIM_KNOTS; i++) prof[i] = Math.max(prof[i]!, prof[i - 1]!);   // (a surface never turns back toward the eye going in)
  return prof.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 1e4) / 1e4);
}

/** The profile at `s` (0 at the rim, 1 at ZONE): piecewise linear between the knots. */
export function rimProfileAt(prof: readonly number[], s: number): number {
  const f = Math.min(1, Math.max(0, s)) * (RIM_KNOTS - 1), i = Math.min(RIM_KNOTS - 2, Math.floor(f)), t = f - i;
  return prof[i]! * (1 - t) + prof[i + 1]! * t;
}

/** How a vertex's own tilt differs from its organ's profile, smoothed over the surface (`excess` is per vertex: nz less the profile where the vertex is on the front in the zone, 0 elsewhere): the part of the shape that is
 *  the region's own (a thicker lobe, a narrow neck) and varies slowly round the rim, which the profile alone would iron out. Baked as one byte, 0.5 being none. */
export function rimOffsetByte(c: number): number { return Math.round((Math.min(0.5, Math.max(-0.5, c)) + 0.5) * 255); }

/** The shade normal in the strip: the interpolated unit normal `n` with its tilt taken from the profile at `s` plus the regional offset `c`, by `w` (the zone's falloff times how much of the smooth normal the organ takes).
 *  GLSL twin: `rimShadeNormal` (organ-shader.ts). */
export function rimShadeNormal(n: readonly [number, number, number], s: number, c: number, prof: readonly number[], w: number): [number, number, number] {
  const zone = 1 - smooth(0.75, 1, s), hl = Math.hypot(n[0], n[1]), nzP = Math.min(1, Math.max(0, rimProfileAt(prof, s) + c)), k = zone * w * smooth(RIM_SPECK[0], RIM_SPECK[1], hl);   // (speck guard, RIM_SPECK)
  const sin = Math.sqrt(Math.max(0, 1 - nzP * nzP)), dx = hl > 1e-4 ? n[0] / hl : 0, dy = hl > 1e-4 ? n[1] / hl : 0;
  const x = n[0] + (dx * sin - n[0]) * k, y = n[1] + (dy * sin - n[1]) * k, z = n[2] + (nzP - n[2]) * k, l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
}
const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
