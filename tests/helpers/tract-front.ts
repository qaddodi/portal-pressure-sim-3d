// The portal tracts' growth as the plate shader computes it (Plan 47: no arrival-time texels for the tracts any more; their disc is round about the hexagon's corner and its front radius is a function of the growth,
// collagen-edge.ts), for the tests that judge the tracts' reveal at a coarse N x N raster of the plate. Returns the reveal (0 .. 1) of pixel i at tract growth p; a pixel of the raster is 2048 / N plate px, so its edge is half that each side.
import { PLATE_PX, PLATE_S } from '../../src/scene/lobule/plate.ts';
import { tractEdge, tractRamp } from '../../src/scene/lobule/collagen-edge.ts';

const smooth = (e0: number, e1: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

/** `box` is the plate's half side in world units, as the raster's `B`. */
export function tractReveal(N: number, box: number): (i: number, p: number) => number {
  const r = new Float32Array(N * N), a = PLATE_PX / N / 2;
  const pxPerWorld = PLATE_PX / (2 * box);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const wx = ((x + 0.5) / N - 0.5) * 2 * box, wy = ((y + 0.5) / N - 0.5) * 2 * box;
    let m = 1e9;
    for (let k = 0; k < 6; k++) m = Math.min(m, Math.hypot(wx - Math.cos(k * Math.PI / 3) * PLATE_S, wy - Math.sin(k * Math.PI / 3) * PLATE_S) * pxPerWorld);
    r[y * N + x] = m;
  }
  return (i, p) => smooth(-a, a, tractEdge(p, r[i]!)) * tractRamp(p);
}
