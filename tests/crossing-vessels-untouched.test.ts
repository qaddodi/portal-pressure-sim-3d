// The cut at the cava's wall and the fade to the cava's opacity belong to the vessels that END on the cava, by topology (fades.ts opensIntoCava): the hepatic and renal veins. A vessel that only crosses the cava or lies near it (the hepatic
// artery, the portal branches, the lumbar collateral, a shunt) is never cut by it and keeps its own fade (Mohammad, 20 Nov: "HA is now inside IVC"). And naming the lumbar collateral, which is drawn like the cava, raises its own tone, never the
// cava's: a whole cava is opaque and hides the arteries that cross it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CelScene } from '../src/scene/scene.ts';
import { landsOnCava, opensIntoCava, trunkMateOf } from '../src/scene/vessels/fades.ts';
import { indexOf } from '../src/engine/vessel-data.ts';
import { NETWORK, NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { cavaMateOf } from '../src/scene/vessels/neighbour.ts';

/** Whether a skin has taken the cava end (end 1) of a vein: its cut and burial are then off (scene.ts applyMates). */
const skinnedAtCava = (s: CelScene, id: string): boolean => !!(s as unknown as { skins: { endsOf(id: string): readonly [boolean, boolean] } | null }).skins?.endsOf(id)[1];
const run = (s: CelScene, from: number, to: number) => { for (let t = from; t <= to; t += 16) s.update(t); };

test('only a vessel that ends on the cava has the cava\'s cut and fade; every other vessel, crossing or near it, has none', () => {
  const s = new CelScene();
  try {
    let ends = 0, others = 0;
    for (const v of NETWORK) {
      const o = s.vesselObject(v.id);
      if (!o) continue;
      const u = o.toon.uniforms as unknown as { cavaCut: { value: number }; cavaA: { value: number }; cavaRef: { value: { x: number } } };
      // (placed anatomy, round 18: the middle hepatic vein's engine edge still ends at the cava's node, but its drawn course ends on the left hepatic vein's common trunk, fades.ts trunkMateOf. It opens into the TRUNK: cut at the trunk's
      //  wall, in the trunk's colour (cavaRef is the trunk's lens) and opacity, never the cava's, and the cava is no mate of it. Read from the placed topology, not from the engine's node)
      const trunk = trunkMateOf(v.id);
      if (trunk) { ends++; assert.equal(u.cavaCut.value, skinnedAtCava(s, v.id) ? 2 : 1, v.id); assert.equal(cavaMateOf(v.id), null, `${v.id} opens into the common trunk, not the cava`); assert.equal(u.cavaRef.value.x, indexOf(NETWORK_BY_ID.get(trunk)!.lensId), `${v.id} takes the trunk's colour`); }
      else if (opensIntoCava(v.id) || landsOnCava(v.id)) { ends++; assert.equal(u.cavaCut.value, skinnedAtCava(s, v.id) ? 2 : 1, v.id); assert.ok(cavaMateOf(v.id), v.id); }   // (a skin that has taken the cava end is the opening: no cut there, spec 10.4)
      else { others++; assert.equal(u.cavaCut.value, 0, `${v.id} only crosses or lies near the cava`); assert.equal(cavaMateOf(v.id), null, v.id); assert.equal(u.cavaA.value, 1, v.id); }
    }
    assert.ok(ends >= 4 && others > 30);
    for (const id of ['A_HEP', 'A_HR', 'A_HL', 'PV_TRUNK', 'PVH_R', 'PVH_L', 'C9']) assert.equal((s.vesselObject(id)!.toon.uniforms as unknown as { cavaCut: { value: number } }).cavaCut.value, 0, id);
  } finally { s.dispose(); }
});

test('naming the lumbar collateral does not make the cava whole (opaque over the arteries that cross it); naming the cava does', () => {
  const s = new CelScene();
  try {
    const tone = (id: string) => (s.vesselObject(id)!.toon.uniforms as unknown as { fadeA: { value: { z: number } } }).fadeA.value.z;
    run(s, 0, 400);
    const cava0 = tone('IVC_IS'), c90 = tone('C9');
    s.setNamedVessels(['C9']); run(s, 400, 1600);
    assert.equal(tone('IVC_IS'), cava0, 'the cava stays faint');
    assert.ok(tone('C9') > c90 + 0.2, 'the collateral comes up on its own');
    s.setNamedVessels([]); run(s, 1600, 2800);
    s.setNamedVessels(['IVC_IS']); run(s, 2800, 4000);
    assert.ok(tone('IVC_IS') > cava0 + 0.2, 'naming the cava raises it');
  } finally { s.dispose(); }
});
