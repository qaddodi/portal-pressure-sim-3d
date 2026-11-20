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
  assert.ok(O.PAINT <= 0.5, 'low contrast');
  const { s, organs: ol } = await organs();
  const liver = ol.byId.get('liver')!;
  const at = liver.toonMesh.geometry.getAttribute('celNormal');
  assert.ok(at && at.normalized && at.itemSize === 3, 'one signed byte an axis');
  assert.ok('CEL_NORMAL' in (liver.toon.defines ?? {}));
  for (const [id, o] of ol.byId) assert.ok('CEL_NORMAL' in (o.toon.defines ?? {}) && o.toonMesh.geometry.getAttribute('celNormal'), `${id}: every organ is banded by its smooth rest normal`);
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
  v.setVeilLift(lift); assert.ok(Math.abs(a() - (0.4 + lift)) < 1e-9 && a() > 0.5 && a() < 0.75, `the veil lifts to ${a()}`);
  v.setWholeShare(1); assert.equal(a(), 1, 'a cava shown whole is whole');
  v.setWholeShare(0); assert.ok(Math.abs(a() - (0.4 + lift)) < 1e-9);
  v.setVeilLift(0); assert.equal(a(), 0.4);
  s.dispose?.();
});

test('cel shaded: every organ is OPAQUE and matte (alpha 1, normal blending, writes depth), its outline too: nothing reads as glass', async () => {
  const { NormalBlending, AlwaysDepth } = await import('three');
  const { patchedShaders } = await import('../src/scene/organs/organ-art.ts');
  const { s, organs: ol } = await organs();
  ol.applyLook(PALETTES.dark);
  ol.setFill('solid', true); ol.setDepth(true, true); ol.update(1000);
  assert.equal(ol.byId.size, ORGAN_ORDER.length);
  for (const [id, o] of ol.byId) {
    const u = o.toon.uniforms;
    assert.equal((u.solid!.value as number), 1, `${id}: solid`);
    assert.equal(u.fade!.value, 1, `${id}: not dissolving`);
    assert.ok((u.cut!.value as { z: number }).z < 0, `${id}: nothing cleared by the dive window at rest`);
    assert.equal(o.toon.blending, NormalBlending, `${id}: normal blending (no additive or premultiplied glow)`);
    assert.equal(o.toon.depthWrite, true, `${id}: the fill writes depth (an organ behind it is hidden by it)`);
    assert.equal(o.toon.depthTest, true);
    if (ORGAN_STYLE[id]!.layer !== 'gut') assert.equal(o.toon.depthFunc, AlwaysDepth, `${id}: painted flat in 2D's order`);
    assert.equal(o.ink.blending, NormalBlending, `${id}: the outline is plain ink`);
    assert.equal(o.ink.uniforms.inkA!.value, 1, `${id}: whole ink alpha`);
    assert.equal(o.toon.opacity, 1, `${id}: opacity 1`);
  }
  // the shader's alpha is 1 at solid 1 (the layer's opacity is mixed out), whatever the look's layer; no fresnel, specular or rim term anywhere in the fragment shader's cel path
  assert.match(ORGAN_FS, /float a = mix\(layer, 1\.0, solid\);/);
  assert.match(ORGAN_FS, /gl_FragColor = vec4\(fill, a \* fade \* win\);/);
  // the art wrapper writes colour only, but for the esophagus's and the rectum's own fades (2D's esoFadeG, rectFadeG)
  const p = patchedShaders('void main() {}', ORGAN_FS, 'void main() {}', 'void main() {}', { art: true, eso: { poly: [0, 0], box: [0, 0, 1, 1], fade: [0, 1], seam: [0, 1] }, fade: true });
  const writes = p.fs.match(/gl_FragColor\.a[^\n]*/g) ?? [];
  assert.deepEqual(writes, ['gl_FragColor.a *= vEsoA;'], 'the only alpha the art writes is the two fades');
  s.dispose?.();
});

test('cel shaded: the crescents read on the real meshes: each organ\'s share of shade and lit from its smooth rest normal (front-facing vertices, printed per organ)', async () => {
  const { celBand } = await import('../src/scene/cel-style.ts');
  const { s, organs: ol } = await organs();
  const l = Math.hypot(...O.LIGHT), N = O.LIGHT.map((v) => v / l) as unknown as [number, number, number];
  const rows: string[] = [];
  for (const [id, o] of ol.byId) {
    const at = o.toonMesh.geometry.getAttribute('celNormal'), pos = o.toonMesh.geometry.getAttribute('position');
    let n = 0, sh = 0, li = 0;
    for (let i = 0; i < at.count; i++) {
      if (at.getZ(i) <= 0.05) continue;   // (the back of the pillow is never seen)
      n++;
      const b = celBand(at.getX(i) * N[0] + at.getY(i) * N[1] + at.getZ(i) * N[2], 0, O.SHADE_LAM, O.LIT_LAM);
      if (b === 0) sh++; else if (b === 2) li++;
    }
    rows.push(`${id.padEnd(9)} shade ${(100 * sh / Math.max(1, n)).toFixed(0)}%  lit ${(100 * li / Math.max(1, n)).toFixed(0)}%  (${n} of ${pos.count} vertices face the eye)`);
    assert.ok(n > 0 && sh / n < 0.7 && li / n < 0.4, `${id}: the crescents do not swallow it (shade ${(sh / n).toFixed(2)}, lit ${(li / n).toFixed(2)})`);
    if (['liver', 'stomach', 'spleen', 'heart'].includes(id)) assert.ok(sh / n >= 0.12 && li / n >= 0.1, `${id}: both crescents big enough to read (shade ${(sh / n).toFixed(2)}, lit ${(li / n).toFixed(2)})`);
  }
  console.log(`crescent shares per organ:\n  ${rows.join('\n  ')}`);
  s.dispose?.();
});
