// Every organ shows its OUTSIDE (Mohammad 26 Nov: "are we seeing the outside of the organs or the inside? it seems like we're seeing the inside surface of the liver"). The fill is drawn front faces only
// (FrontSide: a triangle counts as front when it winds counter-clockwise on the screen), so the outer surface is what is drawn only while every organ's triangles wind outward. A mesh wound inside out would cull
// its near wall and draw the far wall's inner face: the look he described. These tests pin the rule for every organ, as the page gets it (the finished organs, through the baked file's round trip) and as
// the build makes them: the winding encloses a positive volume, the surface the eye meets first from the front faces the eye (and from behind faces away), the three normals the shader reads agree with the
// winding, and the fill culls back faces while the outline hull culls front ones.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BackSide, BoxGeometry, FrontSide, type BufferGeometry } from 'three';

const { setOrganData, ORGAN_MESHES, ORGAN_IDS } = await import('../src/scene/organs/meshes.ts');
const f = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
setOrganData(f.buffer.slice(f.byteOffset, f.byteOffset + f.byteLength) as ArrayBuffer);
const { caudateGeometry } = await import('../src/scene/organs/caudate.ts');
const { prepareOrgans } = await import('../src/scene/organs/prepare.ts');
const { encodeOrgans, decodeOrgans, RAW_IDS } = await import('../src/scene/organs/baked.ts');
const { OrganLayer, ORGAN_STYLE } = await import('../src/scene/organs/layer.ts');
const { createShared } = await import('../src/scene/materials/cel.ts');

const live = prepareOrgans({ ...ORGAN_MESHES, caudate: caudateGeometry });
const bytes = encodeOrgans(live, 'outward', RAW_IDS.map((id) => [id, ORGAN_MESHES[id]!()]));
const baked = decodeOrgans(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer)!.organs;
const SETS: [string, [string, BufferGeometry][]][] = [['built', live], ['baked', baked]];

/** The volume the triangles enclose, by their winding (positive: wound outward, counter-clockwise seen from outside). */
function signedVolume(g: BufferGeometry): number {
  const p = g.getAttribute('position').array, ix = g.index!.array;
  let v = 0;
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t]! * 3, b = ix[t + 1]! * 3, c = ix[t + 2]! * 3;
    v += p[a]! * (p[b + 1]! * p[c + 2]! - p[b + 2]! * p[c + 1]!) - p[a + 1]! * (p[b]! * p[c + 2]! - p[b + 2]! * p[c]!) + p[a + 2]! * (p[b]! * p[c + 1]! - p[b + 1]! * p[c]!);
  }
  return v / 6;
}

/** A small depth buffer over the organ's box, from the front (+z, the eye at rest) or from behind: at each cell, whether the triangle met first winds toward the eye (its winding normal's z has the eye's sign).
 *  Returns the share of covered cells (weighted by how squarely the triangle faces the eye) where it does. This is what FrontSide culling sees. */
