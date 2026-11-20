// "can't see the catheter" (Mohammad, 20 Nov, Dark, HVPG): the catheter is a hairline that vanishes where it enters the cava. The device layer is drawn AFTER the vessels with no depth test, on the vessels' own
// pass (a device built on the base layer was painted over by the now-opaque tubes), and is never thinner than a floor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEVICE_RENDER_ORDER } from '../src/scene/devices/device-object.ts';
import { SHAFT_MAX_OF_LUMEN, SHAFT_MIN_R, shaftRadius } from '../src/scene/devices/catheters/proc-catheter.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { DeviceObject } from '../src/scene/devices/device-object.ts';
import { CelScene } from '../src/scene/scene.ts';
import { BoxGeometry } from 'three';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

test('a device draws after every vessel, with no depth test and no depth write, so it reads inside the tube it lies in', () => {
  const s = new CelScene();
  const maxVessel = Math.max(...s.vessels.map((o) => o.toonMesh.renderOrder));
  assert.ok(DEVICE_RENDER_ORDER > maxVessel, `devices ${DEVICE_RENDER_ORDER} over vessels ${maxVessel}`);
  const d = new DeviceObject(new BoxGeometry(1, 1, 1), 'poly', s.shared);
  for (const m of [d.toon, d.ink]) { assert.equal(m.depthTest, false); assert.equal(m.depthWrite, false); }
  d.group.traverse((c) => assert.ok(c.renderOrder >= DEVICE_RENDER_ORDER));
  s.dispose();
});

test('the procedure layer\'s devices are tagged to the vessels\' pass every frame (a catheter built later is not left on the base layer under the opaque tubes)', () => {
  const src = read('../src/scene/scene.ts');
  assert.match(src, /this\.procs\.group\.traverse\(\(c\) => \{ if \(c\.layers\.mask !== 2\) c\.layers\.set\(VESSEL_LAYER\); \}\);[^\n]*\n\s*const procMoving = this\.procs\.update\(now\);/);
});

test('the shaft is never a hairline: a floor of about 3 CSS px at the phone\'s framing, and never wider than half its vein', () => {
  const hv = NETWORK_BY_ID.get('RHV_IVC')!.radius, ivc = NETWORK_BY_ID.get('IVC_IS')!.radius;
  assert.ok(SHAFT_MIN_R >= 0.006, 'the floor');
  assert.ok(shaftRadius(0.001, ivc) >= SHAFT_MIN_R, 'a hairline in the cava is lifted to the floor');
  assert.ok(shaftRadius(0.02, hv) <= SHAFT_MAX_OF_LUMEN * hv, 'and never wider than half its vein');
  assert.ok(SHAFT_MIN_R <= SHAFT_MAX_OF_LUMEN * hv * 1.01, 'the floor fits the hepatic vein');
  assert.match(read('../src/scene/devices/catheters/proc-catheter.ts'), /fill\(rings, \(_i, d\) => shaftRadius\(rc, r3\.lumen\(d\)\)\)/);
});
