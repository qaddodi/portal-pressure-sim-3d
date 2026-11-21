// The sinusoid's shape follows the state on the GPU (micro3d/sinusoid-shape.ts): the vertex shader's move from the rest shape equals a full CPU rebuild at the same state, and easing the lumen, the pinch or the
// collagen remeshes nothing (Ascites stop 9: each 1/64 step remeshed about 830k triangles inside one frame).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createShared } from '../src/scene/materials/cel.ts';
import { SinusoidView } from '../src/scene/sinusoid/view.ts';
import { Sinusoid3D } from '../src/scene/micro3d/sinusoid3d.ts';
import { deltaD, deltaH, restDisseW, restHalfW } from '../src/scene/micro3d/sinusoid-shape.ts';
import { SHAPE_VS_APPLY } from '../src/scene/micro3d/sinusoid-shape.ts';
import { MICRO_INK_VS, MICRO_VS } from '../src/scene/micro3d/cel3d.ts';

type Priv = { buildShape(): void; shapedParts(): { geometry: import('three').BufferGeometry; toonMesh: { name: string } }[]; prepareShapeStep(): boolean; shapeReady: boolean };
function scene() {
  const shared = createShared(), flat = new SinusoidView(shared, { look: 'light' }), s3 = new Sinusoid3D(flat, shared);
  flat.group.add(s3.group); flat.setVisible(true); flat.update(1000); flat.update(1016);
  return { flat, s3, p: s3 as unknown as Priv };
}

test('the host\'s lumen and Disse widths are the rest\'s plus the shader\'s deltas, at any state', () => {
  const { flat } = scene();
  const cur = flat.cur as unknown as Record<string, number>, xs = (flat as unknown as { geo: { xs: number } }).geo.xs;
  for (const [lum, pinch, col] of [[1, 0, 0], [0.6, 0.1, 0.7], [1.9, 0.3, 1], [1.3, 0.22, 0.2]] as const) {
    cur.lum = lum; cur.pinch = pinch; cur.col = col;
    for (let x = -120; x <= 120; x += 7.3) {
      assert.ok(Math.abs(flat.g.halfW(x) - (restHalfW(x) + deltaH(x, { lum, pinch }, xs))) < 1e-9, `halfW at ${x}`);
      assert.ok(Math.abs(flat.g.disseW(x) - (restDisseW(x) + deltaD({ col }))) < 1e-9, `disseW at ${x}`);
    }
  }
});

test('the GPU move equals a full rebuild at the same state, across the range the app reaches (the lumen up to 1.7 within 0.1 µm, under a pixel at the closest zoom; a very congested 1.9, 0.2 µm)', () => {
  const { flat, s3, p } = scene();
  s3.update(true);   // (prepares the shapes at rest)
  assert.ok(p.shapeReady);
  const parts = p.shapedParts(), xs = (flat as unknown as { geo: { xs: number } }).geo.xs;
  const base = parts.map((q) => ({
    P: Float32Array.from(q.geometry.getAttribute('position').array as Float32Array), H: Float32Array.from(q.geometry.getAttribute('dH').array as Float32Array),
    D: Float32Array.from(q.geometry.getAttribute('dD').array as Float32Array), AX: q.geometry.getAttribute('ax') ? Float32Array.from(q.geometry.getAttribute('ax').array as Float32Array) : null, H2: q.geometry.getAttribute('dH2') ? Float32Array.from(q.geometry.getAttribute('dH2').array as Float32Array) : null, H3: q.geometry.getAttribute('dH3') ? Float32Array.from(q.geometry.getAttribute('dH3').array as Float32Array) : null, H4: q.geometry.getAttribute('dH4') ? Float32Array.from(q.geometry.getAttribute('dH4').array as Float32Array) : null, H5: q.geometry.getAttribute('dH5') ? Float32Array.from(q.geometry.getAttribute('dH5').array as Float32Array) : null,
  }));
  const cur = flat.cur as unknown as Record<string, number>;
  let worst = 0, worstPart = '';
  for (const [lum, pinch, col] of [[0.7, 0, 0], [1.7, 0.3, 0], [1.4, 0.22, 1], [0.6, 0.3, 0.5], [1.2, 0.1, 0.3], [1.0, 0.0, 1.0], [1.9, 0.1, 0]] as const) {
    cur.lum = lum; cur.pinch = pinch; cur.col = col;
    p.buildShape();   // (the host's own functions, at this state: the truth)
    parts.forEach((q, i) => {
      const truth = q.geometry.getAttribute('position').array as Float32Array, b = base[i]!;
      assert.equal(truth.length, b.P.length, `${q.toonMesh.name} keeps its vertex count`);
      let m = 0;
      for (let k = 0; k < truth.length; k += 3) {
        const dh = deltaH(b.AX ? b.AX[k / 3]! : b.P[k]!, { lum, pinch }, xs), dd = deltaD({ col });
        for (let c = 0; c < 3; c++) {
          const v = b.P[k + c]! + b.H[k + c]! * dh + b.D[k + c]! * dd + (b.H2 ? b.H2[k + c]! * dh * dh + b.H3![k + c]! * dh ** 3 + b.H4![k + c]! * dh ** 4 + b.H5![k + c]! * dh ** 5 : 0);
          m = Math.max(m, Math.abs(v - truth[k + c]!));
        }
      }
      if (m > worst) { worst = m; worstPart = q.toonMesh.name; }
      // (the hepatocytes' outlines are rounded (chaikin) from points 4 µm apart, so near the pinch the move of a vertex is an average of two heights that one anchor approximates: a third of a micrometre there, one vertex in a hundred, at the strongest pinch)
      const tol = q.toonMesh.name.endsWith('hepatocytes') ? 0.7 : lum > 1.8 ? 0.2 : q.toonMesh.name.endsWith('endothelium') ? 0.15 : 0.1;
      assert.ok(m < tol, `${q.toonMesh.name} at lum ${lum} pinch ${pinch} col ${col}: the shader's move is ${m.toFixed(3)} µm from a rebuild`);
    });
  }
  console.log(`worst shader-vs-rebuild error ${worst.toFixed(4)} µm (${worstPart})`);
});

test('easing the lumen, the pinch or the collagen rebuilds no shape; only the small tail follows', () => {
  const { flat, s3, p } = scene();
  s3.update(true);
  let shapes = 0, tails = 0;
  const bs = p.buildShape.bind(s3), bt = (s3 as unknown as { buildTail(): void }).buildTail.bind(s3);
  p.buildShape = () => { shapes++; bs(); }; (s3 as unknown as { buildTail(): void }).buildTail = () => { tails++; bt(); };
  const cur = flat.cur as unknown as Record<string, number>;
  for (let i = 0; i <= 64; i++) { cur.lum = 1 + i / 100; cur.pinch = i / 300; cur.col = i / 64; s3.update(true); }
  assert.equal(shapes, 0, 'no triangle of the shapes is rebuilt');
  assert.ok(tails > 0);
});

test('both vertex shaders move the shaped parts from the same four numbers', () => {
  for (const vs of [MICRO_VS, MICRO_INK_VS]) { assert.ok(vs.includes(SHAPE_VS_APPLY.trim().split('\n')[0]!) && vs.includes('attribute vec3 dH;'), 'declared and applied'); }
  assert.match(SHAPE_VS_APPLY, /uShape\.x \* \(1\.0 - uShape\.y \* exp\(-gx \* gx\)\) - 1\.0/);
});
