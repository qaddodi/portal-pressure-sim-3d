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
/** 0 shade, 1 base, 2 lit, as celBands and the tones make them away from an edge: the band is cut by n.L of the smooth rest normal alone (no box lean, no tuck band). */
const organBand = (lam: number): 0 | 1 | 2 => celBand(lam, 0, O.SHADE_LAM, O.LIT_LAM);
const LIGHT_N = (() => { const l = Math.hypot(...O.LIGHT); return O.LIGHT.map((v) => v / l) as unknown as [number, number, number]; })();

test('cel shaded: exactly three tones, cut by the smooth normal alone: one shade crescent along the lower right edge, one lit crescent along the upper left, base between, nothing cut across the middle', () => {
  const seen = new Set<number>();
  for (let lam = -1; lam <= 1; lam += 0.01) seen.add(organBand(lam));
  assert.deepEqual([...seen].sort(), [0, 1, 2]);
  // a face-on flat organ (the view normal straight at the eye) is the base tone: SHADE_LAM < face < LIT_LAM
  const face = LIGHT_N[2];
  assert.equal(organBand(face), 1, 'face on is base');
  assert.ok(O.SHADE_LAM < face && face < O.LIT_LAM);
  // a round pillow (a disc whose normal is the sphere's): the middle is base, the lit tone is an arc at the upper left rim, the shade an arc at the lower right rim
  let lit = 0, sh = 0, n = 0, lx = 0, ly = 0, sx = 0, sy = 0, centre = 1;
  for (let x = -1; x <= 1; x += 0.01) for (let y = -1; y <= 1; y += 0.01) {
    const r2 = x * x + y * y;
    if (r2 > 0.98) continue;
    const z = Math.sqrt(1 - r2), b = organBand(x * LIGHT_N[0] + y * LIGHT_N[1] + z * LIGHT_N[2]);   // (y up)
    n++;
    if (b === 2) { lit++; lx += x; ly += y; } else if (b === 0) { sh++; sx += x; sy += y; }
    if (r2 < 0.01) centre = b;
  }
  assert.equal(centre, 1, 'the middle of a round organ is base');
  assert.ok(lit / n > 0.03 && lit / n < 0.45 && sh / n > 0.03 && sh / n < 0.55, `each crescent is a clear part, none swallows the organ (lit ${(lit / n).toFixed(2)}, shade ${(sh / n).toFixed(2)})`);
  assert.ok(lx / lit < -0.2 && ly / lit > 0.2, 'the lit one lies at the upper left');
  assert.ok(sx / sh > 0.2 && sy / sh < -0.2, 'the shade one lies at the lower right');
});

test('cel shaded: the numbers are cel-style.ts\'s (no second copy), edges are EDGE_PX of fwidth, the tones are 2D\'s tokens, and the wash is behind `solid`', () => {
  const g = (name: string) => Number(new RegExp(`const float ${name} = ([0-9.]+);`).exec(ORGAN_FS)![1]);
  assert.equal(g('CEL_SHADE_LAM'), O.SHADE_LAM); assert.equal(g('CEL_LIT_LAM'), O.LIT_LAM); assert.equal(g('CEL_EDGE_PX'), CEL_STYLE.EDGE_PX);
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
  assert.ok(cel.includes('vec3 base = celBase + paint;'), 'the base is the organ\'s own 2D tone (cel-tones.ts), flat, with what varies over it');
  assert.ok(cel.includes('mix(mix(base, celShade + paint, b.x), celLit + paint, b.y)'), 'three flat tones, nothing mixed in between');
  assert.doesNotMatch(cel, /ogLight|ogDark|volShade|\bo1\b|\bo2\b|\bo3\b|mix\(o1|smoothstep\((?!.*celBands)/, 'no og-light, og-dark, gradient or rim in the cel block');
    assert.doesNotMatch(cel, /vBox|lean|vAo|depthAmt/, 'no box lean and no tuck band: the smooth rest normal alone');
    assert.match(cel, /celBands\(dot\(normalize\(vCn\), CEL_LIGHT\), 0\.0, 2\.0\)/);
  assert.doesNotMatch(cel, /#[0-9A-Fa-f]{6}|vec3\([0-9.]+, [0-9.]+, [0-9.]+\)/, 'no literal colour');
  assert.ok(!cel.includes('mix(page'), 'no pre-mix against the page');
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
  assert.ok(wash > 0 && cel > wash * 1.2, `the line is stronger cel shaded (${wash.toFixed(3)} -> ${cel.toFixed(3)})`);   // (Light's wash is at .72 since 19 Nov, so its line is .62 × .72, not × .55)
  assert.ok(mid > wash && mid < cel, 'and it eases');
  for (const [id, o] of organs.byId) {
    assert.equal(o.ink.uniforms.px!.value, O.LINE_PX, `${id}: the one bold outline width, the same on every organ`);
    assert.equal(o.ink.uniforms.minPx!.value, O.LINE_MIN_CSS, `${id}: never under ${O.LINE_MIN_CSS} CSS px`);
  }
  organs.setFill('seethrough'); for (let t = 4016; t < 8000 && organs.update(t); t += 16);
  assert.equal(organs.byId.get('liver')!.ink.uniforms.px!.value, 1.1, 'the wash keeps 2D\'s width');
  assert.equal(organs.byId.get('liver')!.ink.uniforms.minPx!.value, 0, 'and its one device pixel floor');
  assert.ok(Math.abs(away() - wash) < 1e-9, 'and its thin line, exactly');
  s.dispose?.();
});
