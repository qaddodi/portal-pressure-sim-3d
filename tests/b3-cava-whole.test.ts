import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CelScene } from '../src/scene/scene.ts';
import { IVC_JOIN_ALPHA, fadeOf, ivcJoinSpan } from '../src/scene/vessels/fades.ts';
import { IVC_EDGES } from '../src/scene/vessels/paths.copied.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';

const run = (s: CelScene, from: number, to: number) => { for (let t = from; t <= to; t += 16) s.update(t); };

test('a vein that ends on the faint cava fades into it over its last stretch (2D IVC_JOIN); the cava itself, the hepatic veins and the stents do not', () => {
  for (const id of ['LRV_IVC', 'RRV_IVC', 'RHV_IVC', 'TIPS', 'DIPS', 'IVC_IS', 'ILI_IVC']) assert.equal(ivcJoinSpan(id), 0, id);
  for (const id of ['S_PC', 'S_MC', 'C7']) {
    const t = fadeOf(id, false)!;
    assert.ok(t.ivcJoin, id);
    assert.equal(t.a0, 1); assert.equal(t.a1, IVC_JOIN_ALPHA); assert.equal(t.to, 1); assert.ok(t.from > 0 && t.from < 1);
    assert.equal(t.keep, false, 'the Circuit lets go of it');
  }
  // the portocaval and mesocaval shunts keep their opacity to within 12 units of the cava; the others fade over 60
  assert.ok(ivcJoinSpan('S_PC') < ivcJoinSpan('C7'));
  assert.ok(![...IVC_EDGES].some((id) => fadeOf(id, false)?.ivcJoin));
});

test('picking the cava shows it whole: the veil gives way and the cava is drawn solid over the organs; picking another vessel veils it again, easing both ways', () => {
  const s = new CelScene();
  const cava = s.vesselObject('IVC_IS')!;
  const veil = () => (cava as unknown as { veil: { mesh: { visible: boolean }; whole: boolean } }).veil;
  run(s, 0, 400);
  assert.equal(veil().mesh.visible, true);
  s.pick('IVC_IS');
  s.update(416); s.update(432);
  run(s, 448, 900);
  assert.equal(veil().mesh.visible, false, 'whole: the solid mesh draws it');
  assert.equal(veil().whole, true);
  s.pick('PV_TRUNK');
  run(s, 916, 1500);
  assert.equal(veil().mesh.visible, true);
  s.dispose();
});

test('the cava is whole at every ease: the shader has no veil alpha to ease (it is opaque, two tones)', () => {
  assert.doesNotMatch(VESSEL_FS, /veilA/);
});
