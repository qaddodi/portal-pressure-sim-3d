// The collagen layer's arrival times (Plan 25b): for every pixel of the layer, when (at what growth p of its channel) the collagen there appears. Computed, not painted, from the same centre lines the painter draws along
// (bandGeomInto's points, the septa's paths, the tracts' and the vein's centres), so it is exact and the same every time. One byte per channel (growth.ts): R the septa, G the portal tracts, B the vein's cuff and ring; 255: never.
//   septa      the hex-edge bridges grow from both tracts and meet in the middle at su 0.29 (as today's reach does); the portal-central bridges creep from the tract to the vein; the spurs push in last;
//              every band thickens from a strand to its full width, and a seeded low-frequency jitter keeps each front organic and the same every time
//   tracts     radially out: the inverse of today's tract radius G.rt (0.8 + 0.9 g)
//   cuff, ring the cuff outwards from the wall (the inverse of today's outer radius), the ring inwards from it (the inverse of cv-intima.ts's inner edge), so the lumen closes in as the cuff grows out
import { bandGeomInto, fibHash } from './from2d/lobule-paint.generated.js';
import { CV_FILL, cvRag } from './cv-intima.ts';
import { septaBands, tractCorners, type CollagenShape } from './collagen-paint.ts';
import { NEVER, tauToByte } from './growth.ts';
import { softPadWorld } from './collagen-soft.ts';

/** The fronts' own meeting point of the hex-edge bridges, in septU (today's reach is 1 at su (1 - 0.3) / 2.4). */
export const SEPTA_MEET = 0.29;
const TAU = Math.PI * 2;
const clamp = (x: number, a: number, b: number): number => Math.min(b, Math.max(a, x));

/** A band's front is irregular and stable: low-frequency noise along it from its own seed. */
const jitter = (seed: number, u: number): number => 0.6 * Math.sin(TAU * 1.3 * u + fibHash(seed) * TAU) + 0.4 * Math.sin(TAU * 3.1 * u + fibHash(seed + 9) * TAU);

/** The layer's arrival times as RGBA bytes (A 255), row 0 at the top of the canvas (world y = -box), n × n pixels over world [-box, box]. `cvR`: the vein's wall radius, world units. */
export function collagenTau(G: CollagenShape, cvR: number, n: number, box: number): Uint8Array {
  const out = new Uint8Array(n * n * 4).fill(255);
  const sc = n / (2 * box), pad = softPadWorld(box), best = new Float32Array(n * n).fill(Infinity);
  const toPx = (v: number): number => (v + box) * sc;
  // ---- R: the septa
  const g = { P: new Float64Array(54), N: new Float64Array(54), Wd: new Float64Array(27), n: 26, L0: 1 };
  for (const b of septaBands(G)) {
    bandGeomInto(g, b.A, b.B, b.o, b.o.path);
    const P = g.P, Wd = g.Wd, seed = b.o.seed;
    for (let i = 0; i < g.n; i++) {
      const ax = P[2 * i]!, ay = P[2 * i + 1]!, bx = P[2 * i + 2]!, by = P[2 * i + 3]!, wmax = 2.1 * Math.max(Wd[i]!, Wd[i + 1]!, 0.5) + pad;
      const x0 = Math.max(0, Math.floor(toPx(Math.min(ax, bx) - wmax))), x1 = Math.min(n - 1, Math.ceil(toPx(Math.max(ax, bx) + wmax)));
      const y0 = Math.max(0, Math.floor(toPx(Math.min(ay, by) - wmax))), y1 = Math.min(n - 1, Math.ceil(toPx(Math.max(ay, by) + wmax)));
      const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy || 1;
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
        const wx = (x + 0.5) / sc - box, wy = (y + 0.5) / sc - box;
        const t = clamp(((wx - ax) * dx + (wy - ay) * dy) / L2, 0, 1), ex = ax + t * dx - wx, ey = ay + t * dy - wy, d = Math.hypot(ex, ey);
        const half = 2.1 * Math.max(0.5, Wd[i]! + (Wd[i + 1]! - Wd[i]!) * t);   // (the painted edge; the soft copy spreads `pad` past it and the arrival times reach as far, or front() would cut a hard edge there)
        const k = y * n + x;
        if (d > half + pad || d >= best[k]!) continue;
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
  // ---- G: the portal tracts, radially (the tract of radius G.rt (0.8 + 0.9 g) reaches r at g = (r / G.rt - 0.8) / 0.9)
  const rmax = G.rt * 2 + pad;
  for (const [cx, cy] of tractCorners(G)) {
    const x0 = Math.max(0, Math.floor(toPx(cx - rmax))), x1 = Math.min(n - 1, Math.ceil(toPx(cx + rmax)));
    const y0 = Math.max(0, Math.floor(toPx(cy - rmax))), y1 = Math.min(n - 1, Math.ceil(toPx(cy + rmax)));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const r = Math.hypot((x + 0.5) / sc - box - cx, (y + 0.5) / sc - box - cy);
      if (r > rmax) continue;
      const b = tauToByte(clamp((r / G.rt - 0.8) / 0.9, 0, 1)), k = 4 * (y * n + x) + 1;
      if (out[k] === NEVER || b < out[k]!) out[k] = b;
    }
  }
  // ---- B: the vein's cuff outwards and its ring inwards (centre (G.cx, G.cy))
  const rw = cvR, rOut = (rw + G.rcv0 * 0.95) * 1.08 + pad;
  const x0 = Math.max(0, Math.floor(toPx(G.cx - rOut))), x1 = Math.min(n - 1, Math.ceil(toPx(G.cx + rOut)));
  const y0 = Math.max(0, Math.floor(toPx(G.cy - rOut))), y1 = Math.min(n - 1, Math.ceil(toPx(G.cy + rOut)));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
    const dx = (x + 0.5) / sc - box - G.cx, dy = (y + 0.5) / sc - box - G.cy, r = Math.hypot(dx, dy);
    if (r > rOut) continue;
    const tau = r < rw ? clamp((1 - r / (rw * cvRag(Math.atan2(dy, dx) < 0 ? Math.atan2(dy, dx) + TAU : Math.atan2(dy, dx)))) / CV_FILL, 0, 1) : clamp(((r - rw) / G.rcv0 - 0.1) / 0.85, 0, 1);
    out[4 * (y * n + x) + 2] = tauToByte(tau);
  }
  return out;
}

/** The rows reversed (canvas order, top first, to texture order, bottom first): what a flipY = false texture reads. */
export function flipRows(a: Uint8Array, n: number): Uint8Array {
  const out = new Uint8Array(a.length), row = n * 4;
  for (let y = 0; y < n; y++) out.set(a.subarray(y * row, (y + 1) * row), (n - 1 - y) * row);
  return out;
}
