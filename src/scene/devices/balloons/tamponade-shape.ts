// The tamponade's shapes as pure numbers (no scene, no clock), so the tube's timing and the balloon's fit can be tested in node.
//
//  - `sectionsOf`: the gastric balloon as the stomach lets it be. The 2D app presses the pear on the wall (balloon-gas.js wallPress, then snugPress under traction: the cone's shoulder is drawn out to the cardia, the
//    roof and the lesser curvature, so the flat top closes the opening) and returns that outline. The 3D balloon is a tube of rings along the pear's axis, so each ring is cut from the pressed outline: the span of the
//    outline across the axis at that station (its centre and half width). Under traction the rings therefore follow the cardia / EG-junction contour, not the free pear.
//  - `tamponadeAt`: where the tube and its gastric balloon are at a time on the procedure's own clock (the tube in the first step, the balloon filling and drawn up in the second, held at its stop), so the device
//    follows the procedure and not the model's `balloonGas`, which changes only at T.apply.
import { INSTRUMENT_SPECS } from '../../procedures/instrument-specs.ts';

export interface Section { /** distance along the axis from the balloon's upper end p0 (2D units) */ a: number; /** the span's centre across the axis (+ is the axis's normal (-dy, dx)) */ c: number; /** its half width */ r: number }

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
/**
 * `n` stations along the outline's own extent on the axis (denser toward both ends, where it turns), each the span of the outline across the axis there. A closed ring of [x, y] points (2D units), the axis from `p0` along the
 * unit vector `dir`. A station the outline does not reach gets `minR` (the tube); a span is never narrower than `minR`.
 */
export function sectionsOf(outline: readonly (readonly [number, number])[], p0: readonly [number, number], dir: readonly [number, number], n: number, minR: number): Section[] {
  const [dx, dy] = dir, nx = -dy, ny = dx, m = outline.length;
  const ax = new Float64Array(m), lt = new Float64Array(m);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < m; i++) {
    const x = outline[i]![0] - p0[0], y = outline[i]![1] - p0[1];
    ax[i] = x * dx + y * dy; lt[i] = x * nx + y * ny;
    lo = Math.min(lo, ax[i]!); hi = Math.max(hi, ax[i]!);
  }
  const out: Section[] = [];
  for (let k = 0; k < n; k++) {
    const u = 0.5 - 0.5 * Math.cos((Math.PI * k) / (n - 1));
    const a = lo + (hi - lo) * u, at = lo + (hi - lo) * (0.0005 + 0.999 * u);   // (cut a hair inside the ends, where a span would be a single point)
    let l0 = Infinity, l1 = -Infinity;
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m, a0 = ax[i]!, a1 = ax[j]!;
      if ((a0 <= at && a1 >= at) || (a1 <= at && a0 >= at)) {
        const f = a1 === a0 ? 0 : (at - a0) / (a1 - a0), l = lt[i]! + (lt[j]! - lt[i]!) * f;
        l0 = Math.min(l0, l); l1 = Math.max(l1, l);
      }
    }
    out.push(l1 < l0 ? { a, c: 0, r: minR } : { a, c: (l0 + l1) / 2, r: Math.max(minR, (l1 - l0) / 2) });
  }
  return out;
}

/** The tube and its gastric balloon on the procedure's clock (ms of its own time): adv 0..1 the tube going in (the first step, to its first stop), gas 0..1 the balloon filling and being drawn up (the second step, to the model's change at T.apply). */
export function tamponadeAt(t: number, spec = INSTRUMENT_SPECS.tamponade!): { adv: number; gas: number } {
  const s0 = spec.stops[0]!, s1 = spec.T.apply;
  return { adv: clamp01(t / s0), gas: clamp01((t - s0) / (s1 - s0)) };
}
