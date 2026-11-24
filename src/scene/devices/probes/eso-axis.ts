// THE OESOPHAGUS WHERE THE STOMACH MESH HAS IT (the placed anatomy, `?anatomy=new`: docs/approved/anatomy-placement.md moves the stomach, the oesophagus with it, 16 % toward the middle). The scope's way is
// the 2D app's (eus-scope.js: its lead-in, the oesophagus, the cardia and the fundus, in the figure's own units); on the placed anatomy it is carried sideways, row by row, onto the oesophagus of the stomach
// mesh as it is built (organs/meshes.ts ORGAN_MESHES.stomach, whatever placement it holds), so the scope runs down the middle of the tube that is drawn and on into the stomach. Depth stays the scope's own
// rule (scope.ts scopeZ: the organ's middle in depth). Worked out once, from the geometry alone, when the organ file is in; pure.
import type { BufferGeometry } from 'three';

const CELL = 0.01;   // scene units (3 figure units)
/** The widest a slice of the mesh may be and still be the oesophagus (scene units): wider is the stomach's body or the fundus. */
export const ESO_MAX_WIDE = 0.16;

/** Per row of the mesh (y), the covered runs of x: where a line along z meets the surface. */
function coverage(pos: ArrayLike<number>, index: ArrayLike<number>): { y0: number; h: number; x0: number; w: number; on: Uint8Array } {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pos.length; i += 3) { x0 = Math.min(x0, pos[i]!); x1 = Math.max(x1, pos[i]!); y0 = Math.min(y0, pos[i + 1]!); y1 = Math.max(y1, pos[i + 1]!); }
  const w = Math.max(1, Math.ceil((x1 - x0) / CELL) + 1), h = Math.max(1, Math.ceil((y1 - y0) / CELL) + 1), on = new Uint8Array(w * h);
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t]! * 3, b = index[t + 1]! * 3, c = index[t + 2]! * 3;
    const ax = pos[a]!, ay = pos[a + 1]!, bx = pos[b]!, by = pos[b + 1]!, cx = pos[c]!, cy = pos[c + 1]!;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < 1e-14) continue;
    const gx0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / CELL)), gx1 = Math.min(w - 1, Math.ceil((Math.max(ax, bx, cx) - x0) / CELL));
    const gy0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - y0) / CELL)), gy1 = Math.min(h - 1, Math.ceil((Math.max(ay, by, cy) - y0) / CELL));
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
      const px = x0 + gx * CELL, py = y0 + gy * CELL;
      const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den;
      if (l1 >= -1e-6 && l2 >= -1e-6 && 1 - l1 - l2 >= -1e-6) on[gy * w + gx] = 1;
    }
  }
  return { y0, h, x0, w, on };
}

/** The sideways shift (scene units, a function of scene y) that carries the 2D way onto the mesh's oesophagus: at each row where the slice of the mesh round the way is narrow (the oesophagus), the slice's
 *  middle less the way's x; above the top of the mesh the top row's, below the oesophagus (the cardia and the stomach) the lowest narrow row's, smoothed over a few rows so the way never kinks.
 *  `wayX(y)`: the 2D way's x at scene height y (null where the way is not there). */
export function esoShift(geo: BufferGeometry, wayX: (y: number) => number | null): (y: number) => number {
  const pos = geo.getAttribute('position').array, idx = geo.index?.array;
  if (!idx) return () => 0;
  const g = coverage(pos, idx), d = new Float64Array(g.h).fill(NaN);
  for (let r = 0; r < g.h; r++) {
    const y = g.y0 + r * CELL, wx = wayX(y);
    if (wx == null) continue;
    const row = g.on.subarray(r * g.w, (r + 1) * g.w);
    // the covered cell nearest the way, and its run
    let c = -1, best = Infinity;
    for (let k = 0; k < g.w; k++) if (row[k]) { const e = Math.abs(g.x0 + k * CELL - wx); if (e < best) { best = e; c = k; } }
    if (c < 0 || best > ESO_MAX_WIDE) continue;
    let a = c, b = c;
    while (a > 0 && row[a - 1]) a--;
    while (b < g.w - 1 && row[b + 1]) b++;
    if ((b - a + 1) * CELL > ESO_MAX_WIDE) continue;
    d[r] = g.x0 + ((a + b) / 2) * CELL - wx;
  }
  // (rows with no reading take the nearest row's that has one: the lead-in above keeps the top's shift, the stomach below the cardia's)
  let first = -1, last = -1;
  for (let r = 0; r < g.h; r++) if (Number.isFinite(d[r]!)) { if (first < 0) first = r; last = r; }
  if (first < 0) return () => 0;
  for (let r = 0; r < g.h; r++) if (!Number.isFinite(d[r]!)) { let k = r; while (k >= 0 && !Number.isFinite(d[k]!)) k--; d[r] = k >= 0 && r > first ? d[k]! : r < first ? d[first]! : d[last]!; }
  const s = new Float64Array(g.h);
  for (let r = 0; r < g.h; r++) { let t = 0, n = 0; for (let k = -4; k <= 4; k++) { const j = Math.min(g.h - 1, Math.max(0, r + k)); t += d[j]!; n++; } s[r] = t / n; }
  return (y) => { const f = Math.min(g.h - 1, Math.max(0, (y - g.y0) / CELL)), i = Math.min(g.h - 2 < 0 ? 0 : g.h - 2, Math.floor(f)), u = f - i; return g.h < 2 ? s[0]! : s[i]! * (1 - u) + s[i + 1]! * u; };
}
