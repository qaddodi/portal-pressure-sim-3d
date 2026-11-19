// The root cause of "the vessels are solid near-black ink" (owner's screenshots, 7a52016f): Batch.tube wound its triangles inside out, so the toon pass (front
// faces only) drew nothing and only the ink hull showed. Every triangle's geometric normal must point the way its vertices' normals do.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Vector3 } from 'three';
import { Batch } from '../src/scene/lobule/batch.ts';

function outward(g: ReturnType<Batch['build']>): { total: number; bad: number } {
  const p = g.getAttribute('position'), n = g.getAttribute('normal'), ix = g.getIndex()!;
  let bad = 0, total = 0;
  const a = new Vector3(), b = new Vector3(), c = new Vector3(), fn = new Vector3(), vn = new Vector3();
  for (let i = 0; i < ix.count; i += 3) {
    const i0 = ix.getX(i), i1 = ix.getX(i + 1), i2 = ix.getX(i + 2);
    a.fromBufferAttribute(p, i0); b.fromBufferAttribute(p, i1); c.fromBufferAttribute(p, i2);
    fn.crossVectors(b.clone().sub(a), c.clone().sub(a));
    if (fn.lengthSq() < 1e-18) continue;
    vn.fromBufferAttribute(n, i0).add(new Vector3().fromBufferAttribute(n, i1)).add(new Vector3().fromBufferAttribute(n, i2));
    total++;
    if (fn.dot(vn) <= 0) bad++;
  }
  return { total, bad };
}

test('a tube is wound outward (its front faces are the outside)', () => {
  const b = new Batch();
  b.tube([[0, 0, 0], [1, 0, 0], [2, 0.5, 0], [3, 0.5, 0.4]], { radius: 0.1, radial: 8 });
  const r = outward(b.build());
  assert.ok(r.total > 20);
  assert.equal(r.bad, 0);
});

test('the flat caps of an end-on vessel face away from it', () => {
  const b = new Batch();
  b.tube([[0, 0, -0.5], [0, 0, 0.5]], { radius: 0.2, radial: 12, capped: true });
  const r = outward(b.build());
  assert.equal(r.bad, 0);
});
