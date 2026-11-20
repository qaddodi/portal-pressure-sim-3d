// A skin is never drawn where its arms are not (Mohammad, 20 Nov, a small stray Y floating alone on the liver: a junction skin whose arm tubes were hidden, not yet grown or dissolved). Root cause: the skin took its arms' fade mode, colour,
// highlight and lens position but not their PRESENCE (the group's visibility, the draw-on `reveal`, the dive fade), so a vessel the Circuit's change had not grown yet, or one a view hides, left its skin behind. The skin now carries each
// arm's presence at its seam (arm-twins.ts armPresenceAt) and dissolves in the tubes' own screen pattern. Run: node --test tests/skin-presence.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { SkinSet } from '../src/scene/vessels/skin/skin-set.ts';
import { SkinObject } from '../src/scene/vessels/skin/skin-object.ts';
import { armPresenceAt } from '../src/scene/vessels/skin/arm-twins.ts';
import { SKIN_FS } from '../src/scene/vessels/skin/shaders.ts';
import type { VesselObject } from '../src/scene/vessels/vessel-object.ts';

function built() {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  const draws: SkinObject[] = [];
  const parent = new Group();
  const set = new SkinSet({
    vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
    make: (mesh, axes, arms) => { const d = new SkinObject(mesh, arms[0]!, axes, arms); draws.push(d); return d; },
    add: (o: Object3D) => parent.add(o), remove: (o: Object3D) => parent.remove(o), warn: () => {},
  });
  set.build(2);
  set.sync();
  return { scene, set, draws, was };
}
const pres = (d: SkinObject) => (d.material.uniforms.armPres!.value as number[]).slice();

test('the twin: hidden is 0; drawn whole is 1; the draw-on front is a tenth of the length wide at 1.1 x reveal, as the tube\'s frontOut; the dive fade multiplies', () => {
  assert.equal(armPresenceAt(false, 1, 1, 0.5), 0);
  assert.equal(armPresenceAt(true, 1, 1, 0.9), 1);
  assert.equal(armPresenceAt(true, 0.3, 1, 0.5), 0, 'the front has not reached u 0.5');
  assert.equal(armPresenceAt(true, 0.3, 1, 0.1), 1, 'and has passed 0.1');
  assert.ok(Math.abs(armPresenceAt(true, 0.5, 1, 0.5) - 0.5) < 1e-9, 'half way across its gradient');
  assert.equal(armPresenceAt(true, 1, 0.4, 0.2), 0.4);
  assert.match(SKIN_FS, /float pres = dot\(vWeight,/);
  assert.match(SKIN_FS, /if \(pres < 0\.999 && fract\(52\.9829189 \* fract\(dot\(gl_FragCoord\.xy, vec2\(0\.06711056, 0\.00583715\)\)\)\) >= pres\) discard;/, 'the tubes\' own pattern');
});

test('every skin takes its arms\' presence: whole when the arms are, only as much as each arm is when one is hidden, grown or dissolved, and NOT DRAWN AT ALL when no arm is', () => {
  const { scene, set, draws, was } = built();
  try {
    assert.ok(draws.length >= 5, `${draws.length} skins`);
    const armsOf = (d: SkinObject) => set.armIdsOf(d);
    for (const d of draws) { assert.equal(d.mesh.visible, true); assert.ok(pres(d).slice(0, armsOf(d).length).every((p) => p === 1)); }
    // a skin whose every arm is hidden is not there
    for (const d of draws) for (const id of armsOf(d)) (scene.vesselObject(id) as VesselObject).group.visible = false;
    set.sync();
    for (const d of draws) { assert.equal(d.mesh.visible, false, `${d.mesh.name}: no arm is drawn, so neither is the skin`); assert.ok(pres(d).slice(0, armsOf(d).length).every((p) => p === 0)); }
    // one arm back: the skin is there, and only as the arm is
    const d0 = draws[0]!, ids = armsOf(d0);
    (scene.vesselObject(ids[0]!) as VesselObject).group.visible = true;
    set.sync();
    assert.equal(d0.mesh.visible, true);
    assert.equal(pres(d0)[0], 1); assert.equal(pres(d0)[1], 0);
    // not yet grown: the draw-on has not reached the seam
    for (const id of ids) { const o = scene.vesselObject(id) as VesselObject; o.group.visible = true; o.setReveal(0); }
    set.sync();
    assert.equal(d0.mesh.visible, false, 'nothing of any arm is drawn yet');
    for (const id of ids) (scene.vesselObject(id) as VesselObject).setReveal(1);
    set.sync();
    assert.ok(pres(d0).slice(0, ids.length).every((p) => p === 1), 'and whole again');
    // the dive's fade
    for (const id of ids) (scene.vesselObject(id) as VesselObject).setFade(0.5);
    set.sync();
    assert.ok(pres(d0).slice(0, ids.length).every((p) => Math.abs(p - 0.5) < 1e-9), 'dissolves with its arms');
  } finally { scene.dispose(); setSmoothJoins(was); }
});
