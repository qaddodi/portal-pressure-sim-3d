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
export interface Silhouettes { rings: Map<string, Ring[]> }
export function silhouettes(to: To2Screen): Silhouettes {
  const rings = new Map<string, Ring[]>();
  for (const id of OTHER) rings.set(id, ringsOf(id).map((r) => r.map(([x, y]) => to(x, y))));
  return { rings };
}

const inRing = (x: number, y: number, P: Ring): boolean => {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i][1] > y) !== (P[j][1] > y) && x < ((P[j][0] - P[i][0]) * (y - P[i][1])) / (P[j][1] - P[i][1]) + P[i][0]) c = !c;
  return c;
};
const inside = (rings: Ring[], x: number, y: number): boolean => rings.reduce((n, P) => n + (inRing(x, y, P) ? 1 : 0), 0) % 2 === 1;   // even-odd: a ring's hole is outside
/** Organ-names.js boxOn: a vertex of the outline inside the box, or a point of a 5 by 3 grid over the box inside the outline. */
const boxOn = (rings: Ring[], b: Box): boolean => {
  for (const P of rings) for (const [x, y] of P) if (x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1) return true;
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 2; j++) if (inside(rings, b.x0 + ((b.x1 - b.x0) * i) / 4, b.y0 + ((b.y1 - b.y0) * j) / 2)) return true;
  return false;
};

/** Whether a caption's box (canvas px) lies on an organ other than its own (organ-names.js onOtherOrgan, on the screen). */
export function onOtherOrgan(name: string, sil: Silhouettes, b: Box): boolean {
  const own = famOf(organOfName(name));
  for (const id of OTHER) if (famOf(id) !== own && boxOn(sil.rings.get(id) ?? [], b)) return true;
  return false;
}

/** The other places a name may stand (centres of its box, canvas px offsets from its anchor's screen point), nearest the anchor first. */
export function spotOffsets(name: string, anchor2d: readonly [number, number], to: To2Screen): [number, number][] {
  const a = to(anchor2d[0], anchor2d[1]);
  return (nameSpots(name) as [number, number][]).map(([x, y]) => { const p = to(x, y); return [p[0] - a[0], p[1] - a[1]] as [number, number]; });
}
export { OFF_NEAR };
