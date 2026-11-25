// A vessel that merges into a FADED one comes to the target's fade at the junction, gradually, so both have the same fade at the point of junction (Mohammad, 20 Nov), and its end is never an open tube:
// it is cut along the target's wall a pixel wide (back faces are never drawn), its outline is buried there, and what lies in it (a clot) reads the same ramp. App-wide: every vessel that ends on the cava.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CelScene } from '../src/scene/scene.ts';
import { CAVA_RECEDE, IVC_JOIN_ALPHA, fadeOf, ivcJoinSpan, opensIntoCava, trunkMateOf } from '../src/scene/vessels/fades.ts';
import { NETWORK } from '../src/scene/vessels/network.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { VDBG_GLSL } from '../src/scene/vessels/debug-view.ts';
import { CAVA_RAMP_R, cavaRamp } from '../src/scene/vessels/fade-alpha.ts';
import { drawnHost, cavaWallShare } from '../src/scene/disease/host.ts';

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
    let n = 0, skinned = 0;
    const ends = (id: string): readonly [boolean, boolean] => (s as unknown as { skins: { endsOf(id: string): readonly [boolean, boolean] } | null }).skins?.endsOf(id) ?? [false, false];
    for (const v of NETWORK) {
      if (!opensIntoCava(v.id)) continue;
      n++;
      const o = s.vesselObject(v.id)!, u = o.toon.uniforms as unknown as { cavaCut: { value: number }; cavaA: { value: number }; bury: { value: { y: number } } };
      assert.ok(Math.abs(u.cavaA.value - CAVA_RECEDE) < 1e-9, `${v.id} cava opacity`);
      if (ends(v.id)[1]) {
        // (spec 10.4: where a skin has taken the cava end of the vein, the skin IS the opening: the tube stops at its seam outside the wall, so there is no cut inside the lumen and no outline to bury there; the skin blends the vein's alpha at
        //  its seam into the cava piece's, as a gradient through the junction)
        skinned++;
        assert.equal(u.cavaCut.value, 2, `${v.id}: a skin's seam, not a cut: only the opacity ramp stays`);
        assert.equal(u.bury.value.y, 0, `${v.id}: nothing of the tube lies inside the cava to bury`);
      } else {
        assert.equal(u.cavaCut.value, 1, v.id);
        assert.ok(u.bury.value.y > 0, `${v.id}: its outline is buried at the junction`);
      }
    }
    assert.ok(n >= 3);
    assert.ok(skinned >= 1, 'at least the renal vein at IVCI is a skin\'s arm');
  } finally { s.dispose(); }
});

