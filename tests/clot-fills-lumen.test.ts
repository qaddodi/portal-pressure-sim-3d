// A clot fills its vein INSIDE the wall (Mohammad, 20 Nov: "the clots don't fill inside the blood vessels at all"; the Budd-Chiari hepatic-vein clots were thick dark capsules lying over and beyond thin, faded veins).
// Root cause: the clot was sized from the vein's 2D course and the radius its tube was built at, not from the vein AS DRAWN (its own centreline, its taper into the liver, the engine's live diameter that the shader draws
// the width from) and it was lifted toward the viewer past the wall. Every clot of every preset is pinned here: each ring is a circle that lies whole inside the live lumen, on the drawn centreline, as faint as the vein.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CelScene } from '../src/scene/scene.ts';
import { CLOT_INSIDE, CLOT_RINGS, clotShapeOf, clotShares } from '../src/scene/disease/clots.ts';
import { drawnHost, hostAt, swellsOf } from '../src/scene/disease/host.ts';
import { widthSwell } from '../src/scene/vessels/live-width.ts';
import { vesselAlphaAt } from '../src/scene/vessels/fade-alpha.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { presetIds, presetState } from './b4-presets.ts';

const ids = await presetIds();
const ALL_VEINS = ['PV_TRUNK', 'SV_CONF', 'RHV_IVC', 'MHV_IVC', 'LHV_IVC', 'IVC_IS', 'IVC_IS_1'];

test('the vessel shader\'s width rule, on the CPU: the built width is 1, a narrowed vein is thinner, an artery is half, a fixed width is 1', () => {
  assert.equal(widthSwell(0, 6, 6), 1);
  assert.ok(widthSwell(0, 6, 1) < 0.5 && widthSwell(0, 6, 12) > 1);
  assert.equal(widthSwell(2, 6, 1), 1);
  assert.equal(widthSwell(0, 6, undefined), 1);
  assert.ok(widthSwell(0, 6, 0.0001) >= 0.2 && widthSwell(0, 6, 1e6) <= 8);
});

test('every clot ring lies whole inside the live lumen (0.9 of its radius), whatever the occlusion, the swell and the vein', () => {
  for (const id of ALL_VEINS) {
    const h = drawnHost(id);
    assert.ok(h, `${id} has a drawn course`);
    for (const k of [0.3, 1, 2.5]) for (const v of [0.05, 0.3, 0.7, 1]) {
      const sw = h!.pieces.map(() => k), shape = clotShapeOf(h!, sw, v, id), on = hostAt(h!, sw, clotShares(h!, v));
      for (let i = 0; i < shape.centres.length; i++) {
        const off = shape.centres[i]!.distanceTo(on[i]!.p);
        assert.ok(off + shape.radii[i]! <= CLOT_INSIDE * on[i]!.r + 1e-9, `${id} swell ${k} v ${v} ring ${i}: ${(off + shape.radii[i]!).toFixed(5)} within ${(CLOT_INSIDE * on[i]!.r).toFixed(5)}`);
        assert.ok(shape.radii[i]! > 0 && Number.isFinite(shape.centres[i]!.x + shape.centres[i]!.y + shape.centres[i]!.z));
        assert.ok(shape.alpha[i]! >= 0 && shape.alpha[i]! <= 1);
      }
    }
  }
});

test('the offset is across the vein (perpendicular to its heading), never along it or out toward the viewer', () => {
  for (const id of ALL_VEINS) {
    const h = drawnHost(id)!, sw = h.pieces.map(() => 1), shape = clotShapeOf(h, sw, 0.3, id), on = hostAt(h, sw, clotShares(h, 0.3));
    for (let i = 0; i < shape.centres.length; i++) { const d = shape.centres[i]!.clone().sub(on[i]!.p); assert.ok(Math.abs(d.dot(on[i]!.t)) < 1e-6 * Math.max(1, d.length()) + 1e-9, `${id} ring ${i}`); }
  }
});

test('a narrowed vein gets a thinner clot: the same occlusion on a swell of 0.3 is a third of the radius of one on 1', () => {
  const h = drawnHost('RHV_IVC')!, thin = clotShapeOf(h, h.pieces.map(() => 0.3), 1, 'RHV_IVC'), whole = clotShapeOf(h, h.pieces.map(() => 1), 1, 'RHV_IVC');
  const m = Math.floor(thin.radii.length / 2);
  assert.ok(thin.radii[m]! < 0.4 * whole.radii[m]!, `${thin.radii[m]} vs ${whole.radii[m]}`);
});

