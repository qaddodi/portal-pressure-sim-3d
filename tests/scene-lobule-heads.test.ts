// The lobule's flow marks are 2D's NORMAL chevron heads, not the old stripe chevron (owner, 20 Nov 2026: "Why is there stripe chevrons in the lobule wtf. Just use the normal chevrons similar to the 2D
// version"). The head's shape, spacing rule, inks and size rule are copied from the 2D app by scripts/copy-chevrons.mjs; the shader here lays them on after the tones, so they are never banded or inked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { BILE_HEADS, CHEV_FLIP, CHEV_GLSL, CHEV_ORANGE_GLSL, CHEV_PITCH, CHEV_PITCH_GLSL, LYMPH_INK } from '../src/scene/lobule/from2d/chevron.generated.js';
import { HEAD_KIND, LOBULE_TOON_FS, LOBULE_TOON_VS } from '../src/scene/lobule/shading.ts';
import { CEL_QUANT_GLSL } from '../src/scene/materials/cel-quant.ts';
import { LobuleView } from '../src/scene/lobule/view.ts';
import { createShared } from '../src/scene/materials/cel.ts';
import { pinned2D } from './two-d-pin.ts';

const PIN2D = pinned2D('src/ui/chevron-glsl.js');

test('the copy of 2D\'s head is current (scripts/copy-chevrons.mjs --check against the 2D checkout at the pin)', { skip: PIN2D.skip }, () => {
  assert.doesNotThrow(() => execFileSync('node', ['scripts/copy-chevrons.mjs', '--from', PIN2D.repo, '--check'], { stdio: 'pipe' }));
});

test('the lobule\'s mark shader holds 2D\'s chevHead, chevLevel/chevKeep and chevOrange text as they are, at 130 CSS px', { skip: PIN2D.skip }, async () => {
  const two = await import(`${PIN2D.repo}/src/ui/chevron-glsl.js`);
  assert.equal(CHEV_GLSL, two.CHEV_GLSL, 'chevD and chevHead are 2D\'s, character for character');
  assert.equal(CHEV_PITCH_GLSL, two.CHEV_PITCH_GLSL);
  assert.equal(CHEV_PITCH, two.CHEV_PITCH); assert.equal(CHEV_PITCH, 130);
  assert.deepEqual(CHEV_FLIP, two.CHEV_FLIP);
  for (const part of [two.CHEV_GLSL, two.CHEV_PITCH_GLSL, CHEV_ORANGE_GLSL.trim()]) assert.ok(LOBULE_TOON_FS.includes(part.trim()), 'the fragment shader carries the 2D text');
});

test('the shader draws the head 2D\'s way: the size rule, the ink flip, the second head when reversed, the lymph teal and the bile green', () => {
  const fs = LOBULE_TOON_FS;
  assert.ok(fs.includes('chevHead(headDir * x * pxW, ay, hw, 1.0,'), 'chevHead on the arc, across the tube, at a pixel of 1');
  assert.ok(fs.includes('hw = min(0.8 * R, clamp(0.5 * R, 4.0 * dpr, 8.0 * dpr));'), 'the blood head: half the caliber, 4 to 8 CSS px, never wider than 0.8 of it (veins-gl.js chevAt)');
  assert.ok(fs.includes('chevLevel(1.0 / pxW, dpr, 1.0, -1.0)') && fs.includes('chevKeep(j, n0, cl.x)'), '2D\'s spacing lattice: 130 CSS px apart at every zoom');
  assert.ok(fs.includes(`smoothstep(${CHEV_FLIP[0]}, ${CHEV_FLIP[1]}, dot(pow(`), 'the ink flips on the lumen\'s linear luminance');
  assert.ok(fs.includes('headRev'), 'a reversed head is orange with a second small head');
  assert.equal(LYMPH_INK.gapCss, 110); assert.equal(BILE_HEADS.pitch, 0.14);
  assert.deepEqual(BILE_HEADS.core, [0.64, 0.88, 0.3]); assert.deepEqual(BILE_HEADS.rim, [0.14, 0.18, 0.05]);
  assert.ok(fs.includes('vec3(0.64, 0.88, 0.3)') && fs.includes('vec3(0.14, 0.18, 0.05)'), 'the bile\'s leaf green with a dark olive rim');
  assert.ok(fs.includes('vec3(0.0, 0.3, 0.38)'), 'the lymph\'s teal on a light channel');
});

test('the old stripe chevron is gone from the lobule: nothing of it is drawn, and the marks are laid on after the tones (never banded, never inked)', () => {
  const fs = LOBULE_TOON_FS;
  assert.ok(fs.includes('m * (flowBands > 0.5 ? 0.30 : 0.0)'), 'the shared shader\'s stripe mark has no strength here (only the stagnant blood\'s smoke bands keep the block)');
  const tones = fs.indexOf('#ifdef TONES3'), heads = fs.indexOf('if (headAmount > 0.001)'), out = fs.indexOf('gl_FragColor');
  assert.ok(tones > 0 && heads > tones && out > heads, 'the heads come after the tones and are the last thing written before the colour goes out');
  assert.ok(!fs.includes('celQuant') && !fs.includes(CEL_QUANT_GLSL.slice(0, 40)) && !/celTissue|CEL_TISSUE/.test(fs), 'no band quantiser anywhere in the lobule\'s vessel shader');
  const after = fs.slice(heads, out);
  assert.ok(!/bands|celQuant|floor\(q\)|smoothstep\(0\.5 - w/.test(after), 'nothing after the heads bands or inks the colour');
  assert.ok(LOBULE_TOON_VS.includes('attribute float rad;') && LOBULE_TOON_VS.includes('vRl = '), 'the head is sized by the tube\'s own radius at the pixel');
});

test('every mark the view builds is a head of its kind: blood, the lymph (teal) and the bile (green); the amount is the layer\'s fade and nothing stripes', () => {
  const v = new LobuleView(createShared());
  v.setVisible(true);
  const marked = v.objects.filter((o) => o.isVessel);
  assert.ok(marked.length >= 8, 'sinusoids, inlets, twigs, lymph, bile');
  const kinds = new Set(marked.map((o) => o.toon.uniforms.headKind!.value as number));
  assert.deepEqual([...kinds].sort(), [HEAD_KIND.blood, HEAD_KIND.lymph, HEAD_KIND.bile]);
  for (const o of marked) {
    assert.equal(o.toon.uniforms.flowBands!.value, 1, 'the stripe (flowBands 0) is never asked for');
    assert.ok(o.toon.uniforms.headArc!.value as number > 0);
  }
  // the source of the mark path is what shading.ts patches: it must not have the stripe back
  assert.ok(/flowBands < 0\.5/.test(readFileSync(new URL('../src/scene/materials/shaders.ts', import.meta.url), 'utf8')), 'the shared shader still has its own stripe for the anatomy (untouched)');
});
