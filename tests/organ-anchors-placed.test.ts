// A slide's card on an organ points at the organ where the approved placement draws it (figure-calls.ts organAnchor). Root cause pinned: the anchor was 2D's point read as if the organ had
// not moved, so the kidney's, the spleen's, the atrium's and the caudate lobe's cards stood beside their meshes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector3, type BufferGeometry } from 'three';
import { organAnchor } from '../src/ui/deck/figure-calls.ts';
import { anchorPoint } from '../src/scene/labels/figure-cards.ts';
import { ORGAN_ANCHOR_2D } from '../src/scene/labels/figure2d.copied.ts';
import { ORGAN_MESHES, setOrganData, organsReady } from '../src/scene/organs/meshes.ts';
import { caudateGeometry } from '../src/scene/organs/caudate.ts';

test('every organ card\'s anchor lies on its placed organ, seen from the front', async () => {
  const b = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
  setOrganData(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  await organsReady;
  const out = new Vector3(), meshes: Record<string, (() => BufferGeometry) | undefined> = { ...ORGAN_MESHES, caudate: caudateGeometry };
  let n = 0;
  for (const id of Object.keys(ORGAN_ANCHOR_2D)) {
    const mesh = meshes[id];
    if (!mesh) continue;   // (the esophagus, the grooves, the falciform, the ascites and the rest: no organ mesh of their own)
    const g = mesh(); g.computeBoundingBox();
    const bb = g.boundingBox!, p = anchorPoint(organAnchor(id), out)!;
    assert.ok(p.x >= bb.min.x && p.x <= bb.max.x && p.y >= bb.min.y && p.y <= bb.max.y, `${id}: the anchor (${p.x.toFixed(3)}, ${p.y.toFixed(3)}) is on the organ (x ${bb.min.x.toFixed(3)}..${bb.max.x.toFixed(3)}, y ${bb.min.y.toFixed(3)}..${bb.max.y.toFixed(3)})`);
    n++;
  }
  assert.ok(n >= 10, `${n} organs checked`);
});
