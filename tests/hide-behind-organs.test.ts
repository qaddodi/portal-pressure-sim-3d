// Settings > Figure depth > Hide vessels behind organs (Mohammad, 20 Nov: "Shown through, with a Hide switch"). Off (the default) is the look so far: the IVC and the lumbar vein are drawn a second time over the organs, faint, so they show through the
// liver. On is normal occlusion: the solid copy, drawn with the organs under one depth buffer, is what shows, and an organ in front hides it. The two copies trade their opacity over the clock (nothing pops), and naming a vessel still reveals it over the organs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CelScene } from '../src/scene/scene.ts';
import { FAINT_ONLY_LAYER } from '../src/scene/vessels/vessel-object.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { DEFAULTS, parseSettings, useSettings } from '../src/state/settings.ts';
import { DEPTH_ROWS } from '../src/ui/settings/depth-rows.ts';

const run = (s: CelScene, from: number, to: number) => { for (let t = from; t <= to; t += 16) s.update(t); };
type Veiled = { veil: { mesh: { visible: boolean } } };
const K = (s: CelScene, id: string) => { const u = s.vesselObject(id)!.toon.uniforms as unknown as { solidK: { value: number }; veilK: { value: number } }; return [u.solidK.value, u.veilK.value] as const; };

test('the setting is off by default, saved, and has a row', () => {
  assert.equal(DEFAULTS.hideBehind, false);
  assert.equal(parseSettings(null).hideBehind, false);
  assert.equal(parseSettings(`{"hideBehind":true,"figureV":4}`).hideBehind, true);
  assert.ok(DEPTH_ROWS.some((r) => r.key === 'hideBehind' && /behind organs/i.test(r.label)));
});

test('the shader trades the two copies by solidK and veilK and drops a fully faded one', () => {
  assert.match(VESSEL_FS, /#ifdef VEIL\s+fadeHere \*= veilK;\s+#else\s+fadeHere \*= solidK;\s+#endif/);
  // (the glow's mask pass (#ifdef GLOW) returns between the trade and the drop: it paints the faded weight itself, so the drop still follows the trade)
  assert.ok(VESSEL_FS.indexOf('fadeHere *= solidK;') < VESSEL_FS.indexOf('if (fadeHere < 0.004) discard;'));
});

test('show-through at rest; on, the cava and the lumbar vein ease from their veil copy to their solid copy, drawn with the organs; every other vessel is untouched; and back', () => {
  useSettings.getState().set('hideBehind', false);
  const s = new CelScene();
  try {
    run(s, 0, 300);
    const cava = s.vesselObject('IVC_IS')!, lumbar = s.vesselObject('C9')!;
    for (const o of [cava, lumbar]) { assert.ok(o.toonMesh.layers.isEnabled(FAINT_ONLY_LAYER) && !o.toonMesh.layers.isEnabled(0)); assert.equal((o as unknown as Veiled).veil.mesh.visible, true); }
    assert.deepEqual(K(s, 'IVC_IS'), [0, 1]);
    useSettings.getState().set('hideBehind', true);
    run(s, 300, 420);
    const [sk, vk] = K(s, 'IVC_IS');
    assert.ok(sk > 0 && sk < 1 && Math.abs(sk + vk - 1) < 1e-9, `midway the copies share the opacity: ${sk} ${vk}`);
    assert.ok(cava.toonMesh.layers.isEnabled(0), 'its solid copy is drawn once it shows at all');
    run(s, 420, 1500);
    for (const id of ['IVC_IS', 'C9']) {
      const o = s.vesselObject(id)!;
      assert.deepEqual(K(s, id), [1, 0], id);
      assert.ok(o.toonMesh.layers.isEnabled(0) && !o.toonMesh.layers.isEnabled(FAINT_ONLY_LAYER), `${id}: drawn with the organs, so one in front hides it`);
      assert.equal((o as unknown as Veiled).veil.mesh.visible, false, `${id}: no copy over the organs`);
    }
    assert.deepEqual(K(s, 'PV_TRUNK'), [1, 1], 'a vessel that is not behind the organs is never touched');
    // naming the cava reveals it over the organs, whatever the setting
    s.setNamedVessels(['IVC_IS']); run(s, 1500, 3000);
    assert.equal((cava as unknown as Veiled).veil.mesh.visible, false);
    assert.ok(!cava.toonMesh.layers.isEnabled(0), 'named: drawn over the organs (the vessel layer), not with them');
    s.setNamedVessels([]); run(s, 3000, 4500);
    useSettings.getState().set('hideBehind', false);
    run(s, 4500, 6000);
    assert.deepEqual(K(s, 'IVC_IS'), [0, 1]);
    assert.ok(cava.toonMesh.layers.isEnabled(FAINT_ONLY_LAYER));
  } finally { s.dispose(); useSettings.getState().set('hideBehind', false); }
});
