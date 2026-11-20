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
