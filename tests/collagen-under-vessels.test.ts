// The fibrosis never covers a vessel (Mohammad, 23 Nov 2026: "the fibrosis should not cover up the blood, bile or lymph vessels"): the collagen is part of the plate's marks mesh, which draws first of the see-through list and writes no depth,
// and every vessel (the blood, the lymph, the bile and the mouths of the tracts' own vessels, the pale disc behind the portal venule included) draws after it, so a vessel is always painted over the collagen, at every growth and during the dive.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Mesh, ShaderMaterial } from 'three';
import { createShared } from '../src/scene/materials/cel.ts';
import { LobuleView } from '../src/scene/lobule/view.ts';
import { Lobule3D } from '../src/scene/micro3d/lobule3d.ts';

const flat = new LobuleView(createShared()), l3 = new Lobule3D(flat, createShared());
l3.buildForTest('light');
let marks: Mesh | null = null;
l3.group.traverse((o) => { if (o.name === 'lobule3d/marks') marks = o as Mesh; });
const m = marks as unknown as Mesh;

test('the marks (tissue and every grown collagen) write no depth and are the first of the see-through parts', () => {
  assert.ok(m, 'the marks mesh exists');
  const mat = m.material as ShaderMaterial;
  assert.equal(mat.depthWrite, false, 'the collagen never hides a vessel by depth');
  assert.equal(mat.transparent, true);
});

test('every vessel part (blood, lymph, bile, the tract mouths) draws after the collagen', () => {
  const vessels = l3.partsForTest.filter((p) => !/ground|hepatocytes|nuclei|central-vein-scar/.test(p.toonMesh.name));
  assert.ok(vessels.length >= 10, `the vessel parts are found (${vessels.length})`);
  for (const p of vessels) for (const mesh of [p.toonMesh, p.inkMesh]) if (mesh) assert.ok(mesh.renderOrder > m.renderOrder, `${mesh.name} draws after the collagen`);
});
