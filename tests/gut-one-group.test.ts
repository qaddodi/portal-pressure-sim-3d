// Mohammad 20 Nov: "why are the intestines overlapping SHINE brighter? ... it's ok everywhere else except the intestines".
// Root cause: 2D draws the gut (colon, small bowel) as ONE see-through group (stage.js `organ-gut`, --gut-a on the group), so the colon covers the loops under it and the pair is as see-through as either alone;
// the 3D organs are separate blended meshes, so the colon's alpha stacked on the bowel's wherever they cross. Each gut fill now marks the pixels it drew (stencil bit 2) and the next leaves them alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NotEqualStencilFunc, ReplaceStencilOp } from 'three';
import { organsReady, setOrganData } from '../src/scene/organs/meshes.ts';
import { CelScene } from '../src/scene/scene.ts';
import { GUT_GROUP, GUT_RENDER, ORGAN_ORDER } from '../src/scene/organs/layer.ts';
import { POOL_ORDER } from '../src/scene/disease/ascites.ts';

const file = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
setOrganData(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);

test('the gut draws as one group: the colon fill first, then the bowel fill, then the bowel line, then the colon line, all inside the organ layer', () => {
  const c = GUT_RENDER.colon!, b = GUT_RENDER.bowel!;
  assert.ok(c.fill < b.fill && b.fill < b.ink && b.ink < c.ink, 'fills (colon covering) before lines (colon over bowel)');
  assert.ok(c.fill > 2 * ORGAN_ORDER.indexOf('liver') + 1, 'after the liver, as the gut always was');
  assert.ok(c.ink < POOL_ORDER, 'the ascites pool still draws after every organ');
  assert.deepEqual([...GUT_GROUP].sort(), ['bowel', 'colon']);
});

test('only the colon and the bowel fills mark and test the gut stencil bit; no other organ, and no outline, does', async () => {
  await organsReady;
  const s = new CelScene();
  s.disease.organs.build();
  for (const [id, o] of s.disease.organs.byId) {
    const m = o.toon;
    if (GUT_GROUP.has(id)) {
      assert.ok(m.stencilWrite && m.stencilRef === 2 && m.stencilFuncMask === 2 && m.stencilWriteMask === 2, `${id}: bit 2 only`);
      assert.equal(m.stencilFunc, NotEqualStencilFunc); assert.equal(m.stencilZPass, ReplaceStencilOp);
      assert.equal(o.toonMesh.renderOrder, GUT_RENDER[id]!.fill, `${id}: fill order`);
      for (const ch of o.group.children) if (ch !== o.toonMesh) assert.equal(ch.renderOrder, GUT_RENDER[id]!.ink, `${id}: line order`);
    } else assert.ok(!m.stencilWrite, `${id}: its look and transparency are untouched`);
    assert.ok(!o.ink.stencilWrite, `${id}: the outline never writes the stencil`);
  }
  s.dispose?.();
});

test('the gut stencil is cleared with the depth each frame and is not the vessels\' bit', () => {
  const scene = readFileSync(new URL('../src/scene/scene.ts', import.meta.url), 'utf8');
  assert.match(scene, /gl\.clearDepth\(\); gl\.clearStencil\(\)/);
  assert.match(readFileSync(new URL('../src/scene/materials/cel.ts', import.meta.url), 'utf8'), /stencilRef = 1/);
});
