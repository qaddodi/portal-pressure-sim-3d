// Junction skins drawn as three copies (docs/junction-skin-spec.md 10.4): a junction with an arm the 2D figure draws behind the organs (the cava, the SVC's pieces) is ONE geometry on three meshes, front, solid and veil, each weighted by the arms' own
// shares of those copies, so a skin is never visible where its arms are not (Mohammad saw a stray floating skin). Node only: the real scene, no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins, smoothJoinsOn } from '../src/scene/vessels/join-mode.ts';
import { useSettings } from '../src/state/settings.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { FAINT_ONLY_LAYER, type VesselObject } from '../src/scene/vessels/vessel-object.ts';
import { VESSEL_LAYER } from '../src/scene/layers.ts';
import { BACK_EDGES } from '../src/scene/vessels/paths.copied.ts';
import { CAVA_LIKE } from '../src/scene/vessels/fades.ts';
import { SkinObject, COPY_LAYER, COPY_ORDER, SKIN_COPIES } from '../src/scene/vessels/skin/skin-object.ts';
import { SKIN_FS } from '../src/scene/vessels/skin/shaders.ts';
import { copyAlpha } from '../src/scene/vessels/skin/arm-twins.ts';
import type { SkinMesh } from '../src/scene/vessels/skin/types.ts';
import type { Mesh, ShaderMaterial } from 'three';

interface Built { node: string; mesh: SkinMesh; draw: SkinObject; arms: { id: string; obj: VesselObject }[] }
interface Inner { skins: { built: Built[]; sync(): boolean; endsOf(id: string): [boolean, boolean] } }

function withScene<T>(f: (s: CelScene, built: Built[]) => T): T {
  const was = smoothJoinsOn(); setSmoothJoins(true);  const s = new CelScene({ joins: 'mesh2' });
  // (a node that fell back is listed with no draw: left out)
  try { return f(s, (s as unknown as Inner).skins.built.filter((b) => b.draw)); } finally { s.dispose(); setSmoothJoins(was); }
}
// (the SVC's two junctions, SVC_E and SVC, are ONE skin: their seams are 0.9 radii apart, cuts.ts MIN_STUB_R)
const BACK_NODES = ['IVCI', 'SVC_E+SVC'];
const sync = (s: CelScene): boolean => (s as unknown as Inner).skins.sync();

/** What the tube draws of each of its copies, read from the tube's OWN state (layer, uniforms, mesh) and not through `copyShares`: the front copy is the tube's mesh in the vessels' pass, the solid copy the same mesh with the organs (layer 0), the veil the second mesh. */
function tubeCopies(o: VesselObject): [number, number, number] {
  const u = o.toon.uniforms, solidK = u.solidK!.value as number, veilK = u.veilK!.value as number;
  const lay = (o.toonMesh.layers.mask >> VESSEL_LAYER) & 1 ? 'front' : (o.toonMesh.layers.mask & 1) ? 'solid' : (o.toonMesh.layers.mask >> FAINT_ONLY_LAYER) & 1 ? 'none' : 'none';
  const veil = (o as unknown as { veil: { mesh: Mesh } | null }).veil;
  return [lay === 'front' ? solidK : 0, lay === 'solid' ? solidK : 0, veil && veil.mesh.visible ? veilK : 0];
}

test('the junctions with an arm behind the organs are skinned: IVCI and the two SVC junctions as one skin (IVCS keeps the old join: its hepatic veins land too far apart along the cava to be a junction)', () => {
  withScene((s) => { for (const n of BACK_NODES) assert.ok(s.skinNodes.includes(n), `${n} is skinned (${s.skinNodes.join(', ')})`); });
});

