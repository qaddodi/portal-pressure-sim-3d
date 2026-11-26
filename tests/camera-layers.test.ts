// "When I click on the tips, the whole figure is glowing" (owner, 26 Nov). ROOT CAUSE: the vessels' glow mask pass and the organ veil's map both used camera layer 3 (and the organs' glow mask and the veil's
// "behind" mask both used 4), so every organ's fill, which lives on the veil's layers, was drawn into the glow's mask as soon as any vessel was lit: a halo round every organ. One registry (layers.ts), all different.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import type { Object3D } from 'three';
import { organsReady, setOrganData } from '../src/scene/organs/meshes.ts';
import { CelScene } from '../src/scene/scene.ts';
import { CAMERA_LAYERS, GLOW_LAYER, ORGAN_GLOW_LAYER, ORGAN_MAP_LAYER, ORGAN_BACK_LAYER } from '../src/scene/layers.ts';
import { GLOW_LAYER as GLOW_LAYER_RE, ORGAN_GLOW_LAYER as ORGAN_GLOW_LAYER_RE } from '../src/scene/glow.ts';
import { FAINT_ONLY_LAYER } from '../src/scene/vessels/vessel-object.ts';

test('every named camera layer is a different number, not the default layer 0, and a valid three.js layer', () => {
  const nums = Object.values(CAMERA_LAYERS);
  assert.equal(new Set(nums).size, nums.length, `two passes share a layer: ${JSON.stringify(CAMERA_LAYERS)}`);
  for (const n of nums) assert.ok(Number.isInteger(n) && n >= 1 && n <= 31, `layer ${n}`);
  assert.equal(GLOW_LAYER_RE, GLOW_LAYER); assert.equal(ORGAN_GLOW_LAYER_RE, ORGAN_GLOW_LAYER); assert.equal(FAINT_ONLY_LAYER, CAMERA_LAYERS.FAINT_ONLY_LAYER);
});

test('in the built scene the vessels\' glow pass draws no organ, and the organs\' glow pass draws only glow masks', async () => {
  const b = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
  setOrganData(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  const s = new CelScene();
  s.resize(900, 700);
  await organsReady; await new Promise((r) => setTimeout(r, 0));
  s.goTo('title', { x: 0, y: 0, w: 900, h: 700 }, 0, 0);
  s.update(0); s.update(1000);
  s.scene.updateMatrixWorld(true);
  let organMeshes = 0, onMap = 0;
  for (const [id, o] of s.disease.organs.byId) {
    o.group.traverse((c: Object3D) => {
      organMeshes++;
      const isMask = c.name.startsWith('highlight/glow/');
      if (c.layers.isEnabled(ORGAN_MAP_LAYER) || c.layers.isEnabled(ORGAN_BACK_LAYER)) onMap++;
      assert.equal(c.layers.isEnabled(GLOW_LAYER), false, `${id}: ${c.name || c.type} is drawn into the vessels' glow mask (the whole figure glows)`);
      assert.equal(c.layers.isEnabled(ORGAN_GLOW_LAYER), isMask, `${id}: ${c.name || c.type} on the organs' glow layer only if it is a glow mask`);
    });
  }
  assert.ok(organMeshes > 0 && onMap > 0, 'the organs and the veil layers are really there, so the check above is not empty');
  s.dispose?.();
});
