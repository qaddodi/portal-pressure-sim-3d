// WP9: the plexus strands and the varices wear the 2D figure's line (the look's casing ink at its casing alpha, LINE_MIN device px, no specular), never a solid black ink.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CelScene } from '../src/scene/scene.ts';
import { CEL_STYLE } from '../src/scene/cel-style.ts';
import { CASING } from '../src/scene/vessels/cel-ink.ts';
import { presetState } from './b4-presets.ts';

test('every drawn strand has a soft ink in the look\'s casing, LINE_MIN device px, no glint; a look change and a pixel ratio carry through', async () => {
  const s = new CelScene(); const d = s.disease;
  const f = (await presetState('cirr-decomp')).frame;
  d.feed(f as never, {}, null, { instant: true, presence: () => 1, recruit: () => 1 }, true);
  d.update(1000);
  const objs = () => (d.strands as unknown as { strands: { host: string; obj: import('../src/scene/materials/cel.ts').CelObject | null }[] }).strands.filter((x) => x.obj?.group.visible);
  assert.ok(objs().length > 4, 'strands are drawn');
  for (const look of ['light', 'dark'] as const) {
    s.applyLook(look); d.strands.setDpr(3);
    for (const { host, obj } of objs()) {
      const u = obj!.ink.uniforms, c = CASING[look];
      assert.ok(!obj!.ink.transparent && !obj!.ink.depthWrite, `${host}: the ink is solid, drawn once per pixel`);
      const a = u.inkA!.value as number;
      assert.ok(Math.abs(a - c.a) < 1e-6 || Math.abs(a - c.a * 0.5) < 1e-6, `${host}: alpha ${a}`);
      assert.ok(Math.abs((u.px!.value as number) - (host.startsWith('SIN') ? 0.25 : CEL_STYLE.LINE_MIN / 3)) < 1e-6, `${host}: LINE_MIN device px (a bed's hairlines 0.75) on a 3x screen`);
      assert.equal(obj!.toon.uniforms.spec!.value, 0, `${host}: no glint`);
      const col = u.color!.value as { r: number; g: number; b: number };
      assert.ok(Math.abs(col.r - c.rgb[0] / 255) < 1e-6, `${host}: casing ink, not the palette's black`);
    }
  }
  s.dispose?.();
});
