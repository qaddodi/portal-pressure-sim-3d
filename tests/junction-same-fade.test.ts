// A vessel that merges into a FADED one comes to the target's fade at the junction, gradually, so both have the same fade at the point of junction (Mohammad, 20 Nov), and its end is never an open tube:
// it is cut along the target's wall a pixel wide (back faces are never drawn), its outline is buried there, and what lies in it (a clot) reads the same ramp. App-wide: every vessel that ends on the cava.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CelScene } from '../src/scene/scene.ts';
import { CAVA_RECEDE, IVC_JOIN_ALPHA, fadeOf, ivcJoinSpan, opensIntoCava } from '../src/scene/vessels/fades.ts';
import { NETWORK } from '../src/scene/vessels/network.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { CAVA_RAMP_R, cavaRamp } from '../src/scene/vessels/fade-alpha.ts';
import { drawnHost, cavaWallShare } from '../src/scene/disease/host.ts';
import { clotShapeOf } from '../src/scene/disease/clots.ts';

test('the ramp is gradual: nothing 2.5 cava radii before the wall, the whole of it at the wall, smooth between', () => {
  assert.equal(cavaRamp(-CAVA_RAMP_R), 0); assert.equal(cavaRamp(0), 1); assert.equal(cavaRamp(1), 1);
  let prev = 0;
  for (let i = 1; i <= 50; i++) { const r = cavaRamp(-CAVA_RAMP_R + (CAVA_RAMP_R * i) / 50); assert.ok(r >= prev - 1e-12 && r - prev < 0.12, `step ${i}`); prev = r; }
});

test('every vessel that ends on the faint cava comes to the cava\'s own opacity there: the shunts and collaterals by their fade, the hepatic and renal veins by the shader\'s ramp', () => {
  for (const v of NETWORK) if (ivcJoinSpan(v.id) > 0) assert.equal(fadeOf(v.id, false)!.a1, IVC_JOIN_ALPHA, `${v.id} joins the cava at its opacity`);
  assert.equal(IVC_JOIN_ALPHA, CAVA_RECEDE);
  assert.match(VESSEL_FS, /fadeHere = mix\(vFade, cavaA, wA\);/);
  const s = new CelScene();
  try {
    let n = 0;
    for (const v of NETWORK) {
      if (!opensIntoCava(v.id)) continue;
      n++;
      const o = s.vesselObject(v.id)!, u = o.toon.uniforms as unknown as { cavaCut: { value: number }; cavaA: { value: number }; bury: { value: { y: number } } };
      assert.equal(u.cavaCut.value, 1, v.id);
      assert.ok(Math.abs(u.cavaA.value - CAVA_RECEDE) < 1e-9, `${v.id} cava opacity`);
      assert.ok(u.bury.value.y > 0, `${v.id}: its outline is buried at the junction`);
    }
    assert.ok(n >= 3);
  } finally { s.dispose(); }
});

test('no vein end renders open: back faces are never drawn and the cut at the wall is a pixel wide, never along the cava\'s axis, never a feather into the lumen', () => {
  assert.match(VESSEL_FS, /if \(!gl_FrontFacing\) discard;/);
  assert.match(VESSEL_FS, /cavA = mix\(1\.0 - smoothstep\(-0\.5, 0\.5, cdPx\), 1\.0, circT\);/);
  assert.doesNotMatch(VESSEL_FS, /smoothstep\(0\.0, 0\.6 \* vNbr\.y, cd\)/);
  assert.doesNotMatch(VESSEL_FS, /smoothstep\(-0\.8 \* vNbr\.y, 0\.0, cd\)/);
});

test('what lies in a vein that opens into the cava reads the same fade: the drawn vein comes to the cava\'s opacity at its wall, and a clot there is as faint', () => {
  for (const id of ['RHV_IVC', 'MHV_IVC', 'LHV_IVC']) {
    const h = drawnHost(id)!, w = cavaWallShare(h)!;
    assert.ok(w > 0.5 && w <= 1);
    let k = h.s.length - 1; while (k > 0 && h.s[k]! / h.length > w) k--;
    assert.ok(Math.abs(h.A[k]! - CAVA_RECEDE) < 0.08, `${id}: vein opacity at the wall ${h.A[k]}`);
    const shape = clotShapeOf(h, h.pieces.map(() => 1), 1, id);
    assert.ok(Math.abs(shape.alpha[shape.alpha.length - 1]! - CAVA_RECEDE) < 0.08, `${id}: clot opacity at the wall ${shape.alpha[shape.alpha.length - 1]}`);
  }
});