test('no vein end renders open: back faces are never drawn and the cut at the wall is a pixel wide, never along the cava\'s axis, never a feather into the lumen', () => {
  // (993d1620 routed the shader's discards through DROP(n): the back face is still dropped, and the macro is pinned below so it cannot open the ends)
  assert.match(VESSEL_FS, /if \(!gl_FrontFacing\) DROP\(8\);/);
  const [inspector, plain] = VDBG_GLSL.split(/^#else$/m);
  assert.match(plain!, /^#define DROP\(n\) discard;$/m, 'on a normal page DROP is exactly a discard');
  assert.match(inspector!, /#define DROP\(n\) \{ if \(dbgWhy > 0\.5\) \{ gl_FragColor = vec4\(dbgWhyCol\(float\(n\)\), 1\.0\); return; \} discard; \}/, 'in the inspector it paints only behind the switch, and otherwise discards');
  assert.match(VESSEL_FS, /cavA = mix\(1\.0 - smoothstep\(-0\.5, 0\.5, cdPx\), 1\.0, circT\);/);
  assert.doesNotMatch(VESSEL_FS, /smoothstep\(0\.0, 0\.6 \* vNbr\.y, cd\)/);
  assert.doesNotMatch(VESSEL_FS, /smoothstep\(-0\.8 \* vNbr\.y, 0\.0, cd\)/);
});

test('what lies in a vein that opens into the cava reads the same fade: the drawn vein comes to the cava\'s opacity at its wall, and a clot there is as faint', () => {
  // (the vein it opens into: the cava, or for the middle hepatic vein the common trunk it shares with the left one since round 18, fades.ts trunkMateOf; it comes to THAT vessel's opacity at its wall, the trunk's where it opens into the trunk)
  const at = (h: NonNullable<ReturnType<typeof drawnHost>>, share: number): number => { let k = h.s.length - 1; while (k > 0 && h.s[k]! / h.length > share) k--; return h.A[k]!; };
  for (const id of ['RHV_IVC', 'MHV_IVC', 'LHV_IVC']) {
    const h = drawnHost(id)!, w = cavaWallShare(h)!, mate = trunkMateOf(id);
    assert.ok(w > 0.5 && w <= 1);
    // (the trunk's opacity at its axis point nearest the vein's end: where the two meet)
    const nearestA = (t: NonNullable<ReturnType<typeof drawnHost>>, p: { x: number; y: number; z: number }): number => { let bi = 0, bd = Infinity; t.pts.forEach((q, i) => { const d = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z); if (d < bd) { bd = d; bi = i; } }); return t.A[bi]!; };
    const into = mate ? nearestA(drawnHost(mate)!, h.pts[h.pts.length - 1]!) : CAVA_RECEDE;
    assert.ok(Math.abs(at(h, w) - into) < 0.08, `${id}: vein opacity at the wall ${at(h, w)}, the ${mate ? 'common trunk' : 'cava'}'s ${into}`);
    // (the clot is painted in the vein's own fragment: its opacity at the wall is the vein's, by construction: plan 26)
  }
  assert.equal(trunkMateOf('MHV_IVC'), 'LHV_IVC', 'the middle hepatic vein opens into the common trunk (round 18)');
});

test('the other tube is taken at the radius it is DRAWN at: every vessel measured against a mate (a fork, the cava) carries the mate\'s data index, built diameter and kind, and the vertex stage scales nbr by the mate\'s live swell', async () => {
  const { VESSEL_VS } = await import('../src/scene/vessels/shaders.ts');
  const { nbrMatesOf } = await import('../src/scene/vessels/neighbour.ts');   // (every junction is a fork since 8952d0f8: the mate is the first of nbrMatesOf, as the scene wires it)
  const { NETWORK_BY_ID } = await import('../src/scene/vessels/network.ts');
  const { indexOf } = await import('../src/engine/vessel-data.ts');
  assert.match(VESSEL_VS, /vNbr = vec3\(nbr\.x, nbr\.y \* \(nbrMate\.x >= 0\.0 \? swellOf\(nbrMate\.x, nbrMate\.y, nbrMate\.z\) : 1\.0\), nbr\.z\);/);
  assert.doesNotMatch(VESSEL_VS, /vNbr = nbr;/);
  const s = new CelScene();
  try {
    let n = 0;
    for (const v of NETWORK) {
      const mate = nbrMatesOf(v.id)[0];
      if (!mate) continue;
      n++;
      const u = s.vesselObject(v.id)!.toon.uniforms as unknown as { nbrOn: { value: number }; nbrMate: { value: { x: number; y: number; z: number } } };
      const m = NETWORK_BY_ID.get(mate)!;
      assert.equal(u.nbrOn.value, 1, v.id);
      assert.deepEqual([u.nbrMate.value.x, u.nbrMate.value.y, u.nbrMate.value.z], [indexOf(m.lensId), m.baseD, m.widthKind], `${v.id} against ${mate}`);
    }
    assert.ok(n >= 10, `${n} vessels have a mate`);
    for (const v of NETWORK) if (!nbrMatesOf(v.id)[0]) assert.equal((s.vesselObject(v.id)?.toon.uniforms as unknown as { nbrMate: { value: { x: number } } } | undefined)?.nbrMate.value.x ?? -1, -1, v.id);
  } finally { s.dispose(); }
});

test('where a vein meets the cava follows the cava\'s drawn width: a wider cava has its wall further out along the vein, so a clot and the cut stop there', () => {
  for (const id of ['RHV_IVC', 'MHV_IVC', 'LHV_IVC']) {
    const h = drawnHost(id)!, w1 = cavaWallShare(h, 1)!, w3 = cavaWallShare(h, 3)!, w05 = cavaWallShare(h, 0.5)!;
    assert.ok(w3 < w1 && w1 <= w05, `${id}: ${w3} < ${w1} <= ${w05}`);
  }
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
