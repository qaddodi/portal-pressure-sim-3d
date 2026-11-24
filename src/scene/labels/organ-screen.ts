// Where an organ's name may stand, on the 3D figure's screen: the 2D app's own rules (organ-names.js, copied: organ2d/), carried onto the canvas.
//
// The names with no room at their anchor take the nearest other spot of their own organ (nameSpots, 2D world units, nearest the anchor first) that no vessel
// touches; a name that stands beside its organ (the spleen's above it, the kidney's below it, the atrium's and the esophagus's at their side) needs the
// organ's silhouette to know how near is near enough, and every name keeps off the other organs where it can ("RIGHT ATRIUM on the esophagus", 11 Nov). The
// silhouettes are the organs' 2D outlines (the same ones the 3D organs are extruded from, frame2d.ts), projected by the camera each time labels are solved.
// @ts-ignore copied plain JS
import { ORGANS } from './organ2d/outlines.copied.js';
// @ts-ignore copied plain JS
import { flattenPath } from './organ2d/flatten.js';
// @ts-ignore copied plain JS
import { nameSpots, NAME_ORGAN, OFF_NEAR } from './organ2d/organ-names.copied.js';
import type { Box } from './geometry.ts';
import { withOrgan } from '../editor-anchors.ts';

type Ring = [number, number][];
const flat = new Map<string, Ring[]>();
/** The organ's outline as rings of 2D world points, flattened to about 4 units a piece (cut once, kept). */
function ringsOf(id: string): Ring[] {
  let r = flat.get(id);
  if (!r) {
    const o = (ORGANS as { id: string; d?: string; ring?: string }[]).find((q) => q.id === id);
    const polys: { pts: number[] }[] = o ? flattenPath((o.ring ?? o.d)!, 4) : [];
    r = polys.map((p) => Array.from({ length: p.pts.length / 2 }, (_, i) => [p.pts[2 * i], p.pts[2 * i + 1]] as [number, number])).filter((q) => q.length > 2);
    flat.set(id, r);
  }
  return r;
}

const OTHER = ['esophagus', 'heart', 'bowel', 'colon', 'kidney-l', 'spleen', 'stomach', 'liver'] as const;
const famOf = (id: string) => id.split('-')[0];
/** The organ each name belongs to (organ-names.js NAME_ORGAN), by the caption's word ('Right atrium'). */
export const organOfName = (name: string): string => (NAME_ORGAN as Record<string, string>)[name] ?? '';

export type To2Screen = (x2d: number, y2d: number) => [number, number];

/** The organs' silhouettes on the canvas now: rings of screen points, by organ id. */
export interface Silhouettes { rings: Map<string, Ring[]>; /** each ring's box and its edges filed by horizontal band (`bands`), so a caption's box is tested only against the rings it can touch and a point only against the edges that cross its line */ bounds: Map<string, Box[]>; edges: Map<string, Edges[]> }
const BAND = 8;
/** A ring's edges filed under every horizontal band of BAND px they span (the crossing test of `inRing` only needs the edges that straddle the point's line). */
interface Edges { y0: number; bands: number[][] }
export function silhouettes(to: To2Screen): Silhouettes {
  const rings = new Map<string, Ring[]>(), bounds = new Map<string, Box[]>(), edges = new Map<string, Edges[]>();
  for (const id of OTHER) {
    const rs = ringsOf(id).map((r) => r.map(([x, y]) => { const q = withOrgan(id === 'esophagus' ? 'stomach' : id, [x, y]); return to(q[0], q[1]); }));
    rings.set(id, rs);
    const bb: Box[] = [], ee: Edges[] = [];
    for (const r of rs) {
      const b: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
      for (const [x, y] of r) { if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x; if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y; }
      bb.push(b);
      const e: Edges = { y0: b.y0, bands: [] };
      const n = Number.isFinite(b.y1 - b.y0) ? Math.floor((b.y1 - b.y0) / BAND) + 1 : 0;
      for (let k = 0; k < n; k++) e.bands.push([]);
      for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        const lo = Math.min(r[i]![1], r[j]![1]), hi = Math.max(r[i]![1], r[j]![1]);
        for (let k = Math.floor((lo - b.y0) / BAND); k <= Math.floor((hi - b.y0) / BAND); k++) e.bands[k]?.push(i);
      }
      ee.push(e);
    }
    bounds.set(id, bb); edges.set(id, ee);
  }
  return { rings, bounds, edges };
}

