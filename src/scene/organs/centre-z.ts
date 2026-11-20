// Where an organ's middle is in depth, at a point of the plate (owner, 20 Nov 2026: "the scope should be INSIDE the lumen, not outside the entire structure"). The organs are solid shapes
// inflated from the 2D outlines (meshes.ts), straddling z = 0: a device that runs through one (the scope down the oesophagus and into the stomach) travels on the organ's own middle, the
// halfway between where a line along z enters and leaves it. Worked out once, from the geometry alone, on a coarse grid (a few ms, never at a frame); a point outside the organ takes the
// nearest middle the grid has (the scope's lead-in above the figure stays level with where it enters). Pure: it takes positions and indices, so a test loads it with the real organ file.
import type { BufferGeometry } from 'three';

export const CELL = 0.02;   // scene units (about 6 figure units)

export interface CentreGrid { x0: number; y0: number; w: number; h: number; z: Float32Array; ok: Uint8Array }

/** The grid of middles for a mesh: per cell, the least and the greatest z of the surface over it, halved. */
export function bakeCentre(pos: ArrayLike<number>, index: ArrayLike<number>): CentreGrid {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pos.length; i += 3) { x0 = Math.min(x0, pos[i]!); x1 = Math.max(x1, pos[i]!); y0 = Math.min(y0, pos[i + 1]!); y1 = Math.max(y1, pos[i + 1]!); }
  const w = Math.max(1, Math.ceil((x1 - x0) / CELL) + 1), h = Math.max(1, Math.ceil((y1 - y0) / CELL) + 1);
  const lo = new Float32Array(w * h).fill(Infinity), hi = new Float32Array(w * h).fill(-Infinity);
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t]! * 3, b = index[t + 1]! * 3, c = index[t + 2]! * 3;
    const ax = pos[a]!, ay = pos[a + 1]!, az = pos[a + 2]!, bx = pos[b]!, by = pos[b + 1]!, bz = pos[b + 2]!, cx = pos[c]!, cy = pos[c + 1]!, cz = pos[c + 2]!;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < 1e-12) continue;
    const gx0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / CELL)), gx1 = Math.min(w - 1, Math.ceil((Math.max(ax, bx, cx) - x0) / CELL));
    const gy0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - y0) / CELL)), gy1 = Math.min(h - 1, Math.ceil((Math.max(ay, by, cy) - y0) / CELL));
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
      const px = x0 + gx * CELL, py = y0 + gy * CELL;
      const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den, l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      const z = l1 * az + l2 * bz + l3 * cz, k = gy * w + gx;
      if (z < lo[k]!) lo[k] = z;
      if (z > hi[k]!) hi[k] = z;
    }
  }
  const z = new Float32Array(w * h), ok = new Uint8Array(w * h);
  for (let k = 0; k < z.length; k++) if (hi[k]! >= lo[k]!) { z[k] = (lo[k]! + hi[k]!) / 2; ok[k] = 1; }
  // (cells the surface does not cover take the nearest covered one's: a few passes of dilation, then the mean, so a point just outside the organ never reads a hole)
  for (let pass = 0; pass < Math.max(w, h); pass++) {
    let grew = 0;
    const nz = z.slice(), nok = ok.slice();
    for (let gy = 0; gy < h; gy++) for (let gx = 0; gx < w; gx++) {
      const k = gy * w + gx;
      if (ok[k]) continue;
      let s = 0, n = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) { const X = gx + dx, Y = gy + dy; if (X < 0 || Y < 0 || X >= w || Y >= h) continue; const j = Y * w + X; if (ok[j]) { s += z[j]!; n++; } }
      if (n) { nz[k] = s / n; nok[k] = 1; grew++; }
    }
    z.set(nz); ok.set(nok);
    if (!grew) break;
  }
  return { x0, y0, w, h, z, ok };
}

/** The organ's middle in depth at (x, y) in scene units: bilinear over the grid, the nearest cell's value past its edge. */
export function centreAt(g: CentreGrid, x: number, y: number): number {
  const fx = Math.min(g.w - 1, Math.max(0, (x - g.x0) / CELL)), fy = Math.min(g.h - 1, Math.max(0, (y - g.y0) / CELL));
  const ix = Math.min(g.w - 2 < 0 ? 0 : g.w - 2, Math.floor(fx)), iy = Math.min(g.h - 2 < 0 ? 0 : g.h - 2, Math.floor(fy)), u = fx - ix, v = fy - iy;
  const at = (X: number, Y: number): number => g.z[Math.min(g.h - 1, Y) * g.w + Math.min(g.w - 1, X)]!;
  return (at(ix, iy) * (1 - u) + at(ix + 1, iy) * u) * (1 - v) + (at(ix, iy + 1) * (1 - u) + at(ix + 1, iy + 1) * u) * v;
}

export const bakeGeometry = (g: BufferGeometry): CentreGrid => bakeCentre(g.getAttribute('position').array, g.index!.array);
