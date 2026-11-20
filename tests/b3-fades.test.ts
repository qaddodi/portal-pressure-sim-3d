// The free ends of the vessels fade as the 2D figure draws them (tables copied from the 2D app): the veins that end in the organ they drain, the hepatic artery's ends, the veins that leave the plate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fadeOf } from '../src/scene/vessels/fades.ts';
import { CelScene } from '../src/scene/scene.ts';
import { VESSEL_FS, VESSEL_VS } from '../src/scene/vessels/shaders.ts';
import { NETWORK } from '../src/scene/vessels/network.ts';

import { HEP_FADE_IN } from '../src/scene/vessels/fades.ts';
import { startInOrganShare } from '../src/scene/vessels/starts.ts';
import { EDGE_PATH_2D } from '../src/scene/vessels/paths.copied.ts';

test('a vein that ends in its organ fades in from nothing over the 2D share of its length', () => {
  const spl = fadeOf('V_SPL', false)!;
  // (the splenic vein is carried on into the spleen, so its fade-in covers that carried-on stretch: solid where it leaves the organ; see starts.ts)
  assert.deepEqual([spl.mode, spl.from, spl.a0, spl.a1, spl.keep], [1, 0, 0, 1, false]);
  assert.ok(spl.to > 0.05 && spl.to < 0.5, `fade-in covers the stretch inside the spleen (${spl.to})`);
  assert.equal(spl.to, startInOrganShare('V_SPL', EDGE_PATH_2D.V_SPL!));
  for (const id of ['V_INT', 'V_COL', 'V_KID_L', 'LGV_CONF']) assert.ok(fadeOf(id, false), id);
  assert.deepEqual([...fadeOf('LGV_CONF', false)!.connect], ['C1a'], 'the coronary vein fades out at its upper end, never a blunt stub, until the varices are open (Mohammad, 20 Nov)');
});

test('the hepatic artery fades in at its start and its branches out at their ends, in both views', () => {
  const a = fadeOf('A_HEP', true)!, r = fadeOf('A_HR', true)!;
  assert.deepEqual([a.from, a.to, a.a0, a.a1, a.keep], [0, HEP_FADE_IN, 0, 1, true]);
  assert.deepEqual([r.from, r.to, r.a0, r.a1, r.keep], [0.4, 1, 1, 0, false], 'the right artery fades out over the last 60%, as the portal branch beside it does');
});

test('the veins that run on out of the plate fade out down it', () => {
  const d = fadeOf('ILI_IVC', false)!;
  assert.equal(d.mode, 2);
  assert.ok(d.a0 === 1 && d.a1 === 0 && d.from !== d.to);
});

test('the vessels that have a free end in the 2D figure all have a fade in the scene, blended in its zone (and nowhere else)', () => {
  const s = new CelScene();
  const faded = NETWORK.filter((v) => !v.feeder && fadeOf(v.id, v.tone === 'artery'));
  assert.ok(faded.length >= 9);
  for (const v of faded) {
    const o = s.vesselObject(v.id)!;
    assert.equal(o.toon.uniforms.fadeMode!.value > 0, true, v.id);
    assert.equal(o.toon.transparent, true, v.id);
  }
  // a vessel with no fade stays opaque
  assert.equal(s.vesselObject('PV_TRUNK')!.toon.transparent, false);
  assert.equal(s.vesselObject('V_SPL')!.toon.uniforms.fadeMode!.value, 1);
  s.dispose();
});

test('the shader carries the fade into both the body and the ink, and lets go of it in the Circuit', () => {
  assert.match(VESSEL_VS, /vFade = fa;/);
  assert.doesNotMatch(VESSEL_VS, /swell \*= mix\([^;]*fa\)/, 'a fade never thins the tube: full width to the end');
  assert.match(VESSEL_VS, /fa = mix\(fa, 1\.0, circT\)/, "the Circuit lets go of every fade, the artery's too: no vessel is faint on the map");
  assert.match(VESSEL_FS, /gl_FragColor = vec4\(c, vFade\);/, 'the body fades by its alpha');
  assert.match(VESSEL_FS, /c = mix\(c, mix\(inkH, inkColorCirc, circT\), inkT\);[\s\S]*gl_FragColor = vec4\(c, vFade\);/, 'the outline is painted into the body\'s colour, so it has the body\'s alpha: no ink ring floats at a faded end');
});

test('the superior cava runs into the right atrium as solid as the inferior cava meets it: no fade to 0.3 at the atrium (a hard step in colour there)', () => {
  for (const id of ['SVC_RA', 'SVC_RA_1']) { const f = fadeOf(id, false); assert.ok(!f || !f.ivcJoin, `${id} is the cava, not a vein joining it`); }
});

test('the renal veins are drawn receded: a constant share of their opacity along their whole length, blended with the fade they already have', async () => {
  const { fadeOf, RECEDE } = await import('../src/scene/vessels/fades.ts');
  for (const id of Object.keys(RECEDE)) {
    const f = fadeOf(id, false);
    assert.ok(f, `${id} has a fade`);
    assert.ok(f!.a0 <= RECEDE[id]! + 1e-9 && f!.a1 <= RECEDE[id]! + 1e-9 && Math.max(f!.a0, f!.a1) > 0.3, `${id} is at most ${RECEDE[id]} opaque, never a step`);
  }
});
