// The collagen layer's arrival times (Plan 25b): for every pixel of the layer, when (at what growth p of its channel) the septa's collagen appears there. Computed, not painted, from the same centre lines the painter draws its cords along (bandGeomInto's points, the septa's paths),
// so it is exact and the same every time. One RGBA texel per pixel, R the arrival time (growth.ts), 255: never; G, B and A are unused (the painter's passes and fibres show as painted, the shader reveals them by R).
// (The portal tracts have no texels here: their disc is round about the hexagon's corner, so the shader computes its radius. The vein is cv-band.ts's.)
//   septa      the hex-edge bridges grow from both tracts and meet in the middle at su 0.29 (as today's reach does); the portal-central bridges creep from the tract to the vein; the spurs push in last;
//              every band thickens from a strand to its full width, and a seeded low-frequency jitter keeps each front organic and the same every time
import { bandGeomInto, fibHash } from './from2d/lobule-paint.generated.js';
import { septaBands } from './collagen-paint.ts';
import type { CollagenShape } from './collagen-paint.ts';
import { tauToByte } from './growth.ts';

/** The fronts' own meeting point of the hex-edge bridges, in septU (today's reach is 1 at su (1 - 0.3) / 2.4). */
export const SEPTA_MEET = 0.29;
const TAU = Math.PI * 2;
/** Two bands whose depth at a pixel (d / half) differs by less than this are tied there: the earlier arrival shows. */
const TIE = 0.12;
const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));

/** A band's front is irregular and stable: low-frequency noise along it from its own seed. */
const jitter = (seed: number, u: number): number => 0.6 * Math.sin(TAU * 1.3 * u + fibHash(seed) * TAU) + 0.4 * Math.sin(TAU * 3.1 * u + fibHash(seed + 9) * TAU);

/** The layer's texels as RGBA bytes, row 0 at the top of the canvas (world y = -box), n x n pixels over world [-box, box]. `_cvR` (the vein's wall radius) is unused: the vein is not in this layer. */
export function collagenTau(G: CollagenShape, _cvR: number, n: number, box: number): Uint8Array {
  const out = new Uint8Array(n * n * 4);
  for (let k = 0; k < n * n; k++) { out[4 * k] = 255; out[4 * k + 3] = 255; }   // (R never; A whole, so an upload never premultiplies R away)
  const sc = n / (2 * box), best = new Float32Array(n * n).fill(Infinity), first = new Float32Array(n * n).fill(Infinity);   // (how far inside its band the pixel is, d / half, of the band that holds it; and that band's arrival)
  const toPx = (v: number): number => (v + box) * sc;
  const g = { P: new Float64Array(54), N: new Float64Array(54), Wd: new Float64Array(27), n: 26, L0: 1 };
  for (const b of septaBands(G)) {
    bandGeomInto(g, b.A, b.B, b.o, b.o.path);
    const P = g.P, Wd = g.Wd, seed = b.o.seed;
    for (let i = 0; i < g.n; i++) {
      const ax = P[2 * i]!, ay = P[2 * i + 1]!, bx = P[2 * i + 2]!, by = P[2 * i + 3]!, wmax = 2.1 * Math.max(Wd[i]!, Wd[i + 1]!, 0.5);
      const x0 = Math.max(0, Math.floor(toPx(Math.min(ax, bx) - wmax))), x1 = Math.min(n - 1, Math.ceil(toPx(Math.max(ax, bx) + wmax)));
      const y0 = Math.max(0, Math.floor(toPx(Math.min(ay, by) - wmax))), y1 = Math.min(n - 1, Math.ceil(toPx(Math.max(ay, by) + wmax)));
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const wx = (x + 0.5) / sc - box, wy = (y + 0.5) / sc - box;
        const t = clamp(((wx - ax) * dx + (wy - ay) * dy) / L2, 0, 1), ex = ax + t * dx - wx, ey = ay + t * dy - wy, d = Math.hypot(ex, ey);
        const half = 2.1 * Math.max(0.5, Wd[i]! + (Wd[i + 1]! - Wd[i]!) * t);   // (the painted outer edge: every pixel of the painter's faintest pass has its time, and the arrival times' thickening is measured against it)
        const k = y * n + x;
        if (d > half) continue;
        const u = (i + t) / g.n;
        let tau: number;
        if (b.kind === 'hex') { const h = 2 * Math.min(u, 1 - u); tau = SEPTA_MEET * h + 0.03 * Math.sin(Math.PI * h) * jitter(seed, u); }
        else if (b.kind === 'pc') tau = 0.18 + 0.4 * u + 0.03 * Math.sin(Math.PI * u) * jitter(seed, u);
        else tau = 0.6 + 0.3 * u + 0.03 * Math.sin(Math.PI * u) * jitter(seed, u);
        tau += 0.1 * Math.min(1, d / half) ** 2;
        // (the band the pixel is most inside wins; where two are about as deep (within TIE) the EARLIER wins. Plain "nearest centre line" flipped from pixel to pixel where two bands overlap over a near-common course, a stipple of early and late
        //  texels: Mohammad 23 Nov, the black speckle at the portal corner)
        const nd = d / half;
        if (nd > best[k]! + TIE || (nd >= best[k]! - TIE && tau >= first[k]!)) continue;
        if (nd < best[k]!) best[k] = nd;
        first[k] = tau; out[4 * k] = tauToByte(tau);
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