function facesTheEye(g: BufferGeometry, eye: 1 | -1, N = 72): number {
  g.computeBoundingBox();
  const bb = g.boundingBox!, p = g.getAttribute('position').array, ix = g.index!.array;
  const sx = (bb.max.x - bb.min.x) / N, sy = (bb.max.y - bb.min.y) / N;
  const depth = new Float64Array(N * N).fill(-Infinity), nz = new Float64Array(N * N);
  for (let t = 0; t < ix.length; t += 3) {
    const a = ix[t]! * 3, b = ix[t + 1]! * 3, c = ix[t + 2]! * 3;
    const ax = p[a]!, ay = p[a + 1]!, az = p[a + 2]!, bx = p[b]!, by = p[b + 1]!, bz = p[b + 2]!, cx = p[c]!, cy = p[c + 1]!, cz = p[c + 2]!;
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, z = ux * vy - uy * vx, len = Math.hypot(nx, ny, z);
    if (Math.abs(z) < 1e-14) continue;   // (edge-on to the eye: it covers no cell)
    const i0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - bb.min.x) / sx)), i1 = Math.min(N - 1, Math.floor((Math.max(ax, bx, cx) - bb.min.x) / sx));
    const j0 = Math.max(0, Math.floor((Math.min(ay, by, cy) - bb.min.y) / sy)), j1 = Math.min(N - 1, Math.floor((Math.max(ay, by, cy) - bb.min.y) / sy));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const px = bb.min.x + (i + 0.5) * sx, py = bb.min.y + (j + 0.5) * sy;
      // barycentric in the xy plane (the eye looks along z)
      const w1 = ((px - ax) * vy - (py - ay) * vx) / z, w2 = ((py - ay) * ux - (px - ax) * uy) / z;
      if (w1 < 0 || w2 < 0 || w1 + w2 > 1) continue;
      const d = (az + w1 * uz + w2 * vz) * eye, k = j * N + i;
      if (d > depth[k]!) { depth[k] = d; nz[k] = z / len; }
    }
  }
  let good = 0, all = 0;
  for (let k = 0; k < N * N; k++) if (depth[k]! > -Infinity) { const w = Math.abs(nz[k]!); all += w; if (nz[k]! * eye > 0) good += w; }
  return good / all;
}

for (const [set, organs] of SETS) {
  test(`${set} organs: every organ is wound outward (encloses a positive volume) and is all here`, () => {
    assert.deepEqual(organs.map(([id]) => id).sort(), [...ORGAN_IDS, 'caudate'].sort());
    for (const [id, g] of organs) assert.ok(signedVolume(g) > 0, `${id} is wound inside out (volume ${signedVolume(g)})`);
  });
  test(`${set} organs: the surface the eye meets first faces the eye, from the front and from behind`, () => {
    for (const [id, g] of organs) {
      const front = facesTheEye(g, 1), back = facesTheEye(g, -1);
      // (a tube's folds and the stomach's fundus tuck under themselves: a sliver of cells meets a fold's edge first; 0.97 leaves room for it and none for a flipped organ, which reads near 0)
      assert.ok(front > 0.97, `${id} from the front: ${(front * 100).toFixed(1)}% of what the eye meets faces it`);
      assert.ok(back > 0.97, `${id} from behind: ${(back * 100).toFixed(1)}% of what the eye meets faces it`);
    }
  });
  test(`${set} organs: the surface, shade and outline normals all point the way the triangles wind`, () => {
    for (const [id, g] of organs) {
      const n = g.getAttribute('normal').array;
      const wound = g.clone(); wound.deleteAttribute('normal'); wound.computeVertexNormals();
      const w = wound.getAttribute('normal').array;
      for (const k of ['normal', 'shadeN', 'hullN']) {
        const a = k === 'normal' ? n : g.getAttribute(k).array;
        let agree = 0;
        for (let i = 0; i < w.length; i += 3) if (a[i]! * w[i]! + a[i + 1]! * w[i + 1]! + a[i + 2]! * w[i + 2]! > 0) agree++;
        assert.ok(agree / (w.length / 3) > 0.99, `${id} ${k}: ${((agree / (w.length / 3)) * 100).toFixed(1)}% of vertices point outward`);
      }
    }
  });
}

test('every organ fill draws front faces only and its outline hull back faces only (with outward winding: the outer surface, and the line round it)', () => {
  const layer = new OrganLayer(createShared(), Object.fromEntries(Object.keys(ORGAN_STYLE).map((id) => [id, () => new BoxGeometry(0.4, 0.3, 0.1)])));
  assert.ok(layer.byId.size >= ORGAN_IDS.length);
  for (const [id, o] of layer.byId) {
    assert.equal(o.toon.side, FrontSide, `${id} fill`);
    assert.equal(o.ink.side, BackSide, `${id} outline`);
  }
});
