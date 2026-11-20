// The dark looks (Dark, Navy, Black) have contrast (Mohammad, 20 Nov: "The anatomy view should be more contrast, it's very basically dark now"): the organs, as the layer lays them on the ground, are clearly lighter than the
// ground, and a vessel's lit tone (a flat, saturated tone, brighter caps than the light looks') stands off the organ behind it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DARK_ORGAN_LAYER, PALETTES, contrast, hexToRgb255 } from '../src/scene/palette.ts';
import { celTubeBase } from '../src/scene/vessels/cel-ink.ts';
import { CEL_STYLE } from '../src/scene/cel-style.ts';
import { CEL_TUBE_GLSL } from '../src/scene/cel-glsl.ts';
import { CelScene } from '../src/scene/scene.ts';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';

const DARK = ['dark', 'navy', 'black'] as const;
const hex = (c: readonly number[]) => '#' + c.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
/** The organ as the layer lays it on the ground (raw sRGB, as the shaders blend). */
const onGround = (tone: string, bg: string, layer: number) => { const t = hexToRgb255(tone), g = hexToRgb255(bg); return hex(t.map((v, i) => layer * v + (1 - layer) * g[i]!)); };
const lit = (tone: string) => hex(celTubeBase(hexToRgb255(tone).map((v) => v / 255) as [number, number, number], true).map((v) => v * 255));

test('in the dark looks every organ is at least 3:1 over the ground, and the layer is the lifted one (2D\'s .55 left them at 2.4)', () => {
  for (const id of DARK) {
    const p = PALETTES[id];
    assert.equal(p.organLayer, DARK_ORGAN_LAYER); assert.ok(DARK_ORGAN_LAYER > 0.55);
    for (const k of ['liver', 'spleen', 'kidney', 'gut', 'stomach', 'heart'] as const) {
      const c = contrast(onGround(p.tones[k], p.bg, p.organLayer), p.bg);
      assert.ok(c >= 3, `${id} ${k}: ${c.toFixed(2)}:1 over the ground`);
    }
  }
});

test('in the dark looks a vessel\'s lit tone is brighter than the organ behind it by at least 1.4:1, and stays over the ground too', () => {
  for (const id of DARK) {
    const p = PALETTES[id];
    for (const v of ['portal', 'sys'] as const) {
      const tone = lit(p.tones[v]);
      assert.ok(contrast(tone, p.bg) >= 4, `${id} ${v} over the ground`);
      for (const k of ['liver', 'spleen', 'kidney', 'gut', 'stomach', 'heart'] as const) {
        const c = contrast(tone, onGround(p.tones[k], p.bg, p.organLayer));
        assert.ok(c >= 1.4, `${id}: ${v} over the ${k}: ${c.toFixed(2)}:1`);
      }
    }
  }
});

test('the light looks keep their own caps; the dark caps are brighter, one flag in the shader, set per look', () => {
  assert.ok(CEL_STYLE.TUBE.LCAP_DARK > CEL_STYLE.TUBE.LCAP && CEL_STYLE.TUBE.VCAP_DARK > CEL_STYLE.TUBE.VCAP);
  assert.match(VESSEL_FS, /uniform float tubeDark;/);
  assert.match(CEL_TUBE_GLSL, /mix\(0\.62, 0\.82, tubeDark\)/);
  const s = new CelScene(), o = s.vesselObject('PV_TRUNK')!;
  for (const id of ['light', 'soft', 'dark', 'navy', 'black'] as const) { o.applyPalette(PALETTES[id]); assert.equal(o.toon.uniforms.tubeDark!.value, id === 'light' || id === 'soft' ? 0 : 1, id); }
  s.dispose();
});
