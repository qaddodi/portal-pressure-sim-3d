// The collagen layer's arrival times and edges (Plan 25b, Plan 47, Plan 48): for every pixel of the layer, when (at what growth p of its channel) the collagen there appears, and where the band's edge lies and how deep inside it the pixel is. Computed, not painted, from the same centre lines
// the painter draws along (bandGeomInto's points, the septa's paths), so it is exact and the same every time. One RGBA texel per pixel:
//   R  the septa's arrival time, one byte (growth.ts); 255: never
//   G  the edge's outward normal as one ANGLE byte (collagen-edge.ts angleToByte), of the band that is deepest here (read with the nearest texel: a filtered angle goes wrong across its seam)
//   B  the signed distance e (plate px, + inside) to the band's EDGE: the painter's MIDDLE pass, K_MID x its width (Plan 48b: the outer pass's faint tier is NOT drawn, so nothing lies outside this edge); square-root mapped (collagen-edge.ts edgeToByte); 0: outside, far
//   A  the fade's depth t = e / fw_in, 0 at the edge to 1 at the dense core's edge, fw_in the band's own depth here (the middle pass's half width minus the core's: 0.225 x the width); the deepest band's t
// (The portal tracts have no texels here: their disc is round about the hexagon's corner, so the shader computes its radius and its t, collagen-edge.ts. The vein is cv-band.ts's.)
//   septa      the hex-edge bridges grow from both tracts and meet in the middle at su 0.29 (as today's reach does); the portal-central bridges creep from the tract to the vein; the spurs push in last;
//              every band thickens from a strand to its full width, and a seeded low-frequency jitter keeps each front organic and the same every time
import { bandGeomInto, fibHash } from './from2d/lobule-paint.generated.js';
import { septaBands } from './collagen-paint.ts';
import type { CollagenShape } from './collagen-paint.ts';
import { tauToByte } from './growth.ts';
import { E_LO, K_EDGE, K_MID, angleToByte, edgeToByte, tToByte } from './collagen-edge.ts';

/** The fronts' own meeting point of the hex-edge bridges, in septU (today's reach is 1 at su (1 - 0.3) / 2.4). */
export const SEPTA_MEET = 0.29;
const TAU = Math.PI * 2;
const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));

/** A band's front is irregular and stable: low-frequency noise along it from its own seed. */
const jitter = (seed: number, u: number): number => 0.6 * Math.sin(TAU * 1.3 * u + fibHash(seed) * TAU) + 0.4 * Math.sin(TAU * 3.1 * u + fibHash(seed + 9) * TAU);

/** The layer's texels as RGBA bytes, row 0 at the top of the canvas (world y = -box), n x n pixels over world [-box, box]. `_cvR` (the vein's wall radius) is unused: the vein is not in this layer. */
export function collagenTau(G: CollagenShape, _cvR: number, n: number, box: number): Uint8Array {
  const out = new Uint8Array(n * n * 4);
  for (let k = 0; k < n * n; k++) { out[4 * k] = 255; out[4 * k + 1] = angleToByte(0); out[4 * k + 2] = 0; out[4 * k + 3] = 0; }   // (never, no normal, outside, t 0)
  const sc = n / (2 * box), best = new Float32Array(n * n).fill(Infinity), bestE = new Float32Array(n * n).fill(-Infinity), bestT = new Float32Array(n * n).fill(-Infinity);
  const toPx = (v: number): number => (v + box) * sc;
  const reach = 1 - E_LO + 1;   // plate px past the body that a texel is kept (the one pixel of anti-aliasing and the linear filter's neighbours)
  const g = { P: new Float64Array(54), N: new Float64Array(54), Wd: new Float64Array(27), n: 26, L0: 1 };
  for (const b of septaBands(G)) {
    bandGeomInto(g, b.A, b.B, b.o, b.o.path);
    const P = g.P, Wd = g.Wd, seed = b.o.seed;
    // (the painter's bandHalf: Wd k / 2; the core is the same width to its ends, so the edge needs no narrowing)
    // (the arrival time still reaches the painter's middle pass: every pixel the painter draws as septum has its time, as before; only the edge and the fade are the core's)
    const hOut = (i: number): number => Wd[i]! * K_EDGE / 2, hMid = (i: number): number => Wd[i]! * K_MID / 2;
    for (let i = 0; i < g.n; i++) {
      const ax = P[2 * i]!, ay = P[2 * i + 1]!, bx = P[2 * i + 2]!, by = P[2 * i + 3]!, wmax = Math.max(hMid(i), hMid(i + 1)) + reach / sc;
      const x0 = Math.max(0, Math.floor(toPx(Math.min(ax, bx) - wmax))), x1 = Math.min(n - 1, Math.ceil(toPx(Math.max(ax, bx) + wmax)));
      const y0 = Math.max(0, Math.floor(toPx(Math.min(ay, by) - wmax))), y1 = Math.min(n - 1, Math.ceil(toPx(Math.max(ay, by) + wmax)));
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const wx = (x + 0.5) / sc - box, wy = (y + 0.5) / sc - box;
        const t = clamp(((wx - ax) * dx + (wy - ay) * dy) / L2, 0, 1), ex = ax + t * dx - wx, ey = ay + t * dy - wy, d = Math.hypot(ex, ey);
        const w = Math.max(0.5, Wd[i]! + (Wd[i + 1]! - Wd[i]!) * t), half = 2.1 * w;   // (the painted outer edge, which the arrival times' thickening is measured against)
        const ho = hOut(i) + (hOut(i + 1) - hOut(i)) * t, hm = hMid(i) + (hMid(i + 1) - hMid(i)) * t;
        if ((hm - d) * sc < E_LO - 1) continue;
        const e = (ho - d) * sc;   // plate px inside the dense core's edge (the band's edge)
        const k = y * n + x;
        if (e >= E_LO - 1) {
          const fw = Math.max(1, ho * sc), td = clamp(e / fw, 0, 1);   // (the fade runs across the band's whole half width: t is 1 on its centre line)
          if (e > bestE[k]!) { bestE[k] = e; out[4 * k + 2] = edgeToByte(e); }   // (the union of the bands: the outer edge that reaches furthest)
          if (td > bestT[k]!) {   // (the deepest fade wins, so the profile is the max of the bands' own: continuous where two bands cross; its normal goes with it)
            bestT[k] = td; out[4 * k + 3] = tToByte(td);
            out[4 * k + 1] = angleToByte(d > 1e-9 ? Math.atan2(ey, -ex) : 0);   // (outward, x right and y UP: the canvas's y runs down)
          }
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
