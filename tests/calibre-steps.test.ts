// Calibre steps along a vein (Mohammad, 28 Nov: "the RHV still has a mismatch in caliber, it jumps all of a sudden"). The engine gives each PIECE of a vein its own diameter, and a piece is drawn at
// its own live width, so where two pieces meet the radius stepped (right hepatic vein: 9.9 % in SOS, 21.9 % in Budd-Chiari). A plain join eases both ends to the mean of the two widths (vessels/shaders.ts
// mate easing, smooth-joins.ts joinSwell); a SKIN used to switch that off at its end and blend the two widths over its own few radii. Now a skin that runs a vein straight through its node (through.ts) gives
// each half the mean of the two (skin/shaders.ts armThrough) and the tube eases to the same mean as far as the skin's cut (mateCut), so the width is ONE number across the node. This pins it, on the real
// network, every preset, every pair of pieces of every whole vein.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { WHOLE_PIECES } from '../src/scene/anatomy/placed-network.ts';
import { widthSwell } from '../src/scene/vessels/live-width.ts';
import { indexOf } from '../src/engine/vessel-data.ts';
import { SMOOTH, joinSwell } from '../src/scene/vessels/smooth-joins.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { VESSEL_VS } from '../src/scene/vessels/shaders.ts';
import { SKIN_VS } from '../src/scene/vessels/skin/shaders.ts';
import { SkinSet, type SkinDraw } from '../src/scene/vessels/skin/skin-set.ts';
import { CelScene } from '../src/scene/scene.ts';
import type { SkinMesh } from '../src/scene/vessels/skin/types.ts';
import type { VesselObject } from '../src/scene/vessels/vessel-object.ts';
import { presetIds, presetState } from './b4-presets.ts';

function built(): { scene: CelScene; set: SkinSet; was: boolean } {
  const was = smoothJoinsOn(); setSmoothJoins(true);
  const scene = new CelScene();
  const parent = new Group();
  const set = new SkinSet({
    vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
    make: (mesh: SkinMesh): SkinDraw => ({ mesh, object: new Group(), setArm() {}, setArc() {}, setPres() {}, setArmCopy() {}, setTransparent() {}, dispose() {} } as unknown as SkinDraw),
    add: (o: Object3D) => parent.add(o), remove: (o: Object3D) => parent.remove(o), warn: () => {},
  });
  set.build(2);
  return { scene, set, was };
}

test('the shaders carry the easing: the skin takes a through run\'s mean, the tube eases to its skin\'s cut', () => {
  assert.match(SKIN_VS, /uniform float armThrough\[6\];/);
  assert.match(SKIN_VS, /sw = 0\.5 \* \(sw \+ swRaw\[j\]\)/);
  assert.match(VESSEL_VS, /smoothstep\(mateCut\.x, mateCut\.x \+ 0\.3, uv\.x\)/);
  assert.match(VESSEL_VS, /smoothstep\(mateCut\.y - 0\.3, mateCut\.y, uv\.x\)/);
  // the JS mirror: the default is the tube's own end, a cut moves the whole ease to the cut
  assert.equal(joinSwell(1, 0.5, 1, 1), 0.75);
  assert.equal(joinSwell(1, 0.5, 0.9, 1, 0.9), 0.75);
  assert.ok(Math.abs(joinSwell(1, 0.5, 0.6, 1, 0.9) - 1) < 1e-9);
  assert.equal(joinSwell(1, 0.5, 0.1, 0, 0.1), 0.75);
});

test('every skinned end that a skin runs through its node is eased to the mate the tubes already ease to', () => {
  const b = built();
  try {
    let n = 0; const bad: string[] = [];
    for (const [, pieces] of Object.entries(WHOLE_PIECES)) for (let i = 1; i < pieces.length; i++) {
      const a = pieces[i - 1]!, c = pieces[i]!;
      const ea = SMOOTH.get(a)?.mate.indexOf(c) ?? -1, ec = SMOOTH.get(c)?.mate.indexOf(a) ?? -1;
      if (ea < 0 || ec < 0) continue;
      const ta = b.set.throughOf(a, ea as 0 | 1), tc = b.set.throughOf(c, ec as 0 | 1);
      if (!b.set.endsOf(a)[ea]) continue;
      n++;
      if (ta !== c || tc !== a) bad.push(`${a}.${ea} through ${ta}, ${c}.${ec} through ${tc}`);
    }
    assert.ok(n >= 3, `${n} skinned piece joins`);
    // a skinned join whose two halves the skin does not run through each other keeps the skin's own blend; none of the hepatic veins, azygos or portal branches is one, and the count may only go down
    const hv = bad.filter((x) => /RHV|MHV|LHV|AZY|PVH_R|SMV|SPV/.test(x));
    assert.deepEqual(hv, [], `skinned piece joins of a hepatic or azygos vein that are not a through run: ${hv.join('; ')}`);
    assert.ok(bad.length <= 6, `${bad.length} skinned piece joins are not a through run: ${bad.join('; ')}`);
  } finally { b.scene.dispose?.(); setSmoothJoins(b.was); }
});

test('no jump in calibre where two pieces of a vein meet, in any preset: both sides of the join draw the one mean width', () => {
  const rows: { rel: number; s: string }[] = [];
  let joins = 0, was = 0;
  return presetIds().then(async (ids) => {
    for (const pid of ids) {
      const D = (await presetState(pid)).frame.D;
      const sw = (id: string): number => { const v = NETWORK_BY_ID.get(id); return v ? widthSwell(v.widthKind, v.baseD, D[indexOf(v.lensId)]) : 1; };
      for (const [w, ps] of Object.entries(WHOLE_PIECES)) for (let i = 1; i < ps.length; i++) {
        const a = ps[i - 1]!, c = ps[i]!, va = NETWORK_BY_ID.get(a), vc = NETWORK_BY_ID.get(c);
        if (!va || !vc || va.widthKind !== 0 || vc.widthKind !== 0) continue;
        const ea = SMOOTH.get(a)?.mate.indexOf(c) ?? -1, ec = SMOOTH.get(c)?.mate.indexOf(a) ?? -1;
        if (ea < 0 || ec < 0) continue;
        joins++;
        const sa = sw(a), sc = sw(c);
        // each tube's width at its end of the join, as the vertex stage draws it (eased whole at the end), and as it was (the skin's blend, no easing)
        const left = joinSwell(sa, sc, ea as number, ea as 0 | 1), right = joinSwell(sc, sa, ec as number, ec as 0 | 1);
        const rel = Math.abs(left - right) / Math.max(left, right);
        if (Math.abs(sa - sc) / Math.max(sa, sc) > 0.05) was++;
        rows.push({ rel, s: `${pid} ${w}: ${a} ${left.toFixed(3)} | ${c} ${right.toFixed(3)}` });
      }
    }
    rows.sort((x, y) => y.rel - x.rel);
    assert.ok(joins > 100, `${joins} joins`);
    assert.ok(was >= 10, `a test with no step to remove would prove nothing (${was} joins over 5 % apart)`);
    assert.ok(rows[0]!.rel < 1e-9, `the largest step left: ${(rows[0]!.rel * 100).toFixed(2)} % at ${rows[0]!.s}`);
  });
});
