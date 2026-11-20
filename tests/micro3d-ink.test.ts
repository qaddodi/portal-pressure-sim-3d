// The cells' outline (the micro ink hull) is one unbroken line: it is drawn on both sides, a hair behind its shape (so its faces toward the viewer never show), and swells with the shape, so no
// triangle of a thin rim the screen-space push turned over is culled into a gap (Mohammad 20 Nov: "the RBC outline is interrupted", twice).
import test from 'node:test';
import assert from 'node:assert/strict';
import { DoubleSide, Vector2 } from 'three';
import { INK_BACK, MICRO_INK_FS, MICRO_INK_VS, microMaterials } from '../src/scene/micro3d/cel3d.ts';

test('the micro ink hull is double-sided, sits just behind its shape, keeps every fragment and follows the shape\'s inflate', () => {
  const m = microMaterials({ value: new Vector2(1, 1) }, { value: 1 });
  assert.equal(m.ink!.side, DoubleSide);
  assert.ok(INK_BACK > 0 && INK_BACK < 0.005);
  assert.match(MICRO_INK_VS, /mv\.xyz \*= 1\.0 \+ /);
  assert.doesNotMatch(MICRO_INK_FS, /vFace/, 'no cull by the normal (it dropped the hull at every rim vertex: a dotted outline)');
  assert.match(MICRO_INK_VS, /p \+= normal \* inflate;/);
  assert.match(MICRO_INK_VS, /float back = [^;]*smoothstep\(0\.05, 0\.35, dot\(vn,/, 'only the faces toward the viewer go back: the rim keeps its depth, so a surface just behind never sinks the line');
  assert.equal(m.ink!.uniforms.inflate, m.toon.uniforms.inflate, 'one inflate for the shape and its line');
});

test('the ink never z-fights its shape, is thick enough to read and near black (Mohammad 20 Nov: the red cell outline "most certainly NOT continuous")', async () => {
  const { microMaterials, hazeUniforms } = await import('../src/scene/micro3d/cel3d.ts');
  const { CEL_STYLE } = await import('../src/scene/cel-style.ts');
  const { Vector2 } = await import('three');
  const m = microMaterials({ value: new Vector2(1, 1) }, { value: 1 } as never, { haze: hazeUniforms() } as never);
  assert.equal(m.toon.polygonOffset, false, 'no shape is offset (a slope offset sank other lines and specked faces, eyes 20 Nov)');
  const r = microMaterials({ value: new Vector2(1, 1) }, { value: 1 } as never, { haze: hazeUniforms(), ink: null, rim: 1.5 } as never);
  assert.equal(r.ink, null, 'a small solid shape has no hull');
  assert.equal(r.toon.uniforms.uRim!.value, 1.5, 'its line is drawn in its fill');
  const { MICRO_FS } = await import('../src/scene/micro3d/cel3d.ts');
  assert.match(MICRO_FS, /dpx = nv \/ max\(length\(vec2\(dFdx\(nv\), dFdy\(nv\)\)\)/, 'measured in screen pixels from the outline, the same on a diagonal as on an axis (not fwidth)');
  assert.match(MICRO_INK_FS, /uHole > 0\.0 && length\(vXY\) < uHole\) discard/, 'the ink is cut by the same hole as its shape');
  assert.equal(m.ink!.uniforms.uHole, m.toon.uniforms.uHole, 'one hole for the shape and its line');
  assert.ok(CEL_STYLE.MICRO.LINE >= 1.25 && CEL_STYLE.MICRO.LINE <= 2 && CEL_STYLE.MICRO.LINE_SMALL <= 1, 'a confident line round big bodies, a hairline round fine things (Mohammad 20 Nov: "too much")');
  assert.ok(CEL_STYLE.MICRO.INK_K <= 0.3, 'the ink is dark');
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/scene/micro3d/sinusoid3d.ts', import.meta.url), 'utf8');
  for (const part of ['rbc', 'nuclei', 'hsc', 'albumin', 'bile']) assert.match(src, new RegExp(`this\\.${part}\\.setInk\\(inkOf\\(`), `${part} uses the one near-black ink rule`);
});

test('no micro line is thinner than MIN_LINE, and the lobule tiles\' walls stand clear of the ground (eyes 20 Nov: dotted hepatocytes, stippled nucleus rings)', async () => {
  const { MIN_LINE, microMaterials: mm, hazeUniforms: hu } = await import('../src/scene/micro3d/cel3d.ts');
  const { LZ } = await import('../src/scene/micro3d/lobule3d.ts');
  assert.ok(MIN_LINE >= 1);
  const thin = mm({ value: new Vector2(1, 1) }, { value: 1 } as never, { haze: hu(), px: 0.3 } as never);
  assert.equal(thin.ink!.uniforms.px!.value, MIN_LINE, 'a part asking for a hairline gets the least line that draws whole');
  assert.ok(LZ.cellBot > LZ.ground, 'the tile\'s wall ends over the ground, so its line never dips under it');
});

test('a vessel\'s round ends carry no flow marks (the black squares at the RHF lobule\'s kinks)', async () => {
  const { flowAux } = await import('../src/scene/micro3d/lobule3d.ts');
  const { MeshBuilder, tube } = await import('../src/scene/micro3d/cel3d.ts');
  const b = new MeshBuilder(), pts: [number, number, number][] = [[0, 0, 0], [1, 0, 0], [2, 0.3, 0]];
  tube(b, pts, () => 0.1, [1, 1, 1], 8, true);
  const ring = 3 * 8, cap = (b.count - ring) / 2;
  flowAux(b, 0, pts, ring, cap, 0, null, 8);
  for (let v = ring; v < ring + 2 * cap; v++) assert.equal(b.aux2[v], 3, 'hushed');
});

test('a flat lens with a line in its fill has its rings even seen from above, so its outline falls off over a whole band, never a one-pixel sliver (eyes 20 Nov: the nucleus ring about 1 device px, uneven)', async () => {
  const { ellipsoidRingAngle } = await import('../src/scene/micro3d/cel3d.ts');
  for (const rings of [6, 10, 12]) {
    const rho = Array.from({ length: rings + 1 }, (_, r) => Math.sin(ellipsoidRingAngle(r, rings)));
    assert.ok(Math.abs(ellipsoidRingAngle(0, rings)) < 1e-9 && Math.abs(ellipsoidRingAngle(rings, rings) - Math.PI) < 1e-9 && Math.abs(ellipsoidRingAngle(rings / 2, rings) - Math.PI / 2) < 1e-9);
    for (let r = 1; r <= rings / 2; r++) assert.ok(Math.abs(rho[r]! - rho[r - 1]! - 2 / rings) < 1e-9, `band ${r} of ${rings} as wide as the rest`);
  }
  const src = (await import('node:fs')).readFileSync(new URL('../src/scene/micro3d/sinusoid3d.ts', import.meta.url), 'utf8');
  assert.match(src, /ellipsoid\(nuc,[^;]*, true\);/, 'the hepatocyte nuclei');
  assert.match(src, /ellipsoid\(bile,[^;]*, true\);/, 'the canaliculi');
});

test('a flat shape on the plate measures its line against the plate\'s up, so its ring is as thick on every side wherever the eye stands (eyes 20 Nov: the nucleus ring 3 px on one side, 6-7 on the other)', async () => {
  const { MICRO_FS } = await import('../src/scene/micro3d/cel3d.ts');
  assert.match(MICRO_FS, /shadeT \* \(1\.0 - uRimUp\)/, 'one tone');
  assert.match(MICRO_FS, /uRimUp > 0\.5 \? vec3\(0\.0, 0\.0, 1\.0\) : normalize\(vVD\)/);
  const src = (await import('node:fs')).readFileSync(new URL('../src/scene/micro3d/sinusoid3d.ts', import.meta.url), 'utf8');
  for (const name of ['nuclei', 'canaliculi', 'endothelial-cells', 'stellate']) assert.match(src, new RegExp(`mk\\('${name}', \\{[^}]*rimUp: true`), name);
});
