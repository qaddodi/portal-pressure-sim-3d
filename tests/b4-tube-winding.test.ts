// A tube's wall must face outward (counter-clockwise from outside): the cel toon pass draws front faces and the ink hull back faces, so a tube wound inward draws its far wall in colour and its
// near wall in ink: a black spindle (Mohammad's iPhone, 19 Nov: the varices, the bowel strands, the clots). Every tube made by ringTube is checked at every heading.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { ringTube } from '../src/scene/disease/tube.ts';

test('ringTube walls and caps face outward, whichever way the tube runs and however its radius swells', () => {
  for (const dir of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0.3, -0.9, 0], [0.6, 0.6, 0.5]]) {
    const pts = Array.from({ length: 12 }, (_, i) => new Vector3(dir[0]! * i * 0.1, dir[1]! * i * 0.1, 0.4 + dir[2]! * i * 0.1));
    const g = ringTube(pts, pts.map((_, i) => 0.01 + 0.03 * Math.sin((Math.PI * i) / 11)), 9, true);
    const P = g.getAttribute('position'), N = g.getAttribute('normal'), I = g.index!;
    let inward = 0;
    for (let t = 0; t < I.count; t += 3) {
      const [a, b, c] = [I.getX(t), I.getX(t + 1), I.getX(t + 2)];
      const A = new Vector3().fromBufferAttribute(P, a), B = new Vector3().fromBufferAttribute(P, b), C = new Vector3().fromBufferAttribute(P, c);
      const fn = B.clone().sub(A).cross(C.clone().sub(A));
      const vn = new Vector3().fromBufferAttribute(N, a).add(new Vector3().fromBufferAttribute(N, b)).add(new Vector3().fromBufferAttribute(N, c));
      if (fn.lengthSq() > 1e-12 && fn.dot(vn) <= 0) inward++;
    }
    assert.equal(inward, 0, `heading ${dir}: ${inward} triangles face inward`);
  }
});