/** Whether (x, y) is inside the ring (even-odd): `inRing`'s crossing count over the edges of the point's band only. */
const inRing = (x: number, y: number, P: Ring, e: Edges): boolean => {
  let c = false;
  const band = e.bands[Math.floor((y - e.y0) / BAND)];
  if (!band) return false;
  for (const i of band) {
    const j = i === 0 ? P.length - 1 : i - 1;
    if ((P[i]![1] > y) !== (P[j]![1] > y) && x < ((P[j]![0] - P[i]![0]) * (y - P[i]![1])) / (P[j]![1] - P[i]![1]) + P[i]![0]) c = !c;
  }
  return c;
};
/** Organ-names.js boxOn: a vertex of the outline inside the box, or a point of a 5 by 3 grid over the box inside the outline. */
const boxOn = (rings: Ring[], bounds: Box[], edges: Edges[], b: Box): boolean => {
  const near: number[] = [];
  rings.forEach((_, i) => { const r = bounds[i]!; if (r.x1 >= b.x0 && r.x0 <= b.x1 && r.y1 >= b.y0 && r.y0 <= b.y1) near.push(i); });   // (a ring the box does not meet has no vertex in it and no point of it inside the ring)
  if (!near.length) return false;
  for (const k of near) for (const [x, y] of rings[k]!) if (x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1) return true;
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 2; j++) {
    const x = b.x0 + ((b.x1 - b.x0) * i) / 4, y = b.y0 + ((b.y1 - b.y0) * j) / 2;
    let n = 0;
    for (const k of near) if (inRing(x, y, rings[k]!, edges[k]!)) n++;
    if (n % 2 === 1) return true;   // (even-odd: a ring's hole is outside)
  }
  return false;
};

/** Whether a caption's box (canvas px) lies on an organ other than its own (organ-names.js onOtherOrgan, on the screen). */
export function onOtherOrgan(name: string, sil: Silhouettes, b: Box): boolean {
  const own = famOf(organOfName(name));
  for (const id of OTHER) if (famOf(id) !== own && boxOn(sil.rings.get(id) ?? [], sil.bounds.get(id) ?? [], sil.edges.get(id) ?? [], b)) return true;
  return false;
}

/** The share (0 to 1) of a caption's box, by a 5 by 3 grid of points, that lies on an organ other than its own: what the last resort prices, so a name that cannot keep off every other organ stays on the least of them
 *  (a name that crowded onto the liver edge below its atrium because a vessel line cost more than the liver did: the fallback counted only lines). */
export function shareOnOther(name: string, sil: Silhouettes, b: Box): number {
  const own = famOf(organOfName(name));
  let n = 0;
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 2; j++) {
    const x = b.x0 + ((b.x1 - b.x0) * i) / 4, y = b.y0 + ((b.y1 - b.y0) * j) / 2;
    for (const id of OTHER) {
      if (famOf(id) === own) continue;
      const rs = sil.rings.get(id) ?? [], es = sil.edges.get(id) ?? [], bs = sil.bounds.get(id) ?? [];
      let c = 0;
      rs.forEach((r, k) => { const q = bs[k]!; if (x >= q.x0 && x <= q.x1 && y >= q.y0 && y <= q.y1 && inRing(x, y, r, es[k]!)) c++; });
      if (c % 2 === 1) { n++; break; }
    }
  }
  return n / 15;
}

/** The other places a name may stand (centres of its box, canvas px offsets from its anchor's screen point), nearest the anchor first. */
export function spotOffsets(name: string, anchor2d: readonly [number, number], to: To2Screen): [number, number][] {
  const a = to(anchor2d[0], anchor2d[1]);
  const organ = organOfName(name);
  return (nameSpots(name) as [number, number][]).map(([x, y]) => { const m = withOrgan(organ === 'esophagus' ? 'stomach' : organ === 'heart' ? 'heart-ra' : organ, [x, y]), p = to(m[0], m[1]); return [p[0] - a[0], p[1] - a[1]] as [number, number]; });
}
export { OFF_NEAR };
