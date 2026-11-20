// The cells' outline (the micro ink hull) is one unbroken line: it is drawn on both sides and keeps the surface that faces away by its own normal, so a thin rim strip that the
// screen-space push turns over is never culled into a gap (Mohammad 20 Nov: "the RBC outline is interrupted").
import test from 'node:test';
import assert from 'node:assert/strict';
import { DoubleSide, Vector2 } from 'three';
import { MICRO_INK_FS, MICRO_INK_VS, microMaterials } from '../src/scene/micro3d/cel3d.ts';

test('the micro ink hull is double-sided and culls by the surface normal, not by winding', () => {
  const m = microMaterials({ value: new Vector2(1, 1) }, { value: 1 });
  assert.equal(m.ink!.side, DoubleSide);
  assert.match(MICRO_INK_VS, /vFace = dot\(vn,/);
  assert.match(MICRO_INK_FS, /vFace > 0\.0\) discard/);
});
