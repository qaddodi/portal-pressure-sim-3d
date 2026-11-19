// WP1: the organs are 2D's quiet wash: the copied --og-* tones, laid on the page at the organ layer's opacity, outlined in their own third tone, never black.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pinned2D } from './two-d-pin.ts';
import { execFileSync } from 'node:child_process';
import { PALETTES, LOOK_IDS, luminance } from '../src/scene/palette.ts';
import { ORGAN_STYLE, organLayerAlpha } from '../src/scene/organs/layer.ts';
import { ORGAN_FS, ORGAN_VS } from '../src/scene/organs/organ-shader.ts';
import { mix, rgbOf } from '../src/scene/organs/organ-look.ts';

const hex = (c: readonly number[]) => '#' + c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');

test('the organ layer sits at 2D\'s opacity: .55, Soft .72, the kidney .85 (Soft .88), the gut at --gut-a', () => {
  assert.equal(organLayerAlpha(PALETTES.light, 'liver'), 0.55);
  assert.equal(organLayerAlpha(PALETTES.dark, 'liver'), 0.55);
  assert.equal(organLayerAlpha(PALETTES.soft, 'liver'), 0.72);
  assert.equal(organLayerAlpha(PALETTES.light, 'kidney-l'), 0.85);
  assert.equal(organLayerAlpha(PALETTES.soft, 'kidney-l'), 0.88);
  assert.equal(organLayerAlpha(PALETTES.light, 'bowel'), 0.66);
});

test('2D\'s liver tones, washed on the page, land near 2D\'s effective liver (plan section 1) and lighter than the old opaque 3D liver on Light', () => {
  const p = PALETTES.light, og = p.organs.tones.liver;
  assert.deepEqual(og, ['#E3B8A7', '#C6826D', '#97513E']);
  const washed = mix(rgbOf(p.bg), mix(rgbOf(og[0]), rgbOf(og[1]), 0.5), 0.55);
  assert.ok(luminance(hex(washed)) > luminance('#905B49') * 1.8, `washed liver ${hex(washed)} should be far paler than #905B49`);
});

test('on the dark looks the organ outline (the third tone) is lighter than the fill: a soft light edge, never a black line', () => {
  for (const id of LOOK_IDS) {
    const p = PALETTES[id];
    for (const st of Object.values(ORGAN_STYLE)) {
      const [a, b, c] = p.organs.tones[st.og];
      if (p.highlight === 'white') assert.ok(luminance(c) > luminance(b) && luminance(c) > luminance(a) * 0.9, `${id} ${st.og}`);
      else assert.ok(luminance(c) < luminance(b), `${id} ${st.og}`);
    }
  }
});

test('the organ painter blends at the layer\'s opacity, fades without dots and keeps the vertex paint', () => {
  assert.doesNotMatch(ORGAN_FS, /if \(fadedOut\(\)\)/, 'the dive fades the layer, no dots');
  assert.match(ORGAN_FS, /vInk - color/);
  assert.match(ORGAN_VS, /attribute vec3 ink/);
  // (the organ fill setting: with `solid` 0 the alpha is the layer's opacity, exactly as before; tests/organ-depth.test.ts)
  assert.match(ORGAN_FS, /float a = mix\(layer, 1\.0, solid\);/);
  assert.match(ORGAN_FS, /gl_FragColor = vec4\(fill, a \* fade \* win\)/, 'blended at the layer, so organs show through each other');
});

const twoD = pinned2D('styles/tokens.css');
test('the copied tones equal the 2D app\'s at the pin (copy-organ-tones --check)', { skip: twoD.skip }, () => {
  execFileSync('node', ['scripts/copy-organ-tones.mjs', '--from', twoD.repo, '--check'], { stdio: 'pipe' });
});

// The visual review (19 Nov): 2D's inner shade strokes (.09/.15/.24 of og-dark) stack, so the darkest rim is og-dark at 1-(.91·.85·.76) ≈ .41 of its alpha:
// .11 on Light (2D .12), .14 on Dark (2D .16); the earlier sum divided by .26 gave .48 and .65.
test('the inner shade stacks as 2D\'s strokes, at og-dark\'s own alpha, on the lower right only', () => {
  assert.match(ORGAN_FS, /1\.0 - \(1\.0 - 0\.09 \* .*\) \* \(1\.0 - 0\.15 \* .*\) \* \(1\.0 - 0\.24 \* /);
  assert.match(ORGAN_FS, /ogDark\.a \* k \* lowerRight/);
  assert.doesNotMatch(ORGAN_FS, /\/ 0\.26/);
  const k = 1 - 0.91 * 0.85 * 0.76;
  assert.ok(Math.abs(PALETTES.light.organs.dark[3] * k - 0.12) < 0.02);
  assert.ok(Math.abs(PALETTES.dark.organs.dark[3] * k - 0.16) < 0.03);
});

test('the organ outline is in the figure\'s units (2D 1.1, kidney 1.4), floored at one device pixel, and the organs draw in 2D\'s order with the gut last', async () => {
  const { ORGAN_INK_VS } = await import('../src/scene/organs/organ-shader.ts');
  const { ORGAN_ORDER } = await import('../src/scene/organs/layer.ts');
  assert.match(ORGAN_INK_VS, /max\(1\.0 \/ max\(dpr, 1\.0\), px \/ max\(wpc, 1e-6\)\)/);
  assert.equal(ORGAN_STYLE.liver!.px, 1.1); assert.equal(ORGAN_STYLE['kidney-l']!.px, 1.4);
  assert.deepEqual(ORGAN_ORDER.slice(-2), ['bowel', 'colon']);
  for (const id of Object.keys(ORGAN_STYLE)) assert.ok(ORGAN_ORDER.includes(id), id);
});
