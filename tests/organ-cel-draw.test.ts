// Cel shaded organs, the draw: the liver's bands come from its smooth rest normal, the organs are painted in 2D's order with their outlines over the one before, and a vessel behind the
// organs gets the wash's see-through back. The wash itself is checked to be exactly as it was.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ORGAN_FS, ORGAN_VS } from '../src/scene/organs/organ-shader.ts';
import { organsReady, setOrganData } from '../src/scene/organs/meshes.ts';
import { ORGAN_ORDER, ORGAN_STYLE } from '../src/scene/organs/layer.ts';
import { CelScene } from '../src/scene/scene.ts';
import { CEL_STYLE } from '../src/scene/cel-style.ts';
import { PALETTES } from '../src/scene/palette.ts';

const file = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
setOrganData(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);
const O = CEL_STYLE.ORGAN;

async function organs() {
  await organsReady;
  const s = new CelScene();
  s.disease.organs.build();
  return { s, organs: s.disease.organs };
}

test('the liver\'s bands are cut by its smooth rest normal (no honeycomb from cirrhosis\'s bumps); what varies over the organ is laid at a low share', async () => {
  assert.match(ORGAN_VS, /#ifdef CEL_NORMAL\nattribute vec3 celNormal;/);
  assert.match(ORGAN_FS, /dot\(normalize\(vCn\), CEL_LIGHT\)/);
  assert.ok(ORGAN_FS.includes(`inkAmount * ${O.PAINT}`), 'the nodules, the dead spleen and the pool at PAINT of their strength');
  assert.ok(O.PAINT <= 0.5 && O.TUCK_AO >= 0.6, 'low contrast: only a deep tuck bands');
  const { s, organs: ol } = await organs();
  const liver = ol.byId.get('liver')!;
  const at = liver.toonMesh.geometry.getAttribute('celNormal');
  assert.ok(at && at.normalized && at.itemSize === 3, 'one signed byte an axis');
  assert.ok('CEL_NORMAL' in (liver.toon.defines ?? {}));
  for (const [id, o] of ol.byId) if (id !== 'liver') assert.ok(!('CEL_NORMAL' in (o.toon.defines ?? {})) && !o.toonMesh.geometry.getAttribute('celNormal'), id);
  s.dispose?.();
});

test('the cel organs are painted in 2D\'s order, outline first and fill over it, with no depth test among them (the gut keeps its test); the wash is as it was', async () => {
  const { s, organs: ol } = await organs();
  const state = () => ol.objects.map((o) => [o.toon.depthFunc, o.ink.depthFunc, o.ink.depthWrite, o.toonMesh.renderOrder, ...o.group.children.filter((c) => c !== o.toonMesh).map((c) => c.renderOrder)]);
  ol.setFill('seethrough', true); ol.update(1000);
  const wash = state();
  ol.setFill('solid'); for (let t = 1016; t < 4000 && ol.update(t); t += 16);
  for (const [id, o] of ol.byId) {
    const i = ORGAN_ORDER.indexOf(id);
    const hull = o.group.children.find((c) => c !== o.toonMesh)!;
    if (ORGAN_STYLE[id]!.layer === 'gut') { assert.equal(o.toon.depthFunc, 3, `${id}: the gut keeps its depth test`); assert.ok(hull.renderOrder > o.toonMesh.renderOrder); continue; }
    assert.equal(o.toon.depthFunc, 1, `${id}: no depth test (AlwaysDepth)`);
    assert.equal(o.ink.depthWrite, false);
    assert.equal(hull.renderOrder, 2 * i); assert.equal(o.toonMesh.renderOrder, 2 * i + 1, `${id}: the outline, then the fill over it`);
  }
  ol.setFill('seethrough'); for (let t = 4016; t < 8000 && ol.update(t); t += 16);
  assert.deepEqual(state(), wash, 'back to the wash: depth functions, writes and the draw order exactly as before');
  s.dispose?.();
});

test('a vessel behind the organs takes the wash\'s see-through back (veil lift), and the 2D veil is exact with the wash', async () => {
  const { s, organs: ol } = await organs();
  ol.applyLook(PALETTES.light);
  type Back = { veil: { mat: { uniforms: { veilA: { value: number } } } } | null; setVeilLift(l: number): void; setWholeShare(k: number): void };
  const back = (s as unknown as { back: Back[] }).back;
  assert.ok(back.length > 0);
  const v = back[0]!, a = () => v.veil!.mat.uniforms.veilA.value;
  ol.setFill('seethrough', true); ol.update(1000);
  assert.equal(ol.veilLift, 0);
  v.setVeilLift(ol.veilLift); assert.equal(a(), 0.4, 'the 2D veil exactly');
  ol.setFill('solid', true); ol.update(1016);
  const lift = ol.veilLift;
  assert.ok(Math.abs(lift - 0.6 * O.VEIL_SEE * (1 - PALETTES.light.organLayer)) < 1e-9);
  v.setVeilLift(lift); assert.ok(Math.abs(a() - (0.4 + lift)) < 1e-9 && a() > 0.6 && a() < 0.75, `the veil lifts to ${a()}`);
  v.setWholeShare(1); assert.equal(a(), 1, 'a cava shown whole is whole');
  v.setWholeShare(0); assert.ok(Math.abs(a() - (0.4 + lift)) < 1e-9);
  v.setVeilLift(0); assert.equal(a(), 0.4);
  s.dispose?.();
});
