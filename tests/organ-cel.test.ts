// Cel shaded organs (Settings > Organ fill > Cel shaded, solid): three hard tones from the figure's one cel style (src/scene/cel-style.ts). `organBand` is the JS twin of the shader's celBands with
// the edge at its limit (a pure step); the numbers are read from cel-style.ts and from the GLSL text, so a second copy of a threshold fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORGAN_FS } from '../src/scene/organs/organ-shader.ts';
import { readFileSync } from 'node:fs';
import { organsReady, setOrganData } from '../src/scene/organs/meshes.ts';
import { CelScene } from '../src/scene/scene.ts';
import { CEL_STYLE, celBand } from '../src/scene/cel-style.ts';

const file = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
setOrganData(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);

const O = CEL_STYLE.ORGAN;
/** 0 shade, 1 base, 2 lit, as celBands and the tones make them away from an edge; `depth` 0..1 is organDepth's uniform (the tuck band starts at mix(1.5, TUCK_AO, depth)). */
function organBand(lam: number, ao: number, depth: number): 0 | 1 | 2 {
  const tuckAt = 1.5 + (O.TUCK_AO - 1.5) * depth;
  return ao > tuckAt ? 0 : celBand(lam, 0, O.SHADE_LAM, O.LIT_LAM);
}

test('cel shaded: the bands are exactly three tones over a whole sweep of light and tuck, with organ depth on or off', () => {
  for (const depth of [0, 1]) {
    const seen = new Set<number>();
    for (let lam = -1; lam <= 1; lam += 0.01) for (let ao = 0; ao <= 1; ao += 0.01) seen.add(organBand(lam, ao, depth));
    assert.deepEqual([...seen].sort(), [0, 1, 2], `depth ${depth}: shade, base and lit only`);
  }
  // the tuck is one hard band of the shade tone, and only with organ depth on; the lit cap is not lit where it is tucked
  assert.equal(organBand(0.5, 0.9, 0), 1);
  assert.equal(organBand(0.5, 0.9, 1), 0);
  assert.equal(organBand(0.9, 0.9, 1), 0);
  assert.equal(organBand(0.9, 0.1, 1), 2);
  // a face-on flat organ (the view normal straight at the eye) is the base tone
  const face = O.LIGHT[2] / Math.hypot(...O.LIGHT);
  assert.equal(organBand(face, 0, 1), 1, 'face on is base');
  assert.ok(O.SHADE_LAM < face && face < O.LIT_LAM);
});

test('cel shaded: the numbers are cel-style.ts\'s (no second copy), edges are EDGE_PX of fwidth, the tones are 2D\'s tokens, and the wash is behind `solid`', () => {
  const g = (name: string) => Number(new RegExp(`const float ${name} = ([0-9.]+);`).exec(ORGAN_FS)![1]);
  assert.equal(g('CEL_SHADE_LAM'), O.SHADE_LAM); assert.equal(g('CEL_LIT_LAM'), O.LIT_LAM); assert.equal(g('CEL_TUCK_AO'), O.TUCK_AO); assert.equal(g('CEL_EDGE_PX'), CEL_STYLE.EDGE_PX);
  const lg = /CEL_LIGHT = vec3\((-?[0-9.]+), ([0-9.]+), ([0-9.]+)\)/.exec(ORGAN_FS)!.slice(1).map(Number);
  const len = Math.hypot(...O.LIGHT);
  O.LIGHT.forEach((v, i) => assert.ok(Math.abs(lg[i]! - v / len) < 1e-6, 'the light is the style\'s, normalized once in JS'));
  assert.ok(Math.abs(Math.hypot(...lg) - 1) < 1e-5, 'a unit vector, so the shader needs no normalize');
  assert.match(ORGAN_FS, /float lam = dot\(n, CEL_LIGHT\);/, 'organ depth\'s soft light is the same light, not a copy');
  const fn = ORGAN_FS.slice(ORGAN_FS.indexOf('vec2 celBands'), ORGAN_FS.indexOf('void main()'));
  assert.match(fn, /wl = max\(fwidth\(lam\) \* CEL_EDGE_PX, 1e-5\)/);
  assert.match(fn, /CEL_SHADE_LAM - wl, CEL_SHADE_LAM \+ wl/);
  assert.match(fn, /CEL_LIT_LAM - wl, CEL_LIT_LAM \+ wl/);
  assert.doesNotMatch(fn, /smoothstep\([^)]*[0-9]\.[0-9]+ ?[-+]/, 'no literal softness in an edge');
  const cel = ORGAN_FS.slice(ORGAN_FS.indexOf('// Cel shaded: the wash'), ORGAN_FS.indexOf('float a = mix(layer'));
  assert.match(cel, /if \(solid > 0\.001\) \{/);
  assert.ok(cel.includes(`base * (1.0 - ${CEL_STYLE.SHADE}), ogDark.rgb, ogDark.a`), 'shade: the base x (1 - SHADE) toward og-dark');
  assert.ok(cel.includes(`mix(base, ogLight.rgb, ${CEL_STYLE.LIT})`), 'lit: LIT of the way to og-light');
  assert.doesNotMatch(cel, /#[0-9A-Fa-f]{6}|vec3\([0-9.]+, [0-9.]+, [0-9.]+\)/, 'no literal colour');
  assert.match(cel, /fill = mix\(fill, cel, solid\);/, 'eased by the solid uniform');
  // the wash above it never mentions the cel fill: solid 0 skips the block, so the see-through organ is exactly as before
  const wash = ORGAN_FS.slice(ORGAN_FS.indexOf('void main()'), ORGAN_FS.indexOf('// Cel shaded: the wash'));
  assert.doesNotMatch(wash, /solid|celBands/);
});

test('cel shaded: the organ\'s line is 2D\'s alpha whole, not thinned by the layer, and eases with the fill; the wash keeps its thin line', async () => {
  const { PALETTES } = await import('../src/scene/palette.ts');
  await organsReady;
  const s = new CelScene();
  s.disease.organs.build();
  const organs = s.disease.organs;
  organs.applyLook(PALETTES.light);
  const away = () => { const c = organs.byId.get('liver')!.ink.uniforms.color!.value as { r: number; g: number; b: number }; return Math.hypot(c.r - 1, c.g - 1, c.b - 1); };
  organs.setFill('seethrough', true); organs.setDepth(false, true); organs.update(1000);
  const wash = away();
  organs.setFill('solid'); organs.update(1016);
  const mid = away();
  for (let t = 1032; t < 4000 && organs.update(t); t += 16);
  const cel = away();
  assert.ok(wash > 0 && cel > wash * 1.4, `the line is stronger cel shaded (${wash.toFixed(3)} -> ${cel.toFixed(3)})`);
  assert.ok(mid > wash && mid < cel, 'and it eases');
  s.dispose?.();
});
