// The 2D line masks (stage-geo.js FADE_IN, SIN_FADE): the liver beds fade along their course, the hepatic and renal veins into the cava, C9 behind the liver.
import { VESSEL_FS, VESSEL_VS } from '../src/scene/vessels/shaders.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CAVA_RECEDE, fadeOf } from '../src/scene/vessels/fades.ts';
import { NODE_POS_2D } from '../src/scene/vessels/paths.copied.ts';
import { x3, y3 } from '../src/scene/frame2d.ts';
import { CelScene } from '../src/scene/scene.ts';
import { PLACED, EDGE_PATH_2D } from '../src/scene/anatomy/source.ts';
import { PLACED_EDGE_3D } from '../src/scene/anatomy/placed-network.ts';

test('a liver bed fades along the line from its portal node to its venous node: 0.8, faintest 0.36 half way, solid at the end', () => {
  for (const [id, a, b] of [['SIN_RR', 'SIN_R', 'CV_R'], ['SIN_LL', 'SIN_L', 'CV_L']] as const) {
    const f = fadeOf(id, false)!;
    assert.equal(f.mode, 4, id);
    const line2 = [x3(NODE_POS_2D[a]![0]), y3(NODE_POS_2D[a]![1]), x3(NODE_POS_2D[b]![0]), y3(NODE_POS_2D[b]![1])];
    if (!PLACED) assert.deepEqual(f.line, line2);
    else {
      // (restated for the placed anatomy, the only one now: the 2D line moves with the vessel, rigidly, by how far the course's end nearest it moved from the 2D course to the placed one,
      // so the bed still fades where it did along itself; fades.ts placedFade)
      const dx = f.line![0] - line2[0]!, dy = f.line![1] - line2[1]!;
      assert.ok(Math.abs(f.line![2] - line2[2]! - dx) < 1e-12 && Math.abs(f.line![3] - line2[3]! - dy) < 1e-12, `${id}: the line moved rigidly`);
      const was = EDGE_PATH_2D[id]!, now = PLACED_EDGE_3D[id]!;
      const moved = [[was[0]!, now[0]!], [was.at(-1)!, now.at(-1)!]].some(([w, n]) => Math.hypot(n![0]! - x3(w![0]!) - dx, n![1]! - y3(w![1]!) - dy) < 1e-9);
      assert.ok(moved, `${id}: by the shift of one of its course's ends`);
    }
    assert.equal(f.from, 0.5); assert.equal(f.a0, 0.8); assert.equal(f.a1, 0.36);
    assert.equal(f.keep, false);
  }
});

test('the hepatic veins fade into the cava (solid at the offset, to FADE_IN\'s alpha at the end); C9 dips behind the liver and is solid again above the dome', () => {
  const rhv = fadeOf('RHV_IVC', false)!;
  assert.equal(rhv.mode, 3); assert.equal(rhv.a0, 1); assert.equal(rhv.a1, 1, 'solid to the cava\'s wall (2D\'s end alpha 0.5 is dropped: a pale wedge, Mohammad 20 Nov)'); assert.equal(rhv.from, 0);
  assert.equal(fadeOf('C5', false)!.from, 0.6);
  assert.equal(fadeOf('C5', false)!.a1, 0.3, 'the default end alpha of FADE_IN is 0.3');
  const c9 = fadeOf('C9', false)!;
  assert.equal(c9.mode, 1, 'along the vein'); assert.equal(c9.a0, CAVA_RECEDE, 'the cava\'s tone along its run behind the liver and over the dome (Mohammad, 20 Nov: still a bright full-strength purple)'); assert.equal(c9.a1, 1, 'it comes to full only over its last stretch, where it joins the azygos');
  assert.ok(c9.from >= 0.85 && c9.from < 1, 'a short ramp');
});

test('the vessel shader carries both line modes with the 2D alpha (tube-geo.js tubeAlpha)', () => {
  const src = VESSEL_VS + VESSEL_FS;   // (the assembled program: the fade rule lives in the shared chunk glsl-shared.ts FADE_ALPHA_GLSL, which the vessel and net shaders both splice in)
  assert.match(src, /fadeMode > 3\.5/);
  assert.match(src, /smoothstep\(0\.0, max\(fadeA\.x, 1e-4\), fv\)/);
  assert.match(src, /smoothstep\(fadeA\.x, 1\.0, fv\)/);
});

test('every faded vessel is blended in its fade zone and a line fade is on its own vessel in the scene', () => {
  const s = new CelScene();
  for (const id of ['SIN_RR', 'SIN_LL', 'RHV_IVC', 'LRV_IVC', 'C5']) {
    const o = s.vessels.find((v) => v.edge!.id === id);
    assert.ok(o, id);
    assert.ok(o.toon.uniforms.fadeMode!.value >= 3, `${id} fade mode`);
    assert.equal(o.toon.transparent, true, id);
  }
  { const o = s.vessels.find((v) => v.edge!.id === 'C9')!; assert.equal(o.toon.uniforms.fadeMode!.value, 1); assert.equal(o.toon.transparent, true); }
  s.dispose();
});

test('the azygos tributary (2D FEEDERS.AZY_SVC) fades out down the figure by FEEDER_FADE_Y, so it never ends in a hook; other feeders keep no fade', () => {
  const f = fadeOf('AZY_SVC~F', false, 'AZY_SVC')!;
  assert.equal(f.mode, 2);
  assert.equal(f.from, y3(110)); assert.equal(f.to, y3(176));
  assert.equal(f.a0, 1); assert.equal(f.a1, 0);
  assert.equal(fadeOf('C3~F', false, 'C3'), null);
  assert.match(readFileSync(new URL('../src/scene/scene.ts', import.meta.url), 'utf8'), /fadeOf\(def\.id, def\.tone === 'artery', def\.feeder\?\.host\)/);
});
