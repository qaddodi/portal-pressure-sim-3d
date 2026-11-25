// Vessels behind the organs (the IVC and the lumbar vein) show through the liver, faint (the Hide vessels behind organs switch was removed, 25 Nov, Mohammad: "Agree"; the organ veil covers it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CelScene } from '../src/scene/scene.ts';
import { FAINT_ONLY_LAYER } from '../src/scene/vessels/vessel-object.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { shaderText } from './shader-text.ts';
import { DEFAULTS } from '../src/state/settings.ts';
import { DEPTH_ROWS } from '../src/ui/settings/depth-rows.ts';

const run = (s: CelScene, from: number, to: number) => { for (let t = from; t <= to; t += 16) s.update(t); };
type Veiled = { veil: { mesh: { visible: boolean } } };
const K = (s: CelScene, id: string) => { const u = s.vesselObject(id)!.toon.uniforms as unknown as { solidK: { value: number }; veilK: { value: number } }; return [u.solidK.value, u.veilK.value] as const; };

test('the shader trades the two copies by solidK and veilK and drops a fully faded one', () => {
  assert.match(shaderText(VESSEL_FS), /#ifdef VEIL\s+fadeHere \*= veilK;\s+#elif defined\(SHADOW\)\s+fadeHere \*= max\(solidK, veilK\);[^\n]*\s+#else\s+fadeHere \*= solidK;\s+#endif/);   // (the crossing shadow follows whichever copy shows: S3)
  // (the glow's mask pass (#ifdef GLOW) returns between the trade and the drop: it paints the faded weight itself, so the drop still follows the trade)
  assert.ok(shaderText(VESSEL_FS).indexOf('fadeHere *= solidK;') < shaderText(VESSEL_FS).indexOf('if (fadeHere < 0.004) discard;'));
});

test('show-through is the only look: the cava and the lumbar vein are drawn over the organs, faint, and there is no switch for it', () => {
  assert.ok(!DEPTH_ROWS.some((r) => /behind organs/i.test(r.label)));
  assert.equal('hideBehind' in DEFAULTS, false);
  const s = new CelScene();
  try {
    run(s, 0, 300);
    const cava = s.vesselObject('IVC_IS')!, lumbar = s.vesselObject('C9')!;
    for (const o of [cava, lumbar]) { assert.ok(o.toonMesh.layers.isEnabled(FAINT_ONLY_LAYER) && !o.toonMesh.layers.isEnabled(0)); assert.equal((o as unknown as Veiled).veil.mesh.visible, true); }
    assert.deepEqual(K(s, 'IVC_IS'), [0, 1]);
    assert.deepEqual(K(s, 'PV_TRUNK'), [1, 1], 'a vessel that is not behind the organs is never touched');
    s.setNamedVessels(['IVC_IS']); run(s, 300, 1800);
    assert.equal((cava as unknown as Veiled).veil.mesh.visible, false, 'naming the cava still reveals it over the organs');
  } finally { s.dispose(); }
});
