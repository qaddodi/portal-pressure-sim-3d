// The collagen layer's arrival times and edges (Plan 25b, Plan 47): for every pixel of the layer, when (at what growth p of its channel) the collagen there appears, and where the band's crisp edge lies. Computed, not painted, from the same centre lines
// the painter draws along (bandGeomInto's points, the septa's paths), so it is exact and the same every time. One RGBA texel per pixel:
//   R  the septa's arrival time, one byte (growth.ts); 255: never
//   G  the edge's outward normal, x (right), as a byte (collagen-edge.ts unitToByte)
//   B  the signed distance e (plate px, + inside) to the band's body: the painter's middle pass, CORE_K x its width (collagen-edge.ts edgeToByte); 0: outside, far
//   A  the edge's outward normal, y (up), as a byte
// (The portal tracts have no texels here: their disc is round about the hexagon's corner, so the shader computes its radius, collagen-edge.ts. The vein is cv-band.ts's.)
//   septa      the hex-edge bridges grow from both tracts and meet in the middle at su 0.29 (as today's reach does); the portal-central bridges creep from the tract to the vein; the spurs push in last;
//              every band thickens from a strand to its full width, and a seeded low-frequency jitter keeps each front organic and the same every time
import { bandGeomInto, fibHash } from './from2d/lobule-paint.generated.js';
import { septaBands } from './collagen-paint.ts';
import type { CollagenShape } from './collagen-paint.ts';
import { tauToByte } from './growth.ts';
import { CORE_K, E_LO, edgeToByte, unitToByte } from './collagen-edge.ts';

/** The fronts' own meeting point of the hex-edge bridges, in septU (today's reach is 1 at su (1 - 0.3) / 2.4). */
export const SEPTA_MEET = 0.29;
const TAU = Math.PI * 2;
const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));

/** A band's front is irregular and stable: low-frequency noise along it from its own seed. */
const jitter = (seed: number, u: number): number => 0.6 * Math.sin(TAU * 1.3 * u + fibHash(seed) * TAU) + 0.4 * Math.sin(TAU * 3.1 * u + fibHash(seed + 9) * TAU);

/** The layer's texels as RGBA bytes, row 0 at the top of the canvas (world y = -box), n x n pixels over world [-box, box]. `_cvR` (the vein's wall radius) is unused: the vein is not in this layer. */
export function collagenTau(G: CollagenShape, _cvR: number, n: number, box: number): Uint8Array {
  const out = new Uint8Array(n * n * 4);
  for (let k = 0; k < n * n; k++) { out[4 * k] = 255; out[4 * k + 1] = 128; out[4 * k + 3] = 128; }   // (never, no normal, outside)
  const sc = n / (2 * box), best = new Float32Array(n * n).fill(Infinity), bestE = new Float32Array(n * n).fill(-Infinity);
  const toPx = (v: number): number => (v + box) * sc;
  const reach = 1 - E_LO + 1;   // plate px past the body that a texel is kept (the one pixel of anti-aliasing and the linear filter's neighbours)
  const g = { P: new Float64Array(54), N: new Float64Array(54), Wd: new Float64Array(27), n: 26, L0: 1 };
  for (const b of septaBands(G)) {
    bandGeomInto(g, b.A, b.B, b.o, b.o.path);
    const P = g.P, Wd = g.Wd, seed = b.o.seed;
    for (let i = 0; i < g.n; i++) {
      const ax = P[2 * i]!, ay = P[2 * i + 1]!, bx = P[2 * i + 2]!, by = P[2 * i + 3]!, wmax = (CORE_K / 2) * Math.max(Wd[i]!, Wd[i + 1]!) + reach / sc;   // (the painter's pass k is k x the width across: bandHalf is Wd k / 2 each side)
      const x0 = Math.max(0, Math.floor(toPx(Math.min(ax, bx) - wmax))), x1 = Math.min(n - 1, Math.ceil(toPx(Math.max(ax, bx) + wmax)));
      const y0 = Math.max(0, Math.floor(toPx(Math.min(ay, by) - wmax))), y1 = Math.min(n - 1, Math.ceil(toPx(Math.max(ay, by) + wmax)));
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const wx = (x + 0.5) / sc - box, wy = (y + 0.5) / sc - box;
        const t = clamp(((wx - ax) * dx + (wy - ay) * dy) / L2, 0, 1), ex = ax + t * dx - wx, ey = ay + t * dy - wy, d = Math.hypot(ex, ey);
        const w = Math.max(0.5, Wd[i]! + (Wd[i + 1]! - Wd[i]!) * t), half = 2.1 * w;   // (the painted outer edge, which the arrival times' thickening is measured against)
        const e = ((CORE_K / 2) * Math.max(0, Wd[i]! + (Wd[i + 1]! - Wd[i]!) * t) - d) * sc;   // plate px inside the body (the painter's middle pass: bandHalf)
        if (e < E_LO - 1) continue;
        const k = y * n + x;
        if (e > bestE[k]!) {   // (the union of the bands: the edge and the normal of the body that reaches furthest)
          bestE[k] = e; out[4 * k + 2] = edgeToByte(e);
          out[4 * k + 1] = unitToByte(d > 1e-9 ? -ex / d : 0); out[4 * k + 3] = unitToByte(d > 1e-9 ? ey / d : 0);   // (outward, x right and y UP: the canvas's y runs down)
        }
        if (d >= best[k]!) continue;
        const u = (i + t) / g.n;
        let tau: number;
        if (b.kind === 'hex') { const h = 2 * Math.min(u, 1 - u); tau = SEPTA_MEET * h + 0.03 * Math.sin(Math.PI * h) * jitter(seed, u); }
        else if (b.kind === 'pc') tau = 0.18 + 0.4 * u + 0.03 * Math.sin(Math.PI * u) * jitter(seed, u);
        else tau = 0.6 + 0.3 * u + 0.03 * Math.sin(Math.PI * u) * jitter(seed, u);
        tau += 0.1 * Math.min(1, d / half) ** 2;
        best[k] = d; out[4 * k] = tauToByte(tau);
      }
    }
  }
  return out;
}

/** The rows reversed (canvas order, top first, to texture order, bottom first): what a flipY = false texture reads. */
export function flipRows(a: Uint8Array, n: number): Uint8Array {
  const out = new Uint8Array(a.length), row = n * 4;
  for (let y = 0; y < n; y++) out.set(a.subarray(y * row, (y + 1) * row), (n - 1 - y) * row);
  return out;
}
