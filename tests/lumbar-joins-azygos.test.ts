// The ascending lumbar collateral (C9) is the cava's own collateral (Mohammad, 20 Nov: "in Budd-Chiari the ascending lumbar vein should be faded just like the IVC, behind the liver, and should join somewhere
// systemically; it shouldn't just end abruptly into the void"). Root causes: (1) 2D joins it to the azygos TRUNK at y 108, a trunk that is not drawn in 3D, so it ended 78 units short of the arch; (2) it was
// drawn solid, as a vessel in front of the liver, not as the cava is (receded, only as the veil copy over the organs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CelScene } from '../src/scene/scene.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { REST, coursesOf } from '../src/scene/vessels/shape.ts';
import { CAVA_LIKE, CAVA_RECEDE, fadeOf } from '../src/scene/vessels/fades.ts';
import { NODE_POS_2D } from '../src/scene/vessels/paths.copied.ts';
import { FAINT_ONLY_LAYER } from '../src/scene/vessels/vessel-object.ts';
import { x3, y3 } from '../src/scene/frame2d.ts';
import { PLACED_NODE_3D } from '../src/scene/anatomy/placed-network.ts';
import { centrelineOf } from '../src/scene/vessels/centreline.ts';
import { tipAlpha, vesselAlphaAt } from '../src/scene/vessels/fade-alpha.ts';

test('the ascending lumbar collateral runs on into the azygos start (Plan 16D): it ends where the arch starts, and the esophageal collateral lands on the arch at the node', () => {
  const c9 = NETWORK_BY_ID.get('C9')!, end = c9.pts.length ? coursesOf(c9, REST)[0]!.pts.at(-1)! : [0, 0, 0], arch = NETWORK_BY_ID.get('AZY_SVC')!, start = coursesOf(arch, REST)[0]!.pts[0]!;
  const d = Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
  assert.ok(d * 700 <= 0.5, `the lumbar vein ends ${(d * 700).toFixed(3)} px from where the arch starts (one ring)`);
  assert.equal(c9.to, 'AZY');
  assert.equal(arch.from, 'AZY', 'the arch starts at the node the collateral ends at');
  const c1b = NETWORK_BY_ID.get('C1b')!, [ax, ay] = NODE_POS_2D.AZY!, e1 = c1b.pts[c1b.pts.length - 1]!;
  {
    // (restated for the placed anatomy, the only one now: the node is the placed AZY, and the collateral lands ON the arch's drawn course (within its radius, depth included), within 30 units (0.1) along it)
    const n = PLACED_NODE_3D.AZY!, cl = centrelineOf('AZY_SVC')!, u = cl.nearestU(e1), q = cl.pointAt(u);
    assert.ok(Math.hypot(e1[0] - q[0], e1[1] - q[1], e1[2] - q[2]) < cl.radiusAt(u), 'the esophageal collateral lands on the arch');
    assert.ok(Math.hypot(e1[0] - n[0], e1[1] - n[1], e1[2] - n[2]) < 0.1, 'near the node, 30 units along the arch at most');
  }
});

test('it is drawn as the cava is: receded, only as the veil copy over the organs, whole when named; its end above the dome comes out solid at the azygos', () => {
  assert.ok(CAVA_LIKE.has('C9') && CAVA_LIKE.has('IVC_IS'));
  const f = fadeOf('C9', false)!;
  assert.equal(f.a0, CAVA_RECEDE);
  assert.equal(f.mode, 1); assert.equal(f.a1, 1, 'it climbs to whole only where it joins the azygos'); assert.ok(f.from >= 0.85, 'over a short last stretch: the whole run behind the liver and over the dome is the cava\'s tone (Mohammad, 20 Nov: "still bright, full-strength purple": the part above the dome came out solid)');
  const mid = fadeOf('C9', false)!; for (const u of [0.1, 0.4, 0.7, 0.85]) assert.ok(Math.abs(tipAlpha(mid, u, 0, 0) - CAVA_RECEDE) < 1e-9, `at ${u} along it`);
  const s = new CelScene(), o = s.vesselObject('C9')!;
  assert.ok(o.toonMesh.layers.isEnabled(FAINT_ONLY_LAYER) && !o.toonMesh.layers.isEnabled(0), 'no solid draw with the organs');
  const c9 = NETWORK_BY_ID.get('C9')!, n = c9.pts.length, last = c9.pts[n - 1]!, first = c9.pts[0]!;
  const aStart = vesselAlphaAt('C9', 0, first[0], first[1]), aEnd = vesselAlphaAt('C9', 1, last[0], last[1]);
  assert.ok(Math.abs(aStart - CAVA_RECEDE) < 1e-6, `at the cava ${aStart}`);
  assert.ok(aEnd > 0.99, `solid where it joins the azygos ${aEnd}`);
  s.dispose?.();
});
