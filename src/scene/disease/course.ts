// A vein's course as the 2D figure draws it, for the lesions that lie along it. A vein the engine cuts where a shunt or a collateral joins it (the portal trunk, cut where the
// coronary vein joins) is one vein: its pieces are joined end to end here (clot-shape.js clotStretch does the same in 2D), so a clot is the whole vein's, not a piece's.
import { Vector3 } from 'three';
import { JUNCTION_PIECES } from '../../engine/hales/portal/topology.js';
import { NETWORK_BY_ID } from '../vessels/network.ts';

export interface Course { pts: Vector3[]; radius: number; ids: string[] }
const cache = new Map<string, Course | null>();

export function hostCourse(id: string): Course | null {
  if (cache.has(id)) return cache.get(id)!;
  const ids = ((JUNCTION_PIECES as Record<string, string[]>)[id] ?? [id]).filter((q) => NETWORK_BY_ID.has(q));
  if (!ids.length) { cache.set(id, null); return null; }
  const pts: Vector3[] = [];
  let r = 0;
  for (const q of ids) {
    const v = NETWORK_BY_ID.get(q)!;
    r += v.radius / ids.length;
    for (const p of v.pts) { const c = new Vector3(p[0], p[1], p[2]); if (!pts.length || pts[pts.length - 1]!.distanceTo(c) > 1e-6) pts.push(c); }
  }
  const out = { pts, radius: r, ids };
  cache.set(id, out);
  return out;
}
