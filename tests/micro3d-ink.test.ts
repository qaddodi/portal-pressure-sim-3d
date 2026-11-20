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
  const m = microMaterials({ value: new Vector2(1, 1) }, { value: 1 } as never, { haze: hazeUniforms(), floating: true } as never);
  assert.equal(m.toon.polygonOffset, true, 'a floating shape\'s fill is offset toward the eye, so it always wins over its own ink at one depth');
  assert.ok(m.toon.polygonOffsetFactor < 0 && m.toon.polygonOffsetUnits < 0);
  const ground = microMaterials({ value: new Vector2(1, 1) }, { value: 1 } as never, { haze: hazeUniforms() } as never);
  assert.equal(ground.toon.polygonOffset, false, 'a surface other lines lie on is never offset (it sank the nuclei\'s and the central vein\'s lines, eyes 20 Nov)');
  assert.match(MICRO_INK_FS, /uHole > 0\.0 && length\(vXY\) < uHole\) discard/, 'the ink is cut by the same hole as its shape');
  assert.equal(m.ink!.uniforms.uHole, m.toon.uniforms.uHole, 'one hole for the shape and its line');
  assert.ok(CEL_STYLE.MICRO.LINE >= 1.25 && CEL_STYLE.MICRO.LINE <= 2 && CEL_STYLE.MICRO.LINE_SMALL <= 1, 'a confident line round big bodies, a hairline round fine things (Mohammad 20 Nov: "too much")');
  assert.ok(CEL_STYLE.MICRO.INK_K <= 0.3, 'the ink is dark');
  const fs = await import('node:fs');
  const src = fs.readFileSync(new URL('../src/scene/micro3d/sinusoid3d.ts', import.meta.url), 'utf8');
  for (const part of ['rbc', 'nuclei', 'hsc', 'albumin', 'bile']) assert.match(src, new RegExp(`this\\.${part}\\.setInk\\(inkOf\\(`), `${part} uses the one near-black ink rule`);
});
