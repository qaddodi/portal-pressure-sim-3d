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
import { cavaMateOf } from '../src/scene/vessels/neighbour.ts';

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
      assert.ok(Math.abs(u.cavaA.value - fadeOf(cavaMateOf(v.id)!, false)!.a1) < 1e-9, `${v.id} comes to the opacity the cava has where it joins`);
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

test('the other tube is taken at the radius it is DRAWN at: every vessel measured against a mate (a fork, the cava) carries the mate\'s data index, built diameter and kind, and the vertex stage scales nbr by the mate\'s live swell', async () => {
  const { VESSEL_VS } = await import('../src/scene/vessels/shaders.ts');
  const { forkMateOf, cavaMateOf } = await import('../src/scene/vessels/neighbour.ts');
  const { NETWORK_BY_ID } = await import('../src/scene/vessels/network.ts');
  const { indexOf } = await import('../src/engine/vessel-data.ts');
  assert.match(VESSEL_VS, /vNbr = vec2\(nbr\.x, nbr\.y \* \(nbrMate\.x >= 0\.0 \? swellOf\(nbrMate\.x, nbrMate\.y, nbrMate\.z\) : 1\.0\)\);/);
  assert.doesNotMatch(VESSEL_VS, /vNbr = nbr;/);
  const s = new CelScene();
  try {
    let n = 0;
    for (const v of NETWORK) {
      const mate = forkMateOf(v.id) ?? cavaMateOf(v.id);
      if (!mate) continue;
      n++;
      const u = s.vesselObject(v.id)!.toon.uniforms as unknown as { nbrOn: { value: number }; nbrMate: { value: { x: number; y: number; z: number } } };
      const m = NETWORK_BY_ID.get(mate)!;
      assert.equal(u.nbrOn.value, 1, v.id);
      assert.deepEqual([u.nbrMate.value.x, u.nbrMate.value.y, u.nbrMate.value.z], [indexOf(m.lensId), m.baseD, m.widthKind], `${v.id} against ${mate}`);
    }
    assert.ok(n >= 10, `${n} vessels have a mate`);
    for (const v of NETWORK) if (!(forkMateOf(v.id) ?? cavaMateOf(v.id))) assert.equal((s.vesselObject(v.id)?.toon.uniforms as unknown as { nbrMate: { value: { x: number } } } | undefined)?.nbrMate.value.x ?? -1, -1, v.id);
  } finally { s.dispose(); }
});

test('where a vein meets the cava follows the cava\'s drawn width: a wider cava has its wall further out along the vein, so a clot and the cut stop there', () => {
  for (const id of ['RHV_IVC', 'MHV_IVC', 'LHV_IVC']) {
    const h = drawnHost(id)!, w1 = cavaWallShare(h, 1)!, w3 = cavaWallShare(h, 3)!, w05 = cavaWallShare(h, 0.5)!;
    assert.ok(w3 < w1 && w1 <= w05, `${id}: ${w3} < ${w1} <= ${w05}`);
  }
});

test('the cava is whole where the hepatic veins join it and eases to its faint tone above and below: both vessels have the same (solid) opacity at the junction', async () => {
  const { CONFLUENCE, CONFLUENCE_FEATHER } = await import('../src/scene/vessels/fades.ts');
  const { tipAlpha } = await import('../src/scene/vessels/fade-alpha.ts');
  const { EDGE_PATH_2D } = await import('../src/scene/vessels/paths.copied.ts');
  const { y3 } = await import('../src/scene/frame2d.ts');
  const f = fadeOf('IVC_IS', false)!;
  assert.deepEqual(f, CONFLUENCE);
  for (const id of ['RHV_IVC', 'MHV_IVC', 'LHV_IVC']) {
    const p = EDGE_PATH_2D[id]!, y = y3(p[p.length - 1]![1]);
    assert.equal(tipAlpha(f, 0.5, 0, y), 1, `${id}: the cava is solid at the height its vein enters`);
  }
  assert.equal(tipAlpha(f, 0.5, 0, f.from + f.to + CONFLUENCE_FEATHER + 0.01), CAVA_RECEDE, 'faint well away from it');
  assert.equal(tipAlpha(f, 0.5, 0, f.from - f.to - CONFLUENCE_FEATHER - 0.01), CAVA_RECEDE);
  let prev = 1;
  for (let i = 1; i <= 20; i++) { const a = tipAlpha(f, 0.5, 0, f.from + f.to + (CONFLUENCE_FEATHER * i) / 20); assert.ok(a <= prev + 1e-12 && prev - a < 0.12, `gradual at ${i}`); prev = a; }
  assert.match((await import('node:fs')).readFileSync(new URL('../src/scene/vessels/shaders.ts', import.meta.url), 'utf8'), /fa = mix\(fadeA\.z, fadeA\.w, 1\.0 - smoothstep\(fadeA\.y, fadeA\.y \+ max\(fadeLine\.x, 1e-4\), abs\(position\.y - fadeA\.x\)\)\);/);
});

test('no vein end renders open: on every vessel that opens into the cava, no point of its surface that the shader keeps lies inside the cava\'s lumen (every triangle sampled, against the true distance to the cava\'s course)', async () => {
  const { neighbourAttr } = await import('../src/scene/vessels/neighbour.ts');
  const s = new CelScene();
  try {
    let n = 0;
    for (const v of NETWORK) {
      if (!opensIntoCava(v.id)) continue;
      n++;
      const g = s.vesselObject(v.id)!.toonMesh.geometry, pos = g.getAttribute('position'), nbr = g.getAttribute('nbr'), idx = g.index!;
      let kept = 0, inside = 0, worst = 0;
      for (let t = 0; t < idx.count; t += 3) {
        const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
        for (const [wa, wb, wc] of [[1 / 3, 1 / 3, 1 / 3], [0.6, 0.2, 0.2], [0.2, 0.6, 0.2], [0.2, 0.2, 0.6]] as const) {
          const x = wa * pos.getX(a) + wb * pos.getX(b) + wc * pos.getX(c), y = wa * pos.getY(a) + wb * pos.getY(b) + wc * pos.getY(c);
          const d = Math.abs(wa * nbr.getX(a) + wb * nbr.getX(b) + wc * nbr.getX(c)), R = wa * nbr.getY(a) + wb * nbr.getY(b) + wc * nbr.getY(c);
          const truth = Math.abs(neighbourAttr(v.id, new Float32Array([x, y, 0]))![0]!);
          worst = Math.max(worst, Math.abs(d - truth));
          if (d >= R) { kept++; if (truth < R - 1e-4) inside++; }
        }
      }
      assert.ok(kept > 100, `${v.id} keeps its body outside the lumen`);
      assert.equal(inside, 0, `${v.id}: nothing it keeps lies inside the lumen`);
      assert.ok(worst < 5e-4, `${v.id}: the interpolated distance is the true one (${worst})`);
    }
    assert.ok(n >= 4);
  } finally { s.dispose(); }
});