test('a skin is ONE geometry on three meshes, one source in three programs (SKIN_COPY 0, 1, 2), on the layers and in the order of the tubes\' own copies', () => {
  assert.deepEqual([...COPY_LAYER], [VESSEL_LAYER, 0, VESSEL_LAYER]); assert.deepEqual([...COPY_ORDER], [0, 0, 2]); assert.equal(SKIN_COPIES, 3);
  withScene((_s, built) => {
    for (const b of built) {
      const c = b.draw.copies;
      assert.equal(c.length, 3, b.node);
      assert.equal(c[0]!.geometry, c[1]!.geometry); assert.equal(c[0]!.geometry, c[2]!.geometry);
      const mats = c.map((m) => m.material as ShaderMaterial);
      assert.deepEqual(mats.map((m) => m.defines.SKIN_COPY), [0, 1, 2], b.node);
      assert.equal(mats[0]!.uniforms, mats[1]!.uniforms, 'one uniforms object: a value written once reaches every copy'); assert.equal(mats[0]!.uniforms, mats[2]!.uniforms);
      assert.ok(mats.every((m) => m.fragmentShader === SKIN_FS && m.fragmentShader === mats[0]!.fragmentShader));
      c.forEach((m, k) => { assert.equal(m.layers.mask, 1 << COPY_LAYER[k]!, `${b.node} copy ${k} layer`); assert.equal(m.renderOrder, COPY_ORDER[k]!, `${b.node} copy ${k} order`); });
      assert.equal(b.draw.object.children.length, 4, 'the three copies and the selection glow\'s hull');
      assert.ok(b.draw.object.children.includes(b.draw.glow) && !b.draw.glow.visible, 'the glow is hidden until an arm is picked');
      assert.equal(b.draw.glow.layers.mask, 1 << 3, 'on the glow\'s own layer (glow.ts GLOW_LAYER), drawn only by the mask pass'); assert.equal((b.draw.glow.material as ShaderMaterial).defines.GLOW, 1); assert.equal((b.draw.glow.material as ShaderMaterial).uniforms, mats[0]!.uniforms, 'the skin\'s own uniforms');
    }
  });
  assert.match(SKIN_FS, /#ifndef SKIN_COPY[\s\S]*#define SKIN_COPY 0/, 'a skin with no define is its front copy');
  assert.match(SKIN_FS, /armCopy\[0\]\[SKIN_COPY\]/, 'the alpha takes each arm\'s share of THIS copy');
});

test('a plain junction (no arm behind the organs) draws its front copy alone, as before; a junction with one draws the copies its arms have', () => {
  withScene((_s, built) => {
    for (const b of built) {
      const back = b.arms.some((a) => BACK_EDGES.has(a.id));
      if (!back) { assert.deepEqual(b.draw.copies.map((m) => m.visible), [true, false, false], `${b.node}: only the front copy`); continue; }
      assert.ok(b.draw.copies.some((m) => m.visible), b.node);
      b.arms.forEach((a, i) => { assert.equal(a.obj.behindOrgans, BACK_EDGES.has(a.id), `${b.node}/${a.id}`); void i; });
    }
  });
});

test('at every arm\'s seam each copy\'s alpha is the arm tube\'s own alpha of that copy (its front, solid and veil), for the Hide-vessels-behind-organs share k in {0, 0.5, 1} and the cava whole or not', () => {
  withScene((s, built) => {
    const back = built.filter((b) => BACK_NODES.includes(b.node));
    assert.ok(back.length === 2);
    for (const k of [0, 0.5, 1]) for (const whole of [0, 1]) {
      for (const b of back) for (const a of b.arms) { if (a.obj.behindOrgans) { a.obj.setOcclusion(k); if (CAVA_LIKE.has(a.id)) a.obj.setWholeShare(whole); } }
      sync(s);
      for (const b of back) {
        const m = b.mesh, shares = b.arms.map((a) => a.obj.copyShares());
        const fades = (b.draw.material.uniforms.armAF!.value as Array<{ y: number }>).map((v) => v.y).slice(0, b.arms.length);
        b.arms.forEach((a, i) => {
          const tube = tubeCopies(a.obj), seam = m.seamVerts[i]![0]!;
          const w = Array.from(m.weight.subarray(seam * 4, seam * 4 + 4));
          assert.deepEqual(w.map((x) => Math.round(x * 1e4) / 1e4), w.map((_, q) => (q === i ? 1 : 0)), `${b.node}/${a.id}: a seam vertex is wholly its own arm`);
          for (const c of [0, 1, 2] as const) {
            const skin = copyAlpha(w, shares.map((x, q) => (q === i ? x : [0, 0, 0])), fades, c);
            assert.ok(Math.abs(skin - tube[c]! * fades[i]!) < 1e-6, `${b.node}/${a.id} copy ${c} at k=${k} whole=${whole}: skin ${skin} tube ${tube[c]! * fades[i]!}`);
          }
        });
      }
    }
  });
});

test('a skin has no visibility of its own: it shows a copy only where an arm that is there has a share of it, and a hidden arm or one not yet drawn gives it nothing', () => {
  withScene((s, built) => {
    const b = built.find((x) => x.node === 'SVC_E+SVC')!;
    sync(s);
    assert.ok(b.draw.copies.some((m) => m.visible));
    // every arm hidden by the scene (presence): no copy is drawn
    for (const a of b.arms) a.obj.group.visible = false;
    sync(s);
    assert.deepEqual(b.draw.copies.map((m) => m.visible), [false, false, false], 'a skin whose arms are all hidden is not there');
    // one arm back: its own copies only
    b.arms[2]!.obj.group.visible = true;
    sync(s);
    const own = b.arms[2]!.obj.copyShares();
    assert.deepEqual(b.draw.copies.map((m) => m.visible), own.map((x) => x > 1e-3), 'only the copies the drawn arm has');
    // still drawing on: a tube whose reveal has not reached its seam gives its skin nothing at that arm
    for (const a of b.arms) a.obj.group.visible = true;
    b.arms[2]!.obj.setReveal(0);
    b.arms.forEach((a, i) => { if (i !== 2) a.obj.group.visible = false; });
    sync(s);
    assert.deepEqual(b.draw.copies.map((m) => m.visible), [false, false, false], 'reveal 0 and the others hidden: the seam is not drawn, so neither is the skin');
    b.arms[2]!.obj.setReveal(1);
    for (const a of b.arms) a.obj.group.visible = true;
    sync(s);
    assert.deepEqual(b.draw.copies.map((m) => m.visible), [true, true, true], 'all there again');
  });
});

test('a skin that has an arm behind the organs blends (its copies are fractional where an arm\'s share of them is); one that has none keeps the tubes\' own opacity', () => {
  withScene((s, built) => {
    sync(s);
    for (const b of built) {
      const blend = b.arms.some((a) => a.obj.toon.transparent || a.obj.behindOrgans);
      for (const m of b.draw.copies) assert.equal((m.material as ShaderMaterial).transparent, blend, `${b.node}`);
    }
  });
});

test('the cava\'s cut rules: where a skin has taken the end of a hepatic vein that opens into the cava, its cavaCut and CAVA_BURY are off, and they come back exactly when the skin goes', () => {
  withScene((s) => {
    const inner = s as unknown as { skins: { endsOf(id: string): [boolean, boolean] } | null; applyMates(): void };
    const rhv = s.vesselObject('RHV_IVC')!, u = rhv.toon.uniforms;
    const bury = () => (u.bury!.value as { y: number }).y;
    const real = inner.skins;
    assert.ok(real!.endsOf('RHV_IVC')[1], 'the real IVCS skin (side-wall, spec 10.1) has the end of the hepatic vein');
    try {
      inner.skins = { endsOf: () => [false, false] } as never;
      inner.applyMates();
      assert.equal(u.cavaCut!.value, 1, 'cut by the cava while no skin has the end'); const buried = bury();
      assert.ok(buried >= 0.9 * NETWORK_BY_ID.get('IVC_IS')!.radius - 1e-9 && buried > 0, 'held back by CAVA_BURY (0.9) cava radii');
      inner.skins = { endsOf: (id: string) => (id === 'RHV_IVC' ? [false, true] : [false, false]) } as never;
      inner.applyMates();
      assert.equal(u.cavaCut!.value, 2, 'a skin is the opening: no hard cut inside the cava, the tube fades to the cava\'s opacity along the seam (the junction fade rule, scene.ts setCavaCut \'fade\')'); assert.equal(bury(), 0, 'and no held-back ink');
      inner.skins = { endsOf: () => [false, false] } as never;
      inner.applyMates();
      assert.equal(u.cavaCut!.value, 1); assert.equal(bury(), buried, 'back exactly when the skin goes');
    } finally { inner.skins = real; }   // (the scene disposes the skins it holds: a stub has none)
    inner.applyMates();
    assert.equal(u.cavaCut!.value, 2, 'and the fade again with the real IVCS skin'); assert.equal(bury(), 0);
  });
});
