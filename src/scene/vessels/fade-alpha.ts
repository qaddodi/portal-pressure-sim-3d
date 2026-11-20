// How opaque a vessel is at a place on it, on the CPU: the same rule the vessel shader applies (shaders.ts: fadeMode 1 along the vessel, 2 down the figure, 3 and 4 along a line across it, then the
// hepatic veins' last stretch easing to the cava's alpha). Anything that lies IN a vessel and must fade with it (a clot in a hepatic vein, which fades into the liver) reads it here, so the
// two never disagree: it is the resting state (a fade that a lens, a selection or an open collateral lets go of is not read).
import { NETWORK_BY_ID } from './network.ts';
import { CAVA_RECEDE, cavaEndSpan, fadeOf, type TipFade } from './fades.ts';

const sstep = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-9))); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

/** A fade's alpha at `u` (0 to 1 along the vessel) for a point at scene (x, y). */
export function tipAlpha(f: TipFade, u: number, x: number, y: number): number {
  if (f.mode > 2) {
    const [x1, y1, x2, y2] = f.line!, dx = x2 - x1, dy = y2 - y1;
    let fv = ((x - x1) * dx + (y - y1) * dy) / Math.max(dx * dx + dy * dy, 1e-9);
    if (f.mode === 4) {
      fv = Math.min(1, Math.max(0, fv));
      return fv < f.from ? mix(f.a0, f.a1, sstep(0, Math.max(f.from, 1e-4), fv)) : mix(f.a1, 1, sstep(f.from, 1, fv));
    }
    return mix(f.a0, f.a1, Math.min(1, Math.max(0, (fv - f.from) / Math.max(1 - f.from, 1e-4))));
  }
  const s = f.mode === 1 ? u : y;
  return mix(f.a0, f.a1, Math.min(1, Math.max(0, (s - f.from) / (Math.abs(f.to - f.from) < 1e-5 ? 1e-5 : f.to - f.from))));
}

/** Vessel `id`'s resting alpha at `u` along it, at scene (x, y): its fade, and a hepatic vein's last stretch easing to the cava's alpha. 1 for a vessel with neither. */
export function vesselAlphaAt(id: string, u: number, x: number, y: number): number {
  const v = NETWORK_BY_ID.get(id);
  if (!v) return 1;
  const f = fadeOf(id, v.tone === 'artery');
  let a = f ? tipAlpha(f, u, x, y) : 1;
  const span = cavaEndSpan(id);
  if (span > 0) a *= mix(1, CAVA_RECEDE, sstep(1 - span, 1, u));
  return a;
}
