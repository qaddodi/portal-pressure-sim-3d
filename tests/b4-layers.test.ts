// The B4 layers on their own: the ascites pool, the clots, the bleed, the dye and the organs, stepped the way the clock steps them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, BufferGeometry } from 'three';
import type { VesselObject } from '../src/scene/vessels/vessel-object.ts';
import type { CelShared } from '../src/scene/materials/cel.ts';
import { paletteFor } from '../src/scene/palette.ts';
import { OrganLayer } from '../src/scene/organs/layer.ts';
import { CelScene } from '../src/scene/scene.ts';
import { AscitesLayer } from '../src/scene/disease/ascites.ts';
import { poolFade } from '../src/scene/disease/copied/fluid-step.js';
import { bodyTargets } from '../src/scene/disease/targets.ts';
import { presetState } from './b4-presets.ts';

const flat = { PV_TRUNK: 1 };

test('the ascites pool: nothing under 150 mL, rises with the volume, never goes backwards while it fills', () => {
  const a = new AscitesLayer();
  a.set(0); assert.equal(a.surface, null); assert.equal(a.group.children.every((m) => !m.visible), true);
  let last = Infinity;
  for (const ml of [200, 800, 2000, 5000, 8000]) { a.set(ml); assert.ok(a.surface !== null && a.surface < last, `${ml} mL: the level rises (smaller y)`); last = a.surface!; }
  assert.equal(poolFade(150), 0); assert.ok(poolFade(300) > 0.99);
  a.set(0); assert.equal(a.surface, null, 'emptied, the pool goes');
  a.dispose();
});

test('the bulge follows the volume in the 2D steps, and the bowel floats up with it', () => {
  const a = new AscitesLayer();
  a.set(0); assert.equal(a.bulge, 0);
  a.set(8500); assert.equal(a.bulge, 34);
  a.dispose();
});

test('clots ease in over a patient, come in whole when the patient loads, and go when the patient has none', () => {
  const s = new CelScene(); const c = s.disease.clots;
  assert.equal(c.set(flat, 0.016, true), false); assert.equal(c.shown().PV_TRUNK, 1);
  c.set({ PV_TRUNK: 0 }, 0.016); const first = c.shown().PV_TRUNK ?? 0;
  assert.ok(first < 1 && first > 0, 'one frame later it is part-way, not gone');
  for (let i = 0; i < 400; i++) c.set({ PV_TRUNK: 0 }, 0.016);
  assert.equal(c.shown().PV_TRUNK, undefined, 'gone');
  c.set({ PV_TRUNK: 0.5 }, 0.016, true); assert.equal(c.shown().PV_TRUNK, 0.5);
  s.dispose?.();
});

test('the bleed fades in and out, never pops, and shows only while it runs', () => {
  const s = new CelScene(); const b = s.disease.bleed;
  const on = { active: true, site: 'VAR' as const, rate: 120, total: 300 };
  b.set({ ...on, active: false }, 0.016, true); assert.equal(b.group.visible, false);
  b.set(on, 0.016); assert.equal(b.group.visible, true, 'starts on the first frame, faint');
  for (let i = 0; i < 100; i++) b.set(on, 0.016);
  b.set({ ...on, active: false }, 0.016); assert.equal(b.group.visible, true, 'still fading');
  for (let i = 0; i < 400; i++) b.set({ ...on, active: false }, 0.016);
  assert.equal(b.group.visible, false);
  s.dispose?.();
});

test('dye: a bolus goes in, is carried by the flow, and the layer says when it is done', async () => {
  const s = new CelScene(); const d = s.disease.dye;
  const st = await presetState('healthy');
  assert.equal(d.step(0.1, st.frame), false, 'nothing in the body: no frames asked for');
  assert.equal(d.inject('NOT_A_VESSEL'), false);
  assert.equal(d.inject('PV_TRUNK', 0), true);
  let steps = 0; while (d.step(0.1, st.frame) && steps < 4000) steps++;
  assert.ok(steps > 5 && steps < 4000, `the bolus runs ${steps} steps and ends`);
  assert.equal(d.group.children.every((m) => !m.visible), true, 'every overlay hidden after');
  s.dispose?.();
});

