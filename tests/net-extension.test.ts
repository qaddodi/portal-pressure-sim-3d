// N1 of the Opus review of the net mesh (WP3, 22 Nov): an arm's extension (its tube from the seam ring to the node) lies ON the fillet's surface (outside the blend zone the union is the capsule), so it z-fought the fillet and doubled its ink hull.
// The extension vertices are tagged (net/regions.ts extensionRows: every bone of the vertex on one arm, strictly between the node and the arm's seam) and carry -2 - their node's region row; the vertex stage hides them while the node's fillet is whole and
// insets their radius below the fillet's surface while it dissolves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNetMesh } from '../src/scene/vessels/net/mesh.ts';
import { extensionRows, regionTexture, regionsOf } from '../src/scene/vessels/net/regions.ts';
import { EXT_INSET, NET_VS } from '../src/scene/vessels/net/shaders.ts';
import { TUBE_SAG } from '../src/scene/vessels/shaders.ts';
import { fixtures } from './net-lib.ts';

for (const fx of fixtures()) {
  const r = buildNetMesh(fx.skel), regions = regionsOf(fx.skel, r.nodes);
  if (!regions.length) continue;
  test(`${fx.name}: the extension vertices are tagged with their node's region, no fillet vertex is, and each lies between the node and its arm's seam`, () => {
    const m = r.mesh, ext = extensionRows(fx.skel, m, r.nodes), rep = r.nodes.filter((n) => n.kind === 'junction' && n.caps);
    const tagged: number[] = [];
    ext.forEach((row, v) => { if (row >= 0) tagged.push(v); });
    assert.ok(tagged.length > 0, 'a junction whose arms run on to the node has extension vertices');
    for (const v of tagged) {
      assert.ok(ext[v]! < regions.length);
      const rg = regions[ext[v]!]!;
      assert.ok(!(v >= rg.vertStart && v < rg.vertStart + rg.vertCount), 'a fillet vertex is not an extension');
    }
    // every tagged vertex is nearer the node than the seam ring of the arm it is on: no tube vertex from the seam outward is tagged
    for (const v of tagged) {
      const n = rep[ext[v]!]!;
      for (let j = 0; j < 4; j++) {
        if (!(m.weight[4 * v + j]! > 0)) continue;
        const b = m.bone[4 * v + j]!, e = fx.skel.bones[b]!.edge, i = n.arms.indexOf(e);
        assert.ok(i >= 0, 'the bone is on an arm of its node');
        const [f, c] = fx.skel.edges[e]!.bones, p0 = n.caps![i]!.pts, d0 = Math.hypot(...[0, 1, 2].map((q) => fx.skel.bones[f]!.pos[0][q]! - p0[q]!)), d1 = Math.hypot(...[0, 1, 2].map((q) => fx.skel.bones[f + c - 1]!.pos[0][q]! - p0[q]!));
        const d = d0 <= d1 ? b - f : f + c - 1 - b;
        assert.ok(d < n.seams[i]!, `bone ${d} from the node, seam at ${n.seams[i]}`);
      }
    }
    const t = regionTexture(regions, m.position.length / 3, undefined, ext);
    for (const v of tagged) assert.equal(t.vertexRegion[v], -2 - ext[v]!);
    const free = new Set<number>(); regions.forEach((rg, ri) => { for (let v = rg.vertStart; v < rg.vertStart + rg.vertCount; v++) { free.add(v); assert.equal(t.vertexRegion[v], ri); } });
  });
}

test('the extension is inset below the fillet by more than the flats\' sag (0.05 R), the ring corners\' (TUBE_SAG) and a depth margin; the vertex stage hides it at share >= 1 and insets it by the share otherwise', () => {
  assert.ok(EXT_INSET <= 1 - (0.05 + TUBE_SAG + 0.02), `${EXT_INSET}`);
  assert.match(NET_VS, /if \(region < -1\.5\) \{/);
  assert.match(NET_VS, /if \(esh >= 0\.999\) vOff = 1\.0;/, 'hidden by the discard, never moved: its triangles at the seam ring share vertices with the fillet\'s');
  assert.ok(!/gl_Position = vec4\(2\.0, 2\.0, 2\.0, 1\.0\); return;/.test(NET_VS), 'no vertex is moved off the screen alone: a triangle at a seam ring would stretch to it');
  assert.ok(NET_VS.includes(`extF = mix(1.0, ${EXT_INSET}, esh);`));
  assert.match(NET_VS, /float sc = region > -0\.5 \? b\.lumenRest : b\.lumen \* extF;/);
  assert.match(NET_VS, /int pr = int\(texelFetch\(regionTex, ivec2\(4, er\), 0\)\.z \+ 0\.5\) - 1;/, 'the node\'s other fillet (map) adds its share');
});
