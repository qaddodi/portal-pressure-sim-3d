// Cel shaded organs: the cel base of each organ is its own 2D tone (og-N-2), shade and lit the same hue one flat lightness step away (cel-tones.ts, CEL_STYLE.ORGAN.TONES): the three tones of every organ in every look are clearly apart
// (never peach on peach) and the lit tone is a modest step, never gloss; the gut's art wears the bands; the cel line is the casing ink, bold. Organ against organ is 2D's own: the pairs it makes close are printed, not changed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ORGAN_FS, ORGAN_INK_VS } from '../src/scene/organs/organ-shader.ts';
import { patchedShaders } from '../src/scene/organs/organ-art.ts';
import { CEL_STYLE } from '../src/scene/cel-style.ts';
import { LOOK_IDS } from '../src/scene/palette.ts';
import { ORGAN_TONES_2D } from '../src/looks/organ-tones.copied.ts';
import { LUMA } from '../src/scene/disease/copied/anatomy-b4.ts';
import { rgbOf, type RGB } from '../src/scene/organs/organ-look.ts';
import { CEL_ORGANS, TOKEN_OF, celTones, celBase } from '../src/scene/organs/cel-tones.ts';

const O = CEL_STYLE.ORGAN;
/** The least step between two neighbouring tones of one organ, as the sum over the three channels of |difference| in sRGB 0..255 (65 is about 22 a channel). */
export const ORGAN_MIN_STEP = 80;
/** The most a lit tone may lift above the base on the same measure (a modest step, not a gloss), and the brightest luma it may reach (2D's lightest base, the light gut, is about .83). */
const LIT_MAX_STEP = 200, LIT_MAX_LUMA = 0.88;
const sum = (a: RGB, b: RGB) => 255 * (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]));
const lum = (c: RGB) => c[0] * LUMA[0]! + c[1] * LUMA[1]! + c[2] * LUMA[2]!;
const hue = (c: RGB): number => { const [r, g, b] = c, mx = Math.max(r, g, b), d = mx - Math.min(r, g, b); if (d < 1e-9) return 0; const h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; return h * 60; };

test('the cel base of every organ in every look is its own 2D tone (og-N-2), and shade and lit are the same hue, flat steps either side', () => {
  for (const id of LOOK_IDS) for (const organ of CEL_ORGANS) {
    const og = ORGAN_TONES_2D[id].tones[TOKEN_OF[organ]];
    const t = celTones(id, organ), b2d = rgbOf(og[1]);
    assert.ok(sum(t.base, b2d) < 1e-6, `${id} ${organ}: the base is 2D's ${og[1]}`);
    // the same hue (a brown-red stays brown-red: not grey-mauve), within a few degrees; a near-grey tone has no hue to keep
    const sat = Math.max(...t.base) - Math.min(...t.base);
    if (sat > 0.1) for (const [name, c] of [['shade', t.shade], ['lit', t.lit]] as const) {
      const d = Math.abs(((hue(c) - hue(t.base) + 540) % 360) - 180);
      assert.ok(d < 4, `${id} ${organ}: ${name} keeps the hue (${d.toFixed(1)} degrees off)`);
    }
  }
});

test('every organ in every look: shade, base and lit are visibly apart, and lit is a modest step above the base, not near white', () => {
  for (const id of LOOK_IDS) for (const organ of CEL_ORGANS) {
    const { shade, base, lit } = celTones(id, organ);
    const a = sum(shade, base), b = sum(base, lit), c = sum(shade, lit);
    assert.ok(a >= ORGAN_MIN_STEP, `${id} ${organ}: the shade is ${a.toFixed(0)} from the base (least ${ORGAN_MIN_STEP})`);
    assert.ok(b >= ORGAN_MIN_STEP && b <= LIT_MAX_STEP, `${id} ${organ}: the lit is ${b.toFixed(0)} from the base (${ORGAN_MIN_STEP}..${LIT_MAX_STEP})`);
    assert.ok(lum(lit) > lum(base) && lum(shade) < lum(base), `${id} ${organ}: lit lighter, shade darker`);
    assert.ok(c > Math.max(a, b), `${id} ${organ}: the outer tones are furthest apart`);
    assert.ok(lum(lit) <= LIT_MAX_LUMA, `${id} ${organ}: lit is not near white (luma ${lum(lit).toFixed(2)})`);
  }
});

test('organ against organ: the cel bases are 2D\'s own, so no pair is closer than 2D makes it (the close ones are printed, not changed)', () => {
  const close: string[] = [];
  for (const id of LOOK_IDS) for (let i = 0; i < CEL_ORGANS.length; i++) for (let j = i + 1; j < CEL_ORGANS.length; j++) {
    const A = CEL_ORGANS[i]!, B = CEL_ORGANS[j]!;
    const d = sum(celBase(id, A), celBase(id, B)), d2d = sum(rgbOf(ORGAN_TONES_2D[id].tones[TOKEN_OF[A]][1]), rgbOf(ORGAN_TONES_2D[id].tones[TOKEN_OF[B]][1]));
    assert.ok(Math.abs(d - d2d) < 1e-6, `${id} ${A}/${B}: as 2D`);
    if (d < 45) close.push(`${id}: ${A} / ${B} ${d.toFixed(0)}`);
  }
  console.log(`pairs 2D itself makes close (sum of channel differences < 45; bowel and colon are one 2D tone, \`gut\`):\n  ${close.join('\n  ')}`);
  assert.ok(close.length >= 0);
});

