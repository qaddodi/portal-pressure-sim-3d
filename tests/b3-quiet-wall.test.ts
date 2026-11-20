// Visual review 10.3 and 10.5: quiet depth on a turn takes the back tier toward the page by 8% (eased, nothing at rest), and an artery carries a lighter inner wall line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CelScene } from '../src/scene/scene.ts';
import { QUIET_BACK, quietOf } from '../src/scene/camera/quiet.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { BACK_EDGES } from '../src/scene/vessels/paths.copied.ts';

test('the back tier eases toward the plate with the turn, and only the back tier', () => {
  const s = new CelScene();
  const back = s.vessels.filter((o) => BACK_EDGES.has(o.edge!.id));
  assert.ok(back.length > 2);
  s.update(100);
  for (const o of s.vessels) assert.equal(o.toon.uniforms.quietK!.value, 0, `${o.edge!.id} face on`);
  s.rig.setOrbit(0.4);
  s.update(200);
  const q = quietOf(s.rig.orbitAngle);
  assert.ok(q > 0.5, `turned: ${q}`);
  for (const o of back) assert.equal(o.toon.uniforms.quietK!.value, q, `${o.edge!.id} eases with the turn`);
  for (const o of s.vessels) if (!BACK_EDGES.has(o.edge!.id)) assert.equal(o.toon.uniforms.quietK!.value, 0, `${o.edge!.id} is not of the back tier`);
  s.dispose();
  assert.equal(QUIET_BACK, 0.08);
  assert.equal(quietOf(0.05), 0, 'under 8 degrees nothing');
  assert.equal(quietOf(0.5), 1, 'at the end of the turn, all of it');
  assert.match(VESSEL_FS, /mix\(c, pageCol, 0\.080 \* quietK\)/);
});

test('a vessel has no painted wall line, artery or vein: two flat tones and the outline, nothing inside (the matte look)', () => {
  assert.doesNotMatch(VESSEL_FS, /wallLine/, 'the shader draws no wall line');
});
