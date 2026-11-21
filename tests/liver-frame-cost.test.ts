// Root cause of the iPhone audit's 90 to 690 ms frames when a scarred liver eases or first shows (21 Nov): the shape redid a height field per vertex every frame, and the surface texture was baked (0.7 s) inside the first scarred frame.
// Both depend on the vertex's REST place only, so they are made once, in idle slices (LiverShape.warm, LiverBake.step); a frame is arithmetic. These pin that the sliced results equal the direct ones.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BufferAttribute, BufferGeometry } from 'three';
import manifest from '../src/scene/organs/organs-manifest.json' with { type: 'json' };
import { LiverShape, NODULE_HEIGHT, RIM_HEIGHT, edgeFree } from '../src/scene/organs/liver-shape.ts';
import { LiverBake, bake, noduleBumpAt, rimDomeAt, rimScale } from '../src/scene/organs/liver-texture.ts';
import { liverField, liverSurface } from '../src/scene/disease/copied/liver-morph.js';
import { x2d, x3, y2d, y3 } from '../src/scene/frame2d.ts';

function liver() {
  const b = readFileSync('public/anatomy/organs.bin'), buf = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
  const M = manifest as unknown as { q: number; organs: Record<string, number[]> }, [po, nv, io, ib] = M.organs.liver!;
  const q = new Int16Array(buf, po!, nv! * 3), pos = new Float32Array(nv! * 3);
  for (let i = 0; i < pos.length; i++) pos[i] = q[i]! / M.q;
  const g = new BufferGeometry(); g.setAttribute('position', new BufferAttribute(pos, 3)); g.setIndex(new BufferAttribute(new Uint16Array(buf, io!, ib! / 2), 1)); g.computeVertexNormals();
  return { pos, n: Float32Array.from(g.getAttribute('normal').array as Float32Array) };
}

test('the liver shape from the kept rest-place numbers equals the per-vertex height field it replaced, and warm() in slices finishes the same', () => {
  const { pos, n } = liver(), arr = Float32Array.from(pos), rest = Float32Array.from(pos);
  const sh = new LiverShape({ array: arr, needsUpdate: false }, n);
  let slices = 0; while (!sh.warm(1)) slices++;
  assert.ok(slices > 0, 'the warm-up is sliced, not one block');
  for (const c of [0.35, 0.8]) {
    sh.apply(c);
    const nodS = liverSurface(c).nod, bump = nodS * NODULE_HEIGHT;
    for (let i = 0; i < rest.length; i += 3 * 211) {
      const x0 = rest[i]!, y0 = rest[i + 1]!, f = liverField(x2d(x0), y2d(y0), c);
      let x = x3(f[0]!), y = y3(f[1]!);
      const h = bump * noduleBumpAt(x2d(x0), y2d(y0)), k = edgeFree(Math.abs(n[i + 2]!));
      x += n[i]! * h * k; y += n[i + 1]! * h * k;
      const m = Math.hypot(n[i]!, n[i + 1]!);
      if (m > 1e-3) { const r = (1 - k) * RIM_HEIGHT * rimScale() * nodS * rimDomeAt(x2d(x0), y2d(y0)) / m; x += n[i]! * r; y += n[i + 1]! * r; }
      assert.ok(Math.abs(arr[i]! - x) < 1e-5 && Math.abs(arr[i + 1]! - y) < 1e-5 && Math.abs(arr[i + 2]! - (rest[i + 2]! + n[i + 2]! * h)) < 1e-5, `vertex ${i / 3} at c=${c}`);
    }
  }
});

test('the surface texture laid in slices is the texture laid at once', () => {
  const sliced = new LiverBake(); let steps = 0; while (!sliced.step(2)) steps++;
  assert.ok(steps > 5, 'the bake is sliced');
  assert.deepEqual(sliced.out, bake());
});