test('the lit tone has no gloss: it never leans on og-light (white), and the cel block has no rim light or sheen', () => {
  assert.ok(O.TONES.LIT_K <= 1.3 && O.TONES.LIT_MAX <= 0.9, 'lit is a modest step of the organ\'s own hue, never toward og-light');
  const cel = ORGAN_FS.slice(ORGAN_FS.indexOf('// Cel shaded: the wash'), ORGAN_FS.indexOf('float a = mix(layer')).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(cel, /rim|smoothstep\(0\.62|dot\(side|spec/i, 'the wash\'s rim light and the depth light are replaced, not added to, by the cel tones');
  assert.ok(cel.indexOf('fill = mix(fill, cel, solid);') > 0, 'the cel tones replace the wash\'s fill at solid 1');
});

test('the gut\'s art (the small bowel\'s loops, the colon\'s haustra) wears the cel bands: the organ shader publishes the shift and the art takes it, in the gut and nowhere else it is not painted', () => {
  assert.match(ORGAN_FS, /vec3 celDelta = vec3\(0\.0\);/);
  assert.match(ORGAN_FS, /celDelta = \(cel - base\) \* solid;/);
  const wash = ORGAN_FS.slice(ORGAN_FS.indexOf('void main()'), ORGAN_FS.indexOf('// Cel shaded: the wash'));
  assert.doesNotMatch(wash, /celDelta/, 'the wash never sets it: see-through is exactly as it was');
  const p = patchedShaders('void main() {}', ORGAN_FS, 'void main() {}', 'void main() {}', { art: true, eso: null, fade: true });
  assert.match(p.fs, /ac = clamp\(ac \+ celDelta, 0\.0, 1\.0\);/);
  assert.ok(p.fs.indexOf('vec3 celDelta') < p.fs.indexOf('void main_organ'), 'declared before it is used');
  assert.ok(p.fs.indexOf('celDelta, 0.0') < p.fs.indexOf('mix(page, ac, artState.y)'), 'the shift comes before the dim toward the page');
});

test('the cel organ line is bold: wide, and the look\'s casing ink, opaque', () => {
  assert.ok(O.LINE_PX >= 3 && O.LINE_MIN_CSS >= 2.5 && O.LINE_ALPHA === 1, 'bold, at least 2.5 CSS px, fully opaque');
  assert.match(ORGAN_INK_VS, /px \/ max\(wpc/, 'the width is in figure units');
});

test('the gut\'s cel art is calm: the bowel is a few broad loops by rule, the colon only thin even haustra lines; the rest normal is smoothed to unit length', async () => {
  const { smoothRestNormals } = await import('../src/scene/organs/cel-normal.ts');
  const { haustraOf, BOWEL_LOOPS } = await import('../src/scene/organs/organ-art-paint.ts');
  const { readFileSync } = await import('node:fs');
  assert.ok(BOWEL_LOOPS >= 6 && BOWEL_LOOPS <= 9, 'six to nine broad loops');
  const d = JSON.parse(readFileSync(new URL('../public/anatomy/organ-art.json', import.meta.url), 'utf8')) as { arts: Record<string, never> };
  const classes = new Set<string>();
  const walk = (n: { kids?: unknown[]; c?: string }): void => { if (n.kids) n.kids.forEach((k) => walk(k as never)); else classes.add(n.c!); };
  haustraOf(d.arts.colon as never).kids.forEach((k) => walk(k as never));
  assert.deepEqual([...classes], ['cel-line'], 'no fills, no shade, no rim, no ao: one ink line');
  // a jagged normal field over a small grid comes out smoother and unit
  const pos: number[] = [], nor: number[] = [], idx: number[] = [], W = 6;
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) { pos.push(x, y, 0); const a = ((x * 7 + y * 3) % 5) * 0.3; nor.push(Math.sin(a), 0, Math.cos(a)); }
  for (let y = 0; y < W - 1; y++) for (let x = 0; x < W - 1; x++) { const i = y * W + x; idx.push(i, i + 1, i + W, i + 1, i + W + 1, i + W); }
  const out = smoothRestNormals(pos, nor, idx);
  const spread = (a: ArrayLike<number>) => { let lo = Infinity, hi = -Infinity; for (let i = 0; i < a.length; i += 3) { lo = Math.min(lo, a[i]!); hi = Math.max(hi, a[i]!); } return hi - lo; };
  assert.ok(spread(out) < spread(nor) * 0.5, 'smoother');
  for (let i = 0; i < out.length; i += 3) assert.ok(Math.abs(Math.hypot(out[i]!, out[i + 1]!, out[i + 2]!) - 1) < 1e-5);
});
