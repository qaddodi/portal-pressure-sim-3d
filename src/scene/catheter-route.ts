import { EDGE_PATH_2D, PLACED } from './anatomy/source.ts';
import { route3d } from './procedures/route3d.ts';
import { NETWORK_BY_ID } from './vessels/network.ts';
import { TIER_Z, x3, y3 } from './frame2d.ts';
import type { Vec3 } from './anatomy/vessels.ts';

// The HVPG catheter's route, laid on the 2D figure's own vessels (stage-cath.js cathRoute) and carried into the scene by the one map (frame2d.ts):
// a lead-in above the neck, the SVC, the right atrium, down the middle of the IVC to the level where the right hepatic vein opens into it, then out the
// right hepatic vein to where the tip reads, 62 % of the way along that vein (stage-cath.js: free = hv0 + (hv1 - hv0) * 0.62).
// The vessels sit on their 2D tiers (the cava behind, the hepatic veins in front), so the catheter takes each vessel's depth and eases between them over
// a short stretch, the way a wire bends through the corner where the IVC turns into the vein, instead of jumping.

type P2 = readonly [number, number];
const pathOf = (id: string, rev = false): P2[] => { const p = EDGE_PATH_2D[id]; if (!p) throw new Error(`no 2D course for ${id}`); return (rev ? [...p].reverse() : [...p]) as P2[]; };
const depthOf = (id: string): number => TIER_Z[NETWORK_BY_ID.get(id)!.tier];

/** Where the tip stops along the right hepatic vein, from the IVC outward (the 2D app's 0.62). */
export const TIP_ALONG_RHV = 0.62;
/** How far (scene units) the depth eases on each side of a change of vessel. */
const Z_EASE = 0.3;

export function catheterRoute(): Vec3[] {
  if (PLACED) return placedRoute();
  // [2D x, 2D y, scene z]
  const raw: [number, number, number][] = [];
  const add = (id: string, rev = false, from = 1) => { const z = depthOf(id); pathOf(id, rev).slice(from).forEach(([x, y]) => raw.push([x, y, z])); };
  const top = pathOf('SVC_RA_1')[0]!;
  const zTop = depthOf('SVC_RA_1');
  raw.push([top[0] - 6, top[1] - 150, zTop], [top[0] - 2, top[1] - 60, zTop], [top[0], top[1], zTop]);
  add('SVC_RA_1'); add('SVC_RA'); add('IVCS_RA', true);
  // on down the middle of the IVC to the level where the right hepatic vein opens into it
  const ostY = pathOf('RHV_IVC').at(-1)![1];
  const zIvc = depthOf('IVC_IS');
  for (const [x, y] of pathOf('IVC_IS', true).slice(1)) { if (y >= ostY - 4) break; raw.push([x, y, zIvc]); }
  // the vein from the IVC outward (the engine cuts it in two pieces where a shunt can join), stopping where the tip reads
  const vein: [number, number, number][] = [];
  for (const [id, z] of [['RHV_IVC', depthOf('RHV_IVC')], ['RHV_IVC_1', depthOf('RHV_IVC_1')]] as const) pathOf(id, true).slice(1).forEach(([x, y]) => vein.push([x, y, z]));
  const cum = [0];
  for (let i = 1; i < vein.length; i++) cum.push(cum[i - 1]! + Math.hypot(vein[i]![0] - vein[i - 1]![0], vein[i]![1] - vein[i - 1]![1]));
  const stop = cum.at(-1)! * TIP_ALONG_RHV;
  let k = 0;
  while (k < vein.length - 1 && cum[k + 1]! < stop) k++;
  const u = (stop - cum[k]!) / Math.max(1e-9, cum[k + 1]! - cum[k]!);
  for (let i = 0; i <= k; i++) raw.push(vein[i]!);
  raw.push([vein[k]![0] + (vein[k + 1]![0] - vein[k]![0]) * u, vein[k]![1] + (vein[k + 1]![1] - vein[k]![1]) * u, vein[k + 1]![2]]);

  // scene units, with the depth eased over Z_EASE of arc length either side
  const pts = raw.map(([x, y, z]) => [x3(x), y3(y), z] as [number, number, number]);
  const arc = [0];
  for (let i = 1; i < pts.length; i++) arc.push(arc[i - 1]! + Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]));
  const z0 = pts.map((p) => p[2]);
  for (let i = 0; i < pts.length; i++) {
    let s = 0, w = 0;
    for (let j = 0; j < pts.length; j++) { const d = Math.abs(arc[j]! - arc[i]!); if (d > Z_EASE) continue; const g = 1 - d / Z_EASE; s += z0[j]! * g; w += g; }
    pts[i]![2] = s / w;
  }
  // every third sample (the ends kept): the curve is smooth through them
  return pts.filter((_, i) => i % 3 === 0 || i === pts.length - 1);
}

/** The placed anatomy (`?anatomy=new`): the HVPG route laid in 3D on the drawn courses (procedures/route-placed.ts), from the neck to where the tip wedges in the lower right hepatic branch, the shaft's
 *  own rounded path inside the lumen (route3d.ts), sampled about every 3.6 figure units. */
function placedRoute(): Vec3[] {
  const r3 = route3d('hvpg')!, end = r3.route.free, n = Math.max(2, Math.ceil(end / 3.6) + 1), out: Vec3[] = [];
  for (let i = 0; i < n; i++) { const p = r3.point((end * i) / (n - 1)); out.push([p.x, p.y, p.z]); }
  return out;
}
