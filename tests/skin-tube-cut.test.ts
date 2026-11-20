// Junction skins, WP4 (docs/junction-skin-spec.md): the tube's own part. A tube can be cut at a seam ring (`skinCut`), its flow marks die away before the seam, and with nothing cut every branch this added is a no-op, so
// the figure is exactly today's picture (the spec's rule 8).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VESSEL_FS, VESSEL_VS } from '../src/scene/vessels/shaders.ts';
import { SKIN_CIRC_SPAN, SKIN_CUT_EPS, SKIN_CUT_NONE } from '../src/scene/vessels/skin/types.ts';
import { CelScene } from '../src/scene/scene.ts';
import { NETWORK } from '../src/scene/vessels/network.ts';
import type { VesselObject } from '../src/scene/vessels/vessel-object.ts';

test('the default cut is none: no u is below -1 or above 2, so every branch the cut guards is a no-op', () => {
  assert.deepEqual([...SKIN_CUT_NONE], [-1, 2]);
  const scene = new CelScene({ joins: 'old' });   // (with skins on, a skinned vessel's ends are cut by design: tests/skin-scene.test.ts)
  let n = 0;
  for (const def of NETWORK) {
    const o = scene.vesselObject(def.id);
    if (!o) continue;
    assert.deepEqual([...o.skinCut()], [-1, 2], def.id); n++;
  }
  assert.ok(n > 50, `${n} vessels checked`);
  scene.dispose?.();
});

test('setSkinCut writes the uniform, reports a change only when there is one, and the veil copy shares it', () => {
  const scene = new CelScene();
  const o = scene.vesselObject('SMV_CONF') as VesselObject;
  assert.equal(o.setSkinCut(-1, 0.93), true);
  assert.equal(o.setSkinCut(-1, 0.93), false);
  assert.deepEqual([...o.skinCut()], [-1, 0.93]);
  assert.equal(o.setSkinCut(...SKIN_CUT_NONE), true);
  scene.dispose?.();
});

test('the fragment stage cuts only where a cut is set, and only past it (a plain discard at rest, the screen pattern in the Circuit)', () => {
  assert.match(VESSEL_FS, /uniform vec2 skinCut;/);
  assert.match(VESSEL_FS, /bool skinCutOn\(\) \{ return dotted < 0\.5 && \(skinCut\.x >= 0\.0 \|\| skinCut\.y <= 1\.0\) \|\| skinHole\.y > skinHole\.x \|\| skinHole2\.y > skinHole2\.x; \}/);   // (a dotted thread is never cut: spec 10.2; and the side-wall holes: tests/skin-side-wall.test.ts)
  assert.match(VESSEL_FS, /if \(skinCutOn\(\) && skinPast\(\)\) \{[^}]*cutA <= 0\.0[^}]*discard;/s);
  assert.ok(VESSEL_FS.includes(`smoothstep(0.0, ${SKIN_CIRC_SPAN}, circT)`));
  assert.ok(VESSEL_FS.includes(String(SKIN_CUT_EPS)), 'a hair of margin, so the seam ring itself is never discarded');
  assert.ok(!VESSEL_VS.includes('skinCut'), 'the vertex stage is untouched');
});

test('the tube\'s flow marks (chevrons, streaks, dust) run right up to the seam: no fade before it (Mohammad, 20 Nov: particles cross a junction, they do not disappear); the skin carries them on (tests/skin-marks.test.ts)', () => {
  assert.doesNotMatch(VESSEL_FS, /skinMarkK|skinSeamDist/);
});
