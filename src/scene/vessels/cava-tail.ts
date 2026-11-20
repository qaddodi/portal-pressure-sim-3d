// A hepatic vein opens into the cava by ending on the cava's axis (the 2D figure's own geometry), so its last stretch, one cava radius, lies INSIDE the cava's lumen. Drawn there it is a round tube end with a wall line and a dark
// wedge over the cava's marks, seen through the faint cava (eyes crops of 1a5e293: "each vein ends as a round tube end with a round disc inside the IVC"). A vein is not a tube inside the vessel it opens into: that stretch fades out.
import { NETWORK_BY_ID } from './network.ts';
import { REST, coursesOf } from './shape.ts';
import { HEPATIC_VEINS } from './fades.ts';
import type { Course } from './tubes.ts';

const CAVA_ID = 'IVC_IS';

/** The share of vein `id`'s length (0 to 0.5) that lies inside the cava's lumen: the cava's radius when the vein's end is within it, else 0. `courses` are the vein's own (as built), `len` its length in scene units. */
export function cavaTailOf(id: string, courses: readonly Course[], len: number): number {
  if (!HEPATIC_VEINS.has(id) || id === 'LRV_IVC' || id === 'RRV_IVC' || len <= 0) return 0;
  const cava = NETWORK_BY_ID.get(CAVA_ID);
  if (!cava) return 0;
  const cc = coursesOf(cava, REST)[0];
  const c = courses.reduce((a, b) => (b.radius > a.radius ? b : a));
  if (!cc || !c || c.pts.length < 2) return 0;
  const e = c.pts[c.pts.length - 1]!;
  let d = Infinity;
  for (const p of cc.pts) d = Math.min(d, Math.hypot(p[0] - e[0], p[1] - e[1]));
  return d < cc.radius ? Math.min(0.5, cc.radius / len) : 0;
}