test('a clot is as faint as its vein: the hepatic veins fade into the liver, so their clots do', () => {
  const h = drawnHost('RHV_IVC')!, sw = h.pieces.map(() => 1), shape = clotShapeOf(h, sw, 1, 'RHV_IVC');
  assert.ok(Math.min(...shape.alpha) < 0.999 || Math.min(...h.A) < 0.999, 'the vein fades somewhere');
  const on = hostAt(h, sw, [0.5]);
  const q = h.pieces[h.piece[Math.floor(h.pts.length / 2)]!]!.id, p = on[0]!.p;
  assert.ok(Math.abs(vesselAlphaAt(q, 0.5, p.x, p.y) - on[0]!.a) < 0.5, 'the alpha is the vessel\'s own rule');
  assert.ok(NETWORK_BY_ID.has(q));
});

test('the drawn course of a vein cut in pieces is one vein, in order, and has finite radii', () => {
  const h = drawnHost('PV_TRUNK')!;
  assert.ok(h.pieces.length >= 1);
  for (let i = 0; i < h.pts.length; i++) assert.ok(h.R[i]! > 0 && Number.isFinite(h.R[i]!) && h.A[i]! >= 0 && h.A[i]! <= 1, `point ${i}`);
  for (let i = 1; i < h.s.length; i++) assert.ok(h.s[i]! > h.s[i - 1]!);
});

test('every preset: every clot it has is built inside its vein, as a ClotObject that carries the vein\'s opacity per vertex', async () => {
  for (const id of ids) {
    const st = await presetState(id), th = st.params.thrombus ?? {};
    const s = new CelScene(), c = s.disease.clots;
    c.set(th, 0.016, true, st.frame.D);
    for (const [vein, v] of Object.entries(th)) {
      if (!(v > 0.003)) continue;
      const shape = c.shapeOf(vein, st.frame.D);
      assert.ok(shape, `${id}: clot ${vein} is built`);
      const h = drawnHost(vein)!, sw = swellsOf(h, st.frame.D), on = hostAt(h, sw, clotShares(h, v));
      for (let i = 0; i < CLOT_RINGS; i++) assert.ok(shape!.centres[i]!.distanceTo(on[i]!.p) + shape!.radii[i]! <= CLOT_INSIDE * on[i]!.r + 1e-9, `${id}: ${vein} ring ${i}`);
    }
    for (const m of c.group.children) for (const k of m.children) { const g = (k as unknown as { geometry: { getAttribute(n: string): { count: number } | undefined; getAttribute2?: never } }).geometry; assert.ok(g.getAttribute('lumA'), `${id}: a clot's vertices carry the vein's opacity`); assert.equal(g.getAttribute('lumA')!.count, g.getAttribute('position')!.count); }
    s.dispose?.();
  }
});

test('a clot draws after the vessels and before the devices (render order), one fill and one outline each', async () => {
  const st = await presetState('budd-chiari');
  const s = new CelScene(), c = s.disease.clots;
  c.set(st.params.thrombus ?? {}, 0.016, true, st.frame.D);
  let n = 0;
  for (const g of c.group.children) for (const m of g.children) { n++; const mesh = m as unknown as { renderOrder: number; material: { depthTest: boolean; transparent: boolean } }; assert.ok(mesh.renderOrder >= 900 && mesh.renderOrder < 1000, `render order ${mesh.renderOrder}`); }
  assert.ok(n >= 6, 'three clots, a fill and an outline each');
  s.dispose?.();
});

test('a clot in a vein that opens into the cava runs to the cava\'s wall (the junction); in a vein that does not, it stays 2D\'s span', async () => {
  const { cavaWallShare } = await import('../src/scene/disease/host.ts');
  for (const id of ['RHV_IVC', 'MHV_IVC', 'LHV_IVC']) {
    const h = drawnHost(id)!, w = cavaWallShare(h);
    assert.ok(w != null && w > 0.5 && w <= 1, `${id} meets the cava's wall at ${w}`);
    for (const v of [0.05, 0.5, 1]) {
      const sh = clotShares(h, v);
      assert.ok(Math.abs(sh[sh.length - 1]! - Math.max(0.6 + 0.22 * v, w)) < 1e-9, `${id} v ${v}: last ring at ${sh[sh.length - 1]}`);
    }
  }
  const pt = drawnHost('PV_TRUNK')!;
  assert.equal(cavaWallShare(pt), null);
  const s = clotShares(pt, 0.5);
  assert.ok(Math.abs(s[0]! - (0.4 - 0.11)) < 1e-9 && Math.abs(s[s.length - 1]! - (0.6 + 0.11)) < 1e-9);
});
