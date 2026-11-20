// A balloon stays inside its vessel (Mohammad, 20 Nov: "the balloon has to be maintained within the bounds of the blood vessel"): every ring of the glass, fully inflated, lies inside the drawn lumen of the vessel
// it is in (the vessel's own centreline and radius), the whole length of the balloon.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { balloonFit, ProcCatheter } from '../src/scene/devices/catheters/proc-catheter.ts';
import { makeRings } from '../src/scene/devices/tube-rings.ts';
import { route3d, nearestOnCourse } from '../src/scene/procedures/route3d.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { specFor } from '../src/ui/deck/procs-plan.ts';

for (const kind of ['hvpg', 'brto', 'brtoC6', 'bato']) {
  test(`${kind}: the inflated balloon lies inside its vein's lumen`, () => {
    const route = specFor(kind)?.route ?? kind, r3 = route3d(route)!;
    const rings = makeRings(41);
    const fit = balloonFit(r3, r3.rc, 1, r3.tipD(1), null, rings);
    assert.ok(fit.ol.length === 41);
    for (const q of rings) {
      let best: { dist: number; id: string } | null = null;
      for (const id of r3.route.ids) { const c = nearestOnCourse(id, q.c.x, q.c.y, q.c.z); if (c && (!best || c.dist < best.dist)) best = { dist: c.dist, id }; }
      const R = NETWORK_BY_ID.get(best!.id)!.radius;
      assert.ok(best!.dist + q.r <= R * 1.001, `${kind}: ring at ${best!.id} reaches ${(best!.dist + q.r).toFixed(4)} of a lumen ${R.toFixed(4)}`);
    }
  });
}
void ProcCatheter;
