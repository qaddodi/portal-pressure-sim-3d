// A picked vessel keeps its glow but its OUTLINE is the vessel's own colour (Mohammad, 20 Nov: "i don't like the outline; the glow is ok; maybe make it the color of the vessel"). Root cause of the old look: a
// picked vessel kept its plain dark ink line, a dark band between the lumen and the glow. The line is now one shared rule (glsl-shared.ts inkHiColourGlsl) in the tube AND the junction skin, eased by the pick's weight.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { VESSEL_FS } from '../src/scene/vessels/shaders.ts';
import { SKIN_FS } from '../src/scene/vessels/skin/shaders.ts';
import { inkHiColourGlsl } from '../src/scene/vessels/glsl-shared.ts';
import { tubeInk, tubeInkPicked, celTubeBase } from '../src/scene/vessels/cel-ink.ts';
import { CEL_STYLE } from '../src/scene/cel-style.ts';
import { HI_PX } from '../src/scene/highlight.ts';

const LOOKS = ['light', 'soft', 'dark', 'navy', 'black'] as const;
const BASES: [number, number, number][] = [[0.78, 0.2, 0.18], [0.2, 0.45, 0.8], [0.9, 0.7, 0.2]];
const lum = (c: readonly number[]): number => 0.299 * c[0]! + 0.587 * c[1]! + 0.114 * c[2]!;

test('the tube and the junction skin colour a picked vessel\'s line by the one shared rule, weighted by the pick (vHi on a tube, the blended arm weight on a skin)', () => {
  assert.ok(VESSEL_FS.includes(inkHiColourGlsl('baseH', 'vHi')), 'tube: inkH is the shared picked-outline rule on vHi');
  assert.ok(SKIN_FS.includes(inkHiColourGlsl('base', 'hi')), 'skin: the same rule on the arms\' blended hi');
  assert.match(SKIN_FS, /float hi = [^;]*armAF[^;]*\.z/, 'the skin\'s hi is its arms\' highlight weight at their seams');
});

test('the outline is still not widened or recoloured to white: the glow stays the only halo (hiPx 0)', () => {
  assert.equal(HI_PX, 0);
});

test('a picked line is the vessel\'s own colour, eased: hi 0 is the plain ink, and it moves smoothly (no step) toward the vessel\'s colour as hi grows', () => {
  for (const look of LOOKS) for (const b of BASES) {
    const plain = tubeInk(look, b), at0 = tubeInkPicked(look, b, 0);
    for (let i = 0; i < 3; i++) assert.ok(Math.abs(plain[i]! - at0[i]!) < 1e-9, `${look}: hi 0 is the plain ink`);
    let prev = at0;
    for (let h = 0.05; h <= 1.0001; h += 0.05) {
      const c = tubeInkPicked(look, b, h);
      for (let i = 0; i < 3; i++) assert.ok(Math.abs(c[i]! - prev[i]!) < 0.12, `${look}: no step in the colour between hi ${(h - 0.05).toFixed(2)} and ${h.toFixed(2)}`);
      prev = c;
    }
  }
});

test('at full pick the line is nearer the vessel\'s own colour than the dark ink was, hue kept (never black, never white)', () => {
  for (const look of LOOKS) for (const b of BASES) {
    const dark = look === 'dark' || look === 'navy' || look === 'black';
    const own = celTubeBase(b, dark), full = tubeInkPicked(look, b, 1), plain = tubeInk(look, b);
    const dist = (a: readonly number[], c: readonly number[]): number => Math.hypot(a[0]! - c[0]!, a[1]! - c[1]!, a[2]! - c[2]!);
    assert.ok(dist(full, own) < dist(plain, own), `${look}: the picked line is closer to the vessel's colour`);
    assert.ok(lum(full) > lum(plain), `${look}: lighter than the plain dark ink`);
    assert.ok(Math.max(...full) < 0.995 && lum(full) > 0.08, `${look}: not white and not black`);
    const hue = (c: readonly number[]): number => Math.atan2(Math.sqrt(3) * (c[1]! - c[2]!), 2 * c[0]! - c[1]! - c[2]!);
    assert.ok(Math.abs(hue(full) - hue(own)) < 0.35, `${look}: the vessel's hue`);
  }
  assert.ok(CEL_STYLE.TUBE.HI_INK > 0 && CEL_STYLE.TUBE.HI_INK <= 1);
});
