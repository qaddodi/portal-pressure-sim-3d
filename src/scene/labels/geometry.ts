// Plain box and segment rules every label decision shares (ported from the 2D app's label-place.js, in TypeScript). Boxes are
// { x0, y0, x1, y1 } in canvas CSS pixels. No DOM, no three.js: node judges all of it.

export interface Box { x0: number; y0: number; x1: number; y1: number }
export type Dir = 'N' | 'S' | 'E' | 'W' | 'NE' | 'NW' | 'SE' | 'SW';

export const COMPASS: readonly Dir[] = ['E', 'W', 'N', 'S', 'NE', 'NW', 'SE', 'SW'];

export const rectToBox = (r: { x: number; y: number; w: number; h: number }): Box => ({ x0: r.x, y0: r.y, x1: r.x + r.w, y1: r.y + r.h });
export const grow = (b: Box, by: number): Box => ({ x0: b.x0 - by, y0: b.y0 - by, x1: b.x1 + by, y1: b.y1 + by });

/** Whether two boxes overlap. */
export const hits = (a: Box, b: Box): boolean => a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
/** Whether box r lies wholly inside box B. */
export const within = (r: Box, B: Box): boolean => r.x0 >= B.x0 && r.y0 >= B.y0 && r.x1 <= B.x1 && r.y1 <= B.y1;
/** How far the point (x, y) stands from the box; 0 when it lies inside. */
export const boxGap = (b: Box, x: number, y: number): number => { const dx = Math.max(b.x0 - x, 0, x - b.x1), dy = Math.max(b.y0 - y, 0, y - b.y1); return Math.sqrt(dx * dx + dy * dy); };   // (not Math.hypot: the solver asks this a million times a solve, and hypot is several times slower)

/** Whether the segment (x0, y0) to (x1, y1) passes through the box (Liang-Barsky). */
export function crosses(x0: number, y0: number, x1: number, y1: number, b: Box): boolean {
  let t0 = 0, t1 = 1;
  const dx = x1 - x0, dy = y1 - y0;
  for (let n = 0; n < 4; n++) {
    const p = n === 0 ? -dx : n === 1 ? dx : n === 2 ? -dy : dy;
    const q = n === 0 ? x0 - b.x0 : n === 1 ? b.x1 - x0 : n === 2 ? y0 - b.y0 : b.y1 - y0;
    if (!p) { if (q < 0) return false; continue; }
    const r = q / p;
    if (p < 0) t0 = Math.max(t0, r); else t1 = Math.min(t1, r);
    if (t0 > t1) return false;
  }
  return true;
}

/** Whether two segments properly cross. */
export function segsCross(a: [number, number, number, number], b: [number, number, number, number]): boolean {
  const d = (ax: number, ay: number, bx: number, by: number, cx: number, cy: number) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d1 = d(b[0], b[1], b[2], b[3], a[0], a[1]), d2 = d(b[0], b[1], b[2], b[3], a[2], a[3]);
  const d3 = d(a[0], a[1], a[2], a[3], b[0], b[1]), d4 = d(a[0], a[1], a[2], a[3], b[2], b[3]);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** The top-left corner of a w by h box placed at compass spot `dir` of an anchor at distance `gap` (the 2D app's `offset`). 'C' centres it on the anchor. */
export function offsetOf(dir: Dir | 'C', w: number, h: number, gap: number): [number, number] {
  const d = gap * 0.72;
  switch (dir) {
    case 'N': return [-w / 2, -gap - h];
    case 'S': return [-w / 2, gap];
    case 'E': return [gap, -h / 2];
    case 'W': return [-gap - w, -h / 2];
    case 'NE': return [d, -d - h];
    case 'NW': return [-d - w, -d - h];
    case 'SE': return [d, d];
    case 'SW': return [-d - w, d];
    default: return [-w / 2, -h / 2];
  }
}

/** Spots at growing distance round an anchor, as offsets of the box's centre: the wide search of a label with no room beside its vein. */
export const RING_SPOTS: readonly (readonly [number, number])[] = [36, 52, 68, 84, 100, 120, 140].flatMap((r) =>
  Array.from({ length: 24 }, (_, a) => [Math.round(r * Math.cos((a * Math.PI) / 12)), Math.round(r * Math.sin((a * Math.PI) / 12))] as const));

/** The point of the box nearest to (x, y). */
export function nearestOn(b: Box, x: number, y: number): [number, number] {
  return [Math.min(b.x1, Math.max(b.x0, x)), Math.min(b.y1, Math.max(b.y0, y))];
}

/** A line from the anchor to the nearest point of the box, as the transform pieces a 1 px line element takes: start, length, angle (radians). */
export function leaderGeom(ax: number, ay: number, b: Box): { x: number; y: number; len: number; angle: number } {
  const [px, py] = nearestOn(b, ax, ay);
  return { x: ax, y: ay, len: Math.hypot(px - ax, py - ay), angle: Math.atan2(py - ay, px - ax) };
}
