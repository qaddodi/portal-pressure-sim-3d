// The lobule's one dissolve (Mohammad 20 Nov 2026, Sinusoid -> Lobule: "you're fading in/out the lymph first then the blood vessels ... the lobule blood vessels are flashing briefly"):
// every tile, tube, mark and the marks plate go at ONE fade value, by ONE screen pattern, and nothing is scaled by that value a second time. Root cause: the flow marks were given
// `k * fade` ON TOP of the tube's own pixel dissolve, so they went as the fade squared, and the lymph's weaker marks (0.4) before the blood's: the lymph first, the vessels after.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ShaderMaterial } from 'three';
import { createShared } from '../src/scene/materials/cel.ts';
import { LobuleView } from '../src/scene/lobule/view.ts';
import { Lobule3D } from '../src/scene/micro3d/lobule3d.ts';
import { LOBULE_PLATE_FS } from '../src/scene/lobule/plate.ts';

const shared = createShared();
const flat = new LobuleView(shared);
const l3 = new Lobule3D(flat, shared);
l3.buildForTest('light');
flat.setVisible(true);

const FLOW = ['uFlowK', 'uFlowStreak', 'uFlowHead', 'uDustK'] as const;
const snapshot = () => l3.partsForTest.map((p) => ({ name: p.toonMesh.name, u: FLOW.map((k) => (p.mats.toon.uniforms[k] as { value: number } | undefined)?.value) }));

test('one fade value reaches every part of the lobule and its marks plate', () => {
  const fades = new Set<object>();
  for (const p of l3.partsForTest) for (const m of [p.mats.toon, p.mats.ink]) if (m) fades.add(m.uniforms.fade as object);
  fades.add((l3 as unknown as { marksMat: ShaderMaterial }).marksMat.uniforms.fade as object);
  assert.equal(fades.size, 1, 'tiles, tubes (blood, lymph, bile), mouths and the marks plate all read one uniform');
  assert.match(LOBULE_PLATE_FS, /if \(fadedOut\(\)\) discard;/, 'the marks plate drops the same pixels of the same pattern, not an alpha of its own');
});

test('the flow marks are not scaled by the fade a second time: the lymph, the bile and the blood keep their own strengths however far the lobule has dissolved', () => {
  l3.update(true, 0, 1000, 1); l3.update(true, 0, 1016, 1);
  const whole = snapshot();
  for (const under of [0.2, 0.5, 0.8]) {
    l3.update(true, under, 1032, 1);
    const part = snapshot();
    assert.deepEqual(part, whole, `at ${under} of the way under, every mark strength is what it is whole`);
  }
  assert.ok(whole.some((p) => p.u.some((v) => (v ?? 0) > 0)), 'there are marks to compare');
});

test('no mark, wash or tone in the lobule scene multiplies by its fade', () => {
  const src = readFileSync('src/scene/micro3d/lobule3d.ts', 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(src, /\*\s*this\.fade\.value|this\.fade\.value\s*\*/, 'nothing is scaled by the fade a second time');
  assert.doesNotMatch(src, /opacity!?\.value\s*=\s*fs/, 'the marks plate has no alpha fade of its own');
});
