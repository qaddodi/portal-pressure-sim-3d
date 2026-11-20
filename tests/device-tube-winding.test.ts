// A device tube's wall must face outward (counter-clockwise seen from outside), like every other tube (b4-tube-winding): the toon pass draws front faces and the ink hull back faces, so a tube wound inward
// draws its far wall in colour and its near wall in ink, and you see the INSIDE of a hollow scope or catheter instead of a solid cylinder (Mohammad, 20 Nov 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { allocTube, makeRings, mergeTubes, writeRings } from '../src/scene/devices/tube-rings.ts';

const inwardCount = (g: ReturnType<typeof allocTube>): { inward: number; total: number } => {
  const P = g.getAttribute('position'), N = g.getAttribute('normal'), I = g.index!;
  let inward = 0, total = 0;
  for (let t = 0; t < I.count; t += 3) {
    const [a, b, c] = [I.getX(t), I.getX(t + 1), I.getX(t + 2)];
    const A = new Vector3().fromBufferAttribute(P, a), B = new Vector3().fromBufferAttribute(P, b), C = new Vector3().fromBufferAttribute(P, c);
    const fn = B.clone().sub(A).cross(C.clone().sub(A));
    const vn = new Vector3().fromBufferAttribute(N, a).add(new Vector3().fromBufferAttribute(N, b)).add(new Vector3().fromBufferAttribute(N, c));
    if (fn.lengthSq() > 1e-14) { total++; if (fn.dot(vn) <= 0) inward++; }
  }
  return { inward, total };
};
const run = (dir: number[]) => {
  const rings = makeRings(10);
  rings.forEach((r, i) => { r.c.set(dir[0]! * i * 0.1, dir[1]! * i * 0.1, 0.3 + dir[2]! * i * 0.1); r.t.set(dir[0]!, dir[1]!, dir[2]!); r.r = 0.02; });
  const g = allocTube(rings.length, 8); writeRings(g, rings, 8);
  return g;
};

test('allocTube walls face outward at every heading', () => {
  for (const dir of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0.3, -0.9, 0], [0.6, 0.6, 0.5], [0, 0, 1]]) {
    const { inward, total } = inwardCount(run(dir));
    assert.ok(total > 0);
    assert.equal(inward, 0, `heading ${dir}: ${inward} of ${total} triangles face inward`);
  }
});

test('a merged tube (a stent\'s wires) faces outward too', () => {
  const a = makeRings(6), b = makeRings(6);
  a.forEach((r, i) => { r.c.set(i * 0.1, 0, 0.3); r.t.set(1, 0, 0); r.r = 0.01; });
  b.forEach((r, i) => { r.c.set(0, i * 0.1, 0.3); r.t.set(0, 1, 0); r.r = 0.01; });
  const { inward } = inwardCount(mergeTubes([a, b], 6) as ReturnType<typeof allocTube>);
  assert.equal(inward, 0);
});
