// WP1: the organs are 2D's quiet wash: the copied --og-* tones, laid on the page at the organ layer's opacity, outlined in their own third tone, never black.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { PALETTES, LOOK_IDS, luminance } from '../src/scene/palette.ts';
import { ORGAN_STYLE, organLayerAlpha } from '../src/scene/organs/layer.ts';
import { ORGAN_FS, ORGAN_VS } from '../src/scene/organs/organ-shader.ts';
import { mix, rgbOf } from '../src/scene/organs/organ-look.ts';

const hex = (c: readonly number[]) => '#' + c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');

test('the organ layer sits at 2D\'s opacity: .55, Soft .72, the kidney .85, the gut at --gut-a', () => {
  assert.equal(organLayerAlpha(PALETTES.light, 'liver'), 0.55);
  assert.equal(organLayerAlpha(PALETTES.dark, 'liver'), 0.55);
  assert.equal(organLayerAlpha(PALETTES.soft, 'liver'), 0.72);
  assert.equal(organLayerAlpha(PALETTES.light, 'kidney-l'), 0.85);
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

test('the organ painter pre-mixes against the page and keeps the dive\'s dissolve and the vertex paint', () => {
  assert.match(ORGAN_FS, /mix\(page, fill, layer\)/);
  assert.match(ORGAN_FS, /fadedOut\(\)/);
  assert.match(ORGAN_FS, /vInk - color/);
  assert.match(ORGAN_VS, /attribute vec3 ink/);
  assert.match(ORGAN_FS, /gl_FragColor = vec4\(mix\(page, fill, layer\), 1\.0\)/, 'opaque: no blending');
});

const twoD = process.env.PPS_2D_REPO ?? '../portal-pressure-simulator';
test('the copied tones equal the 2D app\'s (copy-organ-tones --check)', { skip: !existsSync(`${twoD}/styles/tokens.css`) && 'no 2D checkout' }, () => {
  execFileSync('node', ['scripts/copy-organ-tones.mjs', '--from', twoD, '--check'], { stdio: 'pipe' });
});
