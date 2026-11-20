// The one accessor for a vessel's drawn centreline and radius (vessels/centreline.ts): anything that lies in a vessel binds to it, so it can never disagree with the tube (Mohammad, 20 Nov: the HVPG column left the hepatic vein).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CelScene } from '../src/scene/scene.ts';
import { centrelineOf } from '../src/scene/vessels/centreline.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { REST, coursesOf } from '../src/scene/vessels/shape.ts';

test('the centreline of a rebuilt vein is its drawn course: ends, heading and a radius that tapers to its tip', () => {
  for (const id of ['RHV_IVC_1', 'LHV_IVC', 'PVH_R_2', 'PVH_L_1', 'PV_TRUNK', 'C3']) {
    const cl = centrelineOf(id)!;
    assert.ok(cl && cl.length > 0, id);
    const c = coursesOf(NETWORK_BY_ID.get(id)!, REST)[0]!, a = cl.pointAt(0), z = cl.pointAt(1);
    assert.ok(Math.hypot(a[0] - c.pts[0]![0], a[1] - c.pts[0]![1], a[2] - c.pts[0]![2]) < 1e-6, `${id} starts where its tube does`);
    assert.ok(Math.hypot(z[0] - c.pts[c.pts.length - 1]![0], z[1] - c.pts[c.pts.length - 1]![1], z[2] - c.pts[c.pts.length - 1]![2]) < 1e-6, `${id} ends where its tube does`);
    const t = cl.tangentAt(0.5);
    assert.ok(Math.abs(Math.hypot(t[0], t[1], t[2]) - 1) < 1e-6, `${id} unit heading`);
    assert.ok(cl.radiusAt(0.5) > 0);
    const mid = cl.pointAt(0.5), u = cl.nearestU(mid);
    assert.ok(Math.abs(u - 0.5) < 0.02, `${id} nearestU finds a point on it`);
  }
  const rhv = centrelineOf('RHV_IVC_1')!, pv = centrelineOf('PVH_R_2')!;
  assert.ok(rhv.radiusAt(0.3) < rhv.radiusAt(0.7), 'a hepatic vein runs from its tip (narrow) to the cava');
  assert.ok(pv.radiusAt(0.3) > pv.radiusAt(0.7), 'a portal branch narrows toward its tip');
});

test('the scene hands out the same centreline at its present shape', () => {
  const s = new CelScene();
  const cl = s.vesselCentreline('RHV_IVC_1')!;
  assert.ok(cl && cl.length > 0);
  assert.equal(s.vesselCentreline('nope'), null);
  s.dispose();
});
