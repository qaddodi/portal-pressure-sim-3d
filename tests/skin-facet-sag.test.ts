// Mohammad, 20 Nov: "wobbly, jagged silhouettes with ink barbs" on the welded skins. Root cause (skin/facet-sag.ts): the skin's long facets sagged inside the ink band, because only the ring's TUBE_SAG was
// allowed for. Every vertex now stands out for the sag of its longest edge; a seam ring keeps the tube's own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Group, type Object3D } from 'three';
import { CelScene } from '../src/scene/scene.ts';
import { setSmoothJoins } from '../src/scene/vessels/join-mode.ts';
import { SkinSet } from '../src/scene/vessels/skin/skin-set.ts';
import { SkinObject } from '../src/scene/vessels/skin/skin-object.ts';
import { facetSag, SAG_MAX } from '../src/scene/vessels/skin/facet-sag.ts';
import { SKIN_VS } from '../src/scene/vessels/skin/shaders.ts';
import { TUBE_SAG } from '../src/scene/vessels/shaders.ts';

test('facetSag: a chord of length e on radius R sags e^2/8R; a seam ring keeps the tube\'s TUBE_SAG; never past SAG_MAX', () => {
  // two triangles: vertex 0 and 1 on a ring (short edge), vertex 2 far away (long edge 1.0 R)
  const pos = [0, 0, 0, 0.2, 0, 0, 1.0, 0, 0], R = [1, 1, 1];
  const s = facetSag(pos, [0, 1, 2], R, [0, 1]);
  assert.ok(Math.abs(s[0]! - TUBE_SAG) < 1e-6);
  assert.ok(Math.abs(s[1]! - TUBE_SAG) < 1e-6);
  assert.ok(s[2]! > TUBE_SAG * 2 && s[2]! <= SAG_MAX + 1e-6, `a long facet stands out more: ${s[2]}`);
  const huge = facetSag([0, 0, 0, 50, 0, 0, 0, 50, 0], [0, 1, 2], [1, 1, 1], []);
  assert.ok(Math.abs(huge[0]! - SAG_MAX) < 1e-6);
});

test('every skin: ring vertices keep TUBE_SAG, the rest stand out for their longest facet, and the vertex stage reads it', () => {
  setSmoothJoins(true);
  const scene = new CelScene({ joins: 'old' });
  const meshes: Array<{ node: string; sag: Float32Array; ring: Set<number> }> = [];
  const set = new SkinSet({
    vessel: (id) => scene.vesselObject(id), stateOf: () => undefined,
    make: (mesh, axes, arms) => {
      const d = new SkinObject(mesh, arms[0]!, axes, arms);
      meshes.push({ node: mesh.junction.node, sag: d.mesh.geometry.getAttribute('sagK').array as Float32Array, ring: new Set(mesh.seamVerts.flatMap((a) => [...a])) });
      return d;
    },
    add: (o: Object3D) => new Group().add(o), remove: () => {}, warn: () => {},
  });
  set.build(2);
  assert.ok(meshes.length >= 9);
  for (const m of meshes) {
    let more = 0;
    m.sag.forEach((v, i) => {
      if (m.ring.has(i)) assert.ok(Math.abs(v - TUBE_SAG) < 1e-6, `${m.node}: ring vertex ${i}`);
      else { assert.ok(v >= TUBE_SAG - 1e-7 && v <= SAG_MAX + 1e-7, `${m.node}: ${v}`); if (v > TUBE_SAG * 1.2) more++; }
    });
    assert.ok(more > 0, `${m.node}: some interior facets are longer than a ring's`);
  }
  assert.match(SKIN_VS, /\(lumenW \+ inkW\) \* sagK\)/, 'the vertex stage uses the per-vertex sag');
  assert.match(SKIN_VS, /attribute float sagK;/);
});
