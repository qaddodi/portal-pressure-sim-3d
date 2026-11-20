// Where an organ's silhouette is, for a device that rests on its edge (the FibroScan probe: 2D puts its tip ON the organ's outline and aims it inward, stage-scan.js scanTipLocal). The 2D tip is a fraction of
// the organ's box; the 3D organs are meshes inflated from the 2D outlines and then scaled (the spleen's size), so a fraction of their box lands wherever the mesh's shape puts it, inside the organ as often as
// on it (owner, 20 Nov 2026: "the fibroscanners are NOT on top of the organs... floating on top in front of it"). The tip is now found, not guessed: the organ's coverage of the plate is baked once from its
// geometry (in the geometry's own frame, so the organ's current size and place cost nothing), and the line from the 2D point along the probe's aim is walked to the silhouette.
import { Matrix4, Vector3, type BufferGeometry } from 'three';

export const EDGE_CELL = 0.006;   // scene units (about 2 figure units)

export interface OrganMask { x0: number; y0: number; w: number; h: number; cover: Uint8Array; z: Float32Array }

/** The plate cells an indexed mesh covers (its xy shadow) and the middle of its depth there. Pure: positions and indices in. */
export function bakeMask(pos: ArrayLike<number>, index: ArrayLike<number>, cell = EDGE_CELL): OrganMask {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < pos.length; i += 3) { x0 = Math.min(x0, pos[i]!); x1 = Math.max(x1, pos[i]!); y0 = Math.min(y0, pos[i + 1]!); y1 = Math.max(y1, pos[i + 1]!); }
  const w = Math.max(1, Math.ceil((x1 - x0) / cell) + 1), h = Math.max(1, Math.ceil((y1 - y0) / cell) + 1);
  const lo = new Float32Array(w * h).fill(Infinity), hi = new Float32Array(w * h).fill(-Infinity);
  for (let t = 0; t < index.length; t += 3) {
    const a = index[t]! * 3, b = index[t + 1]! * 3, c = index[t + 2]! * 3;
    const ax = pos[a]!, ay = pos[a + 1]!, az = pos[a + 2]!, bx = pos[b]!, by = pos[b + 1]!, bz = pos[b + 2]!, cx = pos[c]!, cy = pos[c + 1]!, cz = pos[c + 2]!;
    const den = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
    if (Math.abs(den) < 1e-12) continue;
    const gx0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - x0) / cell)), gx1 = Math.min(w - 1, Math.ceil((Math.max(ax, bx, cx) - x0) / cell));
    const gy0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - y0) / cell)), gy1 = Math.min(h - 1, Math.ceil((Math.max(ay, by, cy) - y0) / cell));
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
      const px = x0 + gx * cell, py = y0 + gy * cell;
      const l1 = ((by - cy) * (px - cx) + (cx - bx) * (py - cy)) / den, l2 = ((cy - ay) * (px - cx) + (ax - cx) * (py - cy)) / den, l3 = 1 - l1 - l2;
      if (l1 < -1e-6 || l2 < -1e-6 || l3 < -1e-6) continue;
      const z = l1 * az + l2 * bz + l3 * cz, k = gy * w + gx;
      if (z < lo[k]!) lo[k] = z;
      if (z > hi[k]!) hi[k] = z;
    }
  }
  const cover = new Uint8Array(w * h), z = new Float32Array(w * h);
  for (let k = 0; k < z.length; k++) if (hi[k]! >= lo[k]!) { cover[k] = 1; z[k] = (lo[k]! + hi[k]!) / 2; }
  return { x0, y0, w, h, cover, z };
}

const masks = new WeakMap<BufferGeometry, OrganMask>();
/** An organ's mask, baked the first time it is asked for (a few ms) and kept with its geometry. */
export function maskOf(g: BufferGeometry, cell = EDGE_CELL): OrganMask {
  let m = masks.get(g);
  if (!m) { m = bakeMask(g.getAttribute('position').array, g.index!.array, cell); masks.set(g, m); }
  return m;
}

function cellOf(m: OrganMask, x: number, y: number, cell: number): number {
  const gx = Math.round((x - m.x0) / cell), gy = Math.round((y - m.y0) / cell);
  return gx < 0 || gy < 0 || gx >= m.w || gy >= m.h ? -1 : gy * m.w + gx;
}
/** True where the organ covers the plate point (the mask's own frame). */
export function covers(m: OrganMask, x: number, y: number, cell = EDGE_CELL): boolean { const k = cellOf(m, x, y, cell); return k >= 0 && m.cover[k] === 1; }

const inv = new Matrix4(), la = new Vector3(), ld = new Vector3(), sc = new Vector3();
/**
 * The point on the organ's silhouette on the line through `anchor` (world) with the unit direction `aim` (world, in the plate: the way the probe points, inward): where the line leaves the organ going
 * backwards from an anchor that is inside it, or enters it going forward from one that is outside. The point is the covered side of the edge, with the mesh's depth there, in world. False when the
 * line never meets the organ within `reach` (world units). `world`: the organ's world matrix (its size and place now).
 */
export function edgeOnLine(m: OrganMask, world: Matrix4, anchor: Vector3, aim: Vector3, out: Vector3, reach = 2, cell = EDGE_CELL): boolean {
  inv.copy(world).invert();
  la.copy(anchor).applyMatrix4(inv); ld.copy(aim).transformDirection(inv); ld.z = 0;
  if (ld.lengthSq() < 1e-12) return false;
  ld.normalize();
  const s = sc.setFromMatrixScale(world).x || 1, max = reach / s, step = cell * 0.5;
  const inside = covers(m, la.x, la.y, cell), sgn = inside ? -1 : 1;
  let t0 = 0, t1 = -1;
  for (let t = step; t <= max; t += step) {
    const c = covers(m, la.x + ld.x * sgn * t, la.y + ld.y * sgn * t, cell);
    if (c !== inside) { t1 = t; break; }
    t0 = t;
  }
  if (t1 < 0) return false;
  // t0 is on the anchor's side of the edge, t1 on the other: the covered one is the answer, bisected to a fraction of a cell
  let a = t0, b = t1;
  for (let i = 0; i < 6; i++) { const mid = (a + b) / 2; if (covers(m, la.x + ld.x * sgn * mid, la.y + ld.y * sgn * mid, cell) === inside) a = mid; else b = mid; }
  const tc = inside ? a : b, px = la.x + ld.x * sgn * tc, py = la.y + ld.y * sgn * tc, k = cellOf(m, px, py, cell);
  out.set(px, py, k >= 0 ? m.z[k]! : 0).applyMatrix4(world);
  return true;
}
