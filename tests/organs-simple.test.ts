import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
import { ORGAN_IDS, ORGAN_MESHES, setOrganData } from '../src/scene/organs/meshes.ts';

// The organs are the 2D outlines with depth: every id the scene asks for, in the shared frame, front faces behind the vessels' tiers (z <= 0.26).
test('organ file parses into every organ, in frame, behind the vessels', () => {
  const b = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
  setOrganData(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  for (const id of ['heart', 'heart-ra', 'liver', 'spleen', 'stomach', 'kidney-l', 'duodenum', 'bowel', 'colon']) assert.ok(ORGAN_IDS.includes(id), id);
  for (const id of ORGAN_IDS) {
    const g = ORGAN_MESHES[id](); g.computeBoundingBox(); const bb = g.boundingBox!;
    assert.ok(bb.max.z <= 0.2601, `${id} front z ${bb.max.z}`);
    assert.ok(bb.min.x > -1.5 && bb.max.x < 1.5 && bb.max.y < 2.5 && bb.min.y > -2.2, `${id} in frame`);
  }
  const liver = ORGAN_MESHES.liver(); assert.ok(liver.attributes.position.count >= 3000);
});
test('organ data stays out of the bundle and small', () => {
  assert.ok(statSync(new URL('../public/anatomy/organs.bin', import.meta.url)).size < 1.6e6);
});
