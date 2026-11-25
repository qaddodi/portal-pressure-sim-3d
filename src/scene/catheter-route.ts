import { route3d } from './procedures/route3d.ts';
import type { Vec3 } from './anatomy/vessels.ts';

// The HVPG catheter's route: laid in 3D on the drawn courses (procedures/route-placed.ts), from the neck down the SVC, the right atrium and the IVC to where the tip wedges in the main
// right hepatic vein, the shaft's own rounded path inside the lumen (route3d.ts), sampled about every 3.6 figure units. (The 2D figure's own route, stage-cath.js cathRoute with the tip
// 62 % along the vein on the flat tiers, was the anatomy before the cut-over, last at commit f17b151a.)
export function catheterRoute(): Vec3[] {
  const r3 = route3d('hvpg')!, end = r3.route.free, n = Math.max(2, Math.ceil(end / 3.6) + 1), out: Vec3[] = [];
  for (let i = 0; i < n; i++) { const p = r3.point((end * i) / (n - 1)); out.push([p.x, p.y, p.z]); }
  return out;
}
