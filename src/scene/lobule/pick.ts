// What a tap on the lobule is: 2D's own rule (lobule-zoom.js hitInto, with lobule-pick.js's ranking where several vessels lie under the finger), in lobule radii (the 2D plane: y down), so a tap on
// each part the 2D lobule lets you tap opens the same card here: the portal triad and, inside it, the arteriole, the ductule and (with the Lymph layer on) the lymphatic; the central vein; a vessel (the tap
// goes to the one drawn on top there, else to the nearest edge); the fibrous septa once cirrhosis draws them; anywhere else on the hexagon, the hepatocytes of the zone it is in.
// Pure (no three.js, no DOM): the view hands it the radii as drawn now and how many screen pixels a lobule radius is, for 2D's tolerances (10 px, 4 px, 5 px).
import { type Course, type LobuleNet, type P2, hexFrac, zoneOf } from './geometry.ts';
import { Z_OF, pickRank, tierOf } from './from2d/lobule-pick.generated.js';

/** A vessel the tap may land on: a course of the net, or one of the Bile layer's (bs: a canaliculus between plates, bh: a canal of Hering). */
export interface PickTube { id: number; kind: Course['kind'] | 'bs' | 'bh'; pts: readonly P2[]; tri?: number }

/** What a tap landed on, as 2D reports it (`part`: triad, ha, bd, lv, cv, sin, an, in, bs, bh, septum, hep; `zone` for the hepatocytes). */
export interface LobuleHit { part: string; tri?: number; zone?: 1 | 2 | 3; tube?: number }

export interface PickState {
  septU: number;
  lymphOn: boolean;
  bileOn: boolean;
  /** The radius of a vessel at its sample i, in lobule radii, as drawn now. */
  radius(t: PickTube, i: number): number;
  /** The central vein's radius now. */
  cvRadius: number;
  /** Screen pixels to a lobule radius at the tap (2D's tolerances are in pixels). */
  pxPerR: number;
}

/** The distance from (x, y) to a polyline, and how far along it (0..1) the nearest point is. */
export function distTo(pts: readonly P2[], x: number, y: number): { d: number; u: number } {
  let best = Infinity, bu = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i]!, b = pts[i + 1]!, dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1e-9;
    const t = Math.min(1, Math.max(0, ((x - a[0]) * dx + (y - a[1]) * dy) / L2)), d = Math.hypot(a[0] + dx * t - x, a[1] + dy * t - y);
    if (d < best) { best = d; bu = (i + t) / (pts.length - 1); }
  }
  return { d: best, u: bu };
}

/** The part under the point (x, y) (lobule radii, y down), or null. `tubes`: every vessel that may be tapped (the net's courses and the Bile layer's). */
export function lobuleHit(net: LobuleNet, tubes: readonly PickTube[], st: PickState, x: number, y: number): LobuleHit | null {
  const px = (n: number) => n / st.pxPerR;
  const near = Math.max(0.03, px(10));
  for (const tr of net.triads) if (Math.hypot(x - tr.x, y - tr.y) < net.rt * 1.2) {
    if (Math.hypot(x - tr.ha[0], y - tr.ha[1]) < near) return { part: 'ha', tri: tr.i };
    if (Math.hypot(x - tr.bd[0], y - tr.bd[1]) < near) return { part: 'bd', tri: tr.i };
    if (st.lymphOn && Math.hypot(x - tr.lv[0], y - tr.lv[1]) < near) return { part: 'lv', tri: tr.i };
    return { part: 'triad', tri: tr.i };
  }
  if (Math.hypot(x, y) < st.cvRadius + px(4)) return { part: 'cv' };
  let best: PickTube | null = null, bs = Infinity;
  for (const t of tubes) {
    if (t.kind === 'pv' || t.kind === 'cv' || t.kind === 'ha' || t.kind === 'bd') continue;
    const bile = t.kind === 'bs' || t.kind === 'bh', lymph = t.kind === 'ly' || t.kind === 'lt' || t.kind === 'lv';
    if (bile ? !st.bileOn : lymph && !st.lymphOn) continue;
    const { d, u } = distTo(t.pts, x, y), r = st.radius(t, Math.round(u * (t.pts.length - 1))), tol = Math.max(r + px(t.kind === 'tw' ? 6 : 5), px(10));
    const score = pickRank(d, r, (Z_OF as Record<string, number>)[t.kind] ?? 0, t.kind === 'tw' ? px(2) : 0, tierOf(t.kind)) as number;
    if (d < tol && score < bs) { bs = score; best = t; }
  }
  if (best) {
    const k = best.kind;
    return { part: k === 'tw' ? 'ha' : k === 'bs' || k === 'bh' ? k : k === 'ly' || k === 'lt' || k === 'lv' ? 'lv' : k[0] === 's' ? 'sin' : k, tube: best.id, tri: best.tri };
  }
  if (st.septU > 0.1) {
    const w = (0.02 + 0.05 * st.septU) / 2 + px(4), C = net.corners;
    for (let i = 0; i < 6; i++) {
      const A = C[i]!, B = C[(i + 1) % 6]!, dx = B[0] - A[0], dy = B[1] - A[1], L2 = dx * dx + dy * dy, t = Math.min(1, Math.max(0, ((x - A[0]) * dx + (y - A[1]) * dy) / L2));
      if (Math.hypot(A[0] + dx * t - x, A[1] + dy * t - y) < w) return { part: 'septum' };
    }
    if (st.septU > 0.18) for (const sp of net.septa) if (distTo(sp, x, y).d < w) return { part: 'septum' };
  }
  const q = hexFrac(x, y);
  return q < 1 ? { part: 'hep', zone: zoneOf(q) } : null;
}

/** The tap-anything card's selection for a hit (ui/action/selection.ts Sel, kept free of the UI here): the hepatocytes select their zone's card, every other part its own. */
export function lobuleSel(h: LobuleHit): { type: 'lobule'; part?: string; zone?: number } {
  return h.part === 'hep' ? { type: 'lobule', zone: h.zone } : { type: 'lobule', part: h.part };
}
