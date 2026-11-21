// The skin's alpha at each vertex is its arm tube's fade at that place along the arm, not the tube's value at the seam (21 Nov: the left portal vein's skin, its seam moved out into the vein's fade, was washed out whole and its fork branch drew as a ghost).
// Neutral wherever the seam is whole: such an arm keeps the seam value (vFade -1), as before.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { SKIN_FS, SKIN_VS } from '../src/scene/vessels/skin/shaders.ts';
import { liveFadeAt, uFadeAt, uFadeOf, type FadeState } from '../src/scene/vessels/skin/arm-twins.ts';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins } from '../src/scene/vessels/join-mode.ts';
import { SkinSet } from '../src/scene/vessels/skin/skin-set.ts';
import { SkinObject } from '../src/scene/vessels/skin/skin-object.ts';

const base = (over: Partial<FadeState>): FadeState => ({ mode: 1, a: [0.6, 1, 1, 0], line: [0, 0, 1, 0], cavaEnd: [0, 1], stumpCut: 0, len: 1, units: 300, ...over });

test('an arm whose seam is whole, or whose fade is not by length share, keeps its seam value (null)', () => {
  assert.equal(uFadeOf(base({}), 1), null, 'whole seam');
  assert.equal(uFadeOf(base({}), 0.99995), null, 'whole to a hair');
  for (const mode of [0, 2, 3, 4]) assert.equal(uFadeOf(base({ mode }), 0.5), null, `mode ${mode}`);
  assert.equal(uFadeOf(base({ stumpCut: 40 }), 0.5), null, 'a stump');
  assert.equal(uFadeOf(base({ cavaEnd: [0.2, 0.4] }), 0.5), null, 'a cava end');
  assert.ok(uFadeOf(base({}), 0.5), 'a seam in the fade takes it');
});

test('the vertex stage\'s fade is the tube\'s own at every u (the twin of liveFadeAt), and the seam\'s value on the seam', () => {
  for (const a of [[0.6, 1, 1, 0], [0.5, 0.9, 1, 0.3], [0.2, 0.8, 0.4, 1]] as const) {
    const f = base({ a }), p = uFadeOf(f, 0.5)!;
    for (let u = 0; u <= 1.0001; u += 0.05) assert.ok(Math.abs(uFadeAt(p, u) - liveFadeAt(f, u, 0, 0)) < 1e-9, `u ${u}`);
  }
  // (a degenerate span, as liveFadeAt guards it)
  const f = base({ a: [0.5, 0.5, 1, 0] }), p = uFadeOf(f, 0.5)!;
  for (const u of [0.1, 0.5, 0.9]) assert.ok(Math.abs(uFadeAt(p, u) - liveFadeAt(f, u, 0, 0)) < 1e-9);
});

test('the shaders: the vertex stage hands each arm\'s fade to the fragment stage, which takes the seam\'s value where it is -1 and the body alpha reads it', () => {
  assert.ok(SKIN_VS.includes('armFade[i].z < 0.0) continue') && SKIN_VS.includes('vFadeA = vec4('));
  assert.ok(SKIN_FS.includes('return v >= 0.0 ? v : armAF[i].y;'));
  assert.ok(/float alpha = \(wAt\(0\) \* \(armCopy\[0\]\.w < -1\.5 \? mix\(fadeOf\(0\), aTrunk, wRamp\) : fadeOf\(0\)\)/.test(SKIN_FS), 'the alpha is built from fadeOf');
  assert.ok(!/armAF\[\d\]\.y\) \* armCopy/.test(SKIN_FS), 'no body alpha is still read from the seam value');
});

test('the left portal vein in Healthy: the skin is whole near the node and takes the tube\'s fade toward its seam; every arm with a whole seam keeps the seam value', () => {
  setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' }), parent = new Group();
  const set = new SkinSet({ vessel: (id) => scene.vesselObject(id), stateOf: () => undefined, make: (mesh, ax, arms) => new SkinObject(mesh, arms[0]!, ax, arms), add: (o: Object3D) => parent.add(o), remove: (o: Object3D) => parent.remove(o), warn: () => {} });
  try {
    set.build(2); set.sync();
    let withFade = 0, whole = 0, lpv: { id: string; seam: number; near: number }[] = [];
    for (const b of (set as any).drawn) for (const a of b.arms) {
      const u = a.obj.toon.uniforms, v = (k: string) => u[k].value;
      const f: FadeState = { mode: v('fadeMode'), a: [v('fadeA').x, v('fadeA').y, v('fadeA').z, v('fadeA').w], line: [v('fadeLine').x, v('fadeLine').y, v('fadeLine').z, v('fadeLine').w], cavaEnd: [v('cavaEnd').x, v('cavaEnd').y], stumpCut: v('stump').x, len: v('len'), units: 300 };
      const seam = liveFadeAt(f, a.u, a.x, a.y), p = uFadeOf(f, seam);
      if (seam >= 1 - 1e-4) { assert.equal(p, null, `${b.node} ${a.id}: a whole seam keeps its value`); whole++; continue; }
      if (!p) continue;
      withFade++;
      assert.ok(Math.abs(uFadeAt(p, a.u) - seam) < 1e-9, `${b.node} ${a.id}: on the seam the fade is the seam's`);
      if (b.node === 'LPV_A') lpv.push({ id: a.id, seam, near: uFadeAt(p, 0.3) });
    }
    assert.ok(whole > 0 && withFade > 0, `${whole} whole seams, ${withFade} with a fade`);
    const pv = lpv.find((x) => x.id === 'PVH_L_1')!, fb = lpv.find((x) => x.id === 'PVH_L_1~F:b')!;
    assert.ok(pv && pv.seam < 1 && pv.near > pv.seam, `the left portal vein's seam ${pv?.seam} is in its fade and the skin is whole toward the node (${pv?.near})`);
    assert.ok(fb && fb.near > fb.seam, 'the fork branch too');
  } finally { scene.dispose(); }
});
