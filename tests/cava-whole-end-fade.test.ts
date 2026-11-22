import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CelScene } from '../src/scene/scene.ts';
import { IVC_EDGES } from '../src/scene/vessels/paths.copied.ts';
import { CAVA_RECEDE, cavaWholeAlpha, fadeOf } from '../src/scene/vessels/fades.ts';

const run = (s: CelScene, from: number, to: number) => { for (let t = from; t <= to; t += 16) s.update(t); };

test('cavaWholeAlpha takes the recede away and nothing else: a faded-out end stays out, a receded body comes to whole', () => {
  assert.equal(cavaWholeAlpha(0), 0);
  assert.equal(cavaWholeAlpha(CAVA_RECEDE), 1);
  assert.equal(cavaWholeAlpha(1), 1);
  assert.ok(Math.abs(cavaWholeAlpha(CAVA_RECEDE * 0.5) - 0.5) < 1e-12);
});

test('picking the cava lets go of its recede, never of its fade at a free end: the lower cava (ILI_IVC, fading down the figure) still fades to nothing', () => {
  const s = new CelScene();
  // every cava piece (the lumbar collateral has its own ease) that rests at nothing at one end keeps that end at nothing when whole (no round cap with a hard ink rim)
  const ends: [string, number, number][] = [];
  for (const id of IVC_EDGES) { const f = fadeOf(id, false); if (f) ends.push([id, f.a0, f.a1]); }
  assert.ok(ends.some(([id, , a1]) => id === 'ILI_IVC' && a1 === 0), 'ILI_IVC fades out down the figure');
  s.pick('ILI_IVC');
  run(s, 0, 1200);
  for (const [id, a0, a1] of ends) {
    const o = s.vesselObject(id);
    if (!o) continue;
    const a = (o as unknown as { toon: { uniforms: { fadeA: { value: { z: number; w: number } } } } }).toon.uniforms.fadeA.value;
    assert.ok(Math.abs(a.z - cavaWholeAlpha(a0)) < 1e-6, `${id} start alpha ${a.z}`);
    assert.ok(Math.abs(a.w - cavaWholeAlpha(a1)) < 1e-6, `${id} end alpha ${a.w}`);
    if (a1 === 0) assert.equal(a.w, 0, `${id} still fades out at its end when picked`);
  }
  s.dispose();
});
