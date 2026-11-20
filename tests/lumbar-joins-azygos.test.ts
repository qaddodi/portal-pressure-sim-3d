// The ascending lumbar collateral (C9) is the cava's own collateral (Mohammad, 20 Nov: "in Budd-Chiari the ascending lumbar vein should be faded just like the IVC, behind the liver, and should join somewhere
// systemically; it shouldn't just end abruptly into the void"). Root causes: (1) 2D joins it to the azygos TRUNK at y 108, a trunk that is not drawn in 3D, so it ended 78 units short of the arch; (2) it was
// drawn solid, as a vessel in front of the liver, not as the cava is (receded, only as the veil copy over the organs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CelScene } from '../src/scene/scene.ts';
import { NETWORK_BY_ID, NETWORK } from '../src/scene/vessels/network.ts';
import { CAVA_LIKE, CAVA_RECEDE, fadeOf } from '../src/scene/vessels/fades.ts';
import { NODE_POS_2D } from '../src/scene/vessels/paths.copied.ts';
import { FAINT_ONLY_LAYER } from '../src/scene/vessels/vessel-object.ts';
import { x3, y3 } from '../src/scene/frame2d.ts';
import { vesselAlphaAt } from '../src/scene/vessels/fade-alpha.ts';

test('the ascending lumbar collateral runs to the azygos node, where the azygos arch and the esophageal collateral meet it', () => {
  const c9 = NETWORK_BY_ID.get('C9')!, end = c9.pts[c9.pts.length - 1]!, [ax, ay] = NODE_POS_2D.AZY!;
  const d = Math.hypot(end[0] - x3(ax), end[1] - y3(ay));
  assert.ok(d < 0.03, `ends ${d.toFixed(3)} scene units from the azygos node (it ended 78 2D units short, in the void)`);
  assert.equal(c9.to, 'AZY');
  const arch = NETWORK_BY_ID.get('AZY_SVC')!;
  assert.equal(arch.from, 'AZY', 'the arch starts at the node the collateral ends at');
  assert.ok(NETWORK.some((v) => v.id === 'C1b' && v.to === 'AZY'), 'and so does the esophageal collateral');
});

test('it is drawn as the cava is: receded, only as the veil copy over the organs, whole when named; its end above the dome comes out solid at the azygos', () => {
  assert.ok(CAVA_LIKE.has('C9') && CAVA_LIKE.has('IVC_IS'));
  const f = fadeOf('C9', false)!;
  assert.equal(f.a0, CAVA_RECEDE);
  assert.ok(f.a1 < CAVA_RECEDE, 'behind the liver it dips below the cava\'s own tone');
  const s = new CelScene(), o = s.vesselObject('C9')!;
  assert.ok(o.toonMesh.layers.isEnabled(FAINT_ONLY_LAYER) && !o.toonMesh.layers.isEnabled(0), 'no solid draw with the organs');
  const c9 = NETWORK_BY_ID.get('C9')!, n = c9.pts.length, last = c9.pts[n - 1]!, first = c9.pts[0]!;
  const aStart = vesselAlphaAt('C9', 0, first[0], first[1]), aEnd = vesselAlphaAt('C9', 1, last[0], last[1]);
  assert.ok(Math.abs(aStart - CAVA_RECEDE) < 1e-6, `at the cava ${aStart}`);
  assert.ok(aEnd > 0.99, `solid where it joins the azygos ${aEnd}`);
  s.dispose?.();
});
