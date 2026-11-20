// Where a stent sits in its vessel: the vessel's own drawn course and its radius along it, so the stent lies at the vessel's depth and never wider than the lumen (bends, tapered ends and a flared heel
// included). Read from the same tubes the scene draws (vessels/tubes.ts buildTubes on the vessel's own courses), never a second guess.
import type { Vec3 } from '../../anatomy/vessels.ts';
import { courseOf, NETWORK_BY_ID } from '../../vessels/network.ts';
import { REST, coursesOf } from '../../vessels/shape.ts';
import { smoothJoinsOn } from '../../vessels/join-mode.ts';
import { buildTubes } from '../../vessels/tubes.ts';

export interface VesselFit {
  /** the vessel's course, scene units (z at the vessel's own depth) */
  pts: Vec3[];
  /** the vessel's radius at fraction u of its course, as a share of its radius in the middle (1 along its body, less at a tapered end, more at a flared heel) */
  at(u: number): number;
}
const memo = new Map<string, VesselFit>();
const K = 64;

/** The fit for a vessel, built once per switch of the smooth joins. */
export function vesselFit(id: string): VesselFit {
  const key = `${id}|${smoothJoinsOn() ? 1 : 0}`, hit = memo.get(key);
  if (hit) return hit;
  const v = NETWORK_BY_ID.get(id)!, course = coursesOf(v, REST)[0];
  let fit: VesselFit;
  if (!course || !(course.radius > 0)) fit = { pts: courseOf(id), at: () => 1 };
  else {
    const b = buildTubes([course], [K], v.radius), run = b.runs[0]!, rk = b.geometry.getAttribute('rk');
    const r: number[] = [];
    for (let k = 0; k <= run.tubular; k++) r.push(rk.getX(run.tubeStart + k * (run.radial + 1)));
    const mid = r[Math.round(run.tubular / 2)]! || 1;
    fit = {
      pts: course.pts,
      at: (u) => { const f = Math.min(run.tubular, Math.max(0, u * run.tubular)), i = Math.min(run.tubular - 1, Math.floor(f)); return (r[i]! + (r[i + 1]! - r[i]!) * (f - i)) / mid; },
    };
    b.geometry.dispose();
  }
  memo.set(key, fit);
  return fit;
}