test('the organs: the liver follows cirrhosis and congestion, the spleen its size, a removed spleen is a ghost, a grey lens greys', async () => {
  const s = new CelScene();
  const box = () => new BoxGeometry(0.2, 0.2, 0.1, 4, 4, 2);
  const o = new OrganLayer((s as unknown as { shared: CelShared }).shared, { liver: box, spleen: box, stomach: box });
  const set = async (id: string) => { const p = await presetState(id); o.setBody(bodyTargets(p.frame, p.params, p.healthyP), true); for (let i = 0; i < 80; i++) o.update(1000 + i * 33); return bodyTargets(p.frame, p.params, p.healthyP); };
  const scale = (id: string) => o.byId.get(id)!.group.scale.x;
  await set('healthy'); assert.equal(scale('liver'), 1); assert.equal(scale('spleen'), 1);
  const t = await set('cirr-decomp');
  assert.ok(Math.abs(scale('liver') - t.liverScale) < 1e-6 && scale('liver') < 1, 'a cirrhotic liver is smaller');
  assert.ok(Math.abs(scale('spleen') - t.spleenScale) < 1e-6 && scale('spleen') > 1.5, 'a big spleen is bigger');
  const rhf = await set('rhf'); assert.ok(scale('liver') > 1 && Math.abs(scale('liver') - rhf.liverScale) < 1e-6, 'a congested liver swells');
  assert.equal(o.update(20000), false, 'at rest it asks for no frames');
  const colour = () => (o.byId.get('spleen')!.toon.uniforms.color!.value as { r: number }).r;
  const palette = paletteFor('light');
  if (palette) {
    o.applyLook(palette); o.update(21000);
    const plain = colour();
    o.setBody({ ...t, splenicRx: 2 }, false); for (let i = 0; i < 60; i++) o.update(22000 + i * 33);
    assert.notEqual(colour(), plain, 'a removed spleen is a ghost: its colour moves to the plate');
    o.setLensGrey(true); for (let i = 0; i < 60; i++) o.update(25000 + i * 33);
    assert.notEqual((o.byId.get('liver')!.toon.uniforms.color!.value as { r: number }).r, 0, 'grey lens repaints');
  }
  o.dispose(); s.dispose?.();
});

test('a clot change writes the vein\'s own clot uniforms and makes or disposes nothing: the clot is the vein\'s pixels (plan 26), so there is no clot geometry to replace', () => {
  const s = new CelScene(); const c = s.disease.clots;
  const pieces = (s.vessels as unknown as VesselObject[]).filter((o) => o.toon?.uniforms?.clotA);
  assert.ok(pieces.length > 50, 'every drawn vein piece carries the clot uniform');
  const a = () => pieces.map((o) => (o.toon.uniforms.clotA!.value as { z: number }).z);
  let disposed = 0; for (const o of pieces) o.toonMesh.geometry.addEventListener('dispose', () => disposed++);
  c.set({ PV_TRUNK: 0.4 }, 0.016, true);
  const first = a();   // (sv: side times occlusion, zero for a piece with no clot)
  assert.ok(first.some((z) => z !== 0), 'the clot is in the vein\'s uniforms');
  c.set({ PV_TRUNK: 0.9 }, 0.016, true);
  assert.ok(a().some((z, i) => Math.abs(z) > Math.abs(first[i]!)), 'a bigger clot is a bigger side times occlusion in the same uniforms');
  assert.equal(disposed, 0, 'nothing was disposed or rebuilt');
  assert.equal(c.group.children.length, 0, 'the layer holds no mesh');
  c.set({}, 0.016, true);
  assert.ok(a().every((z) => z === 0), 'no clot, no uniform');
  s.dispose?.();
});
