// WP1: the organs are 2D's quiet wash: the copied --og-* tones, laid on the page at the organ layer's opacity, outlined in their own third tone, never black.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pinned2D } from './two-d-pin.ts';
import { execFileSync } from 'node:child_process';
import { PALETTES, LOOK_IDS, luminance } from '../src/scene/palette.ts';
import { ORGAN_STYLE, organLayerAlpha } from '../src/scene/organs/layer.ts';
import { ORGAN_FS, ORGAN_VS } from '../src/scene/organs/organ-shader.ts';
import { mix, rgbOf } from '../src/scene/organs/organ-look.ts';
import { BoxGeometry, type BufferGeometry } from 'three';
import { readFileSync } from 'node:fs';
import { OrganLayer } from '../src/scene/organs/layer.ts';
import { createShared } from '../src/scene/materials/cel.ts';
import { INK_FS } from '../src/scene/materials/shaders.ts';
import { organsReady, setOrganData, ORGAN_MESHES } from '../src/scene/organs/meshes.ts';
import { x3, y3 } from '../src/scene/frame2d.ts';

const hex = (c: readonly number[]) => '#' + c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('');

test('the organ layer sits at 2D\'s opacity: .55, Soft .72, the kidney .85 (Soft .88), the gut at --gut-a', () => {
  assert.equal(organLayerAlpha(PALETTES.light, 'liver'), 0.72, 'Light at .72 by decision (19 Nov), not 2D .55');
  assert.equal(organLayerAlpha(PALETTES.dark, 'liver'), 0.72, 'the dark looks at .72 by decision (20 Nov, more contrast), not 2D .55');
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
  assert.match(ORGAN_FS, /gl_FragColor = vec4\(fill, lay \* fade \* win\)/, 'blended at the layer, so organs show through each other');
  assert.match(ORGAN_FS, /float lay = layer;/, 'the alpha is the layer\'s opacity (lay), raised only where the blood pool lies');
});

const twoD = pinned2D('styles/tokens.css');
test('the copied tones equal the 2D app\'s at the pin (copy-organ-tones --check)', { skip: twoD.skip }, () => {
  execFileSync('node', ['scripts/copy-organ-tones.mjs', '--from', twoD.repo, '--check'], { stdio: 'pipe' });
});

// The visual review (19 Nov): 2D's inner shade strokes (.09/.15/.24 of og-dark) stack, so the darkest rim is og-dark at 1-(.91·.85·.76) ≈ .41 of its alpha:
// .11 on Light (2D .12), .14 on Dark (2D .16); the earlier sum divided by .26 gave .48 and .65.
test('the inner shade stacks as 2D\'s strokes, at og-dark\'s own alpha, on the lower right only', () => {
  assert.match(ORGAN_FS, /1\.0 - \(1\.0 - shadeSteps\.x\) \* \(1\.0 - shadeSteps\.y\) \* \(1\.0 - shadeSteps\.z\)\) \* smoothstep\(0\.35, 1\.0, turn\)/);
  for (const id of LOOK_IDS) assert.deepEqual(PALETTES[id].organs.shade, [0.09, 0.15, 0.24], `${id}: 2D's three strokes' opacities, copied`);
  assert.match(ORGAN_FS, /ogDark\.a \* k \* lowerRight/);
  assert.doesNotMatch(ORGAN_FS, /\/ 0\.26/);
  const k = 1 - 0.91 * 0.85 * 0.76;
  assert.ok(Math.abs(PALETTES.light.organs.dark[3] * k - 0.12) < 0.02);
  assert.ok(Math.abs(PALETTES.dark.organs.dark[3] * k - 0.16) < 0.03);
});

test('the organ outline is in the figure\'s units (2D 1.1, kidney 1.4), floored at one device pixel, and the organs draw in 2D\'s order with the gut last', async () => {
  const { ORGAN_INK_VS } = await import('../src/scene/organs/organ-shader.ts');
  const { ORGAN_ORDER } = await import('../src/scene/organs/layer.ts');
  assert.match(ORGAN_INK_VS, /max\(1\.0 \/ max\(dpr, 1\.0\), \(?px( \+ hiOn \* hiPx\))? \/ max\(wpc, 1e-6\)\)/);
  assert.equal(ORGAN_STYLE.liver!.px, 1.1); assert.equal(ORGAN_STYLE['kidney-l']!.px, 1.4);
  assert.deepEqual(ORGAN_ORDER.slice(-2), ['bowel', 'colon']);
  for (const id of Object.keys(ORGAN_STYLE)) assert.ok(ORGAN_ORDER.includes(id), id);
});

// ---- WP1b: the organ's colour on screen is 2D's composite, layer by layer -----------------------------------------------------------------------------------------------------
// 2D paints an organ as a group (opaque fill, #ogVol, the inner shade strokes, the rim light; the 3D liver and stomach leave out the capsule sheen and the rim light, owner 20 Nov: too shiny) and lays the whole group on the stage at the layer's opacity.
// `twoDLiver` composes that in 2D's order from the copied numbers; `shaderLiver` runs ORGAN_FS's arithmetic on the uniforms the real OrganLayer sets, so the copy, the palette and the
// uniform plumbing are in the test as well as the maths. The 2D page's colour under the organs is --stage-bg, plain (the plate has no body shape: #backdrop is the diaphragm's line only).
type V3 = [number, number, number];
const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const lerp3 = (a: readonly number[], b: readonly number[], t: number): V3 => [a[0]! + (b[0]! - a[0]!) * t, a[1]! + (b[1]! - a[1]!) * t, a[2]! + (b[2]! - a[2]!) * t];
const c01 = (c: readonly number[]): V3 => [c[0]! / 255, c[1]! / 255, c[2]! / 255];
/** CIE L*a*b* of an sRGB triple (0..1), D65; ΔE is the plain distance (CIE76). */
function lab(c: readonly number[]): V3 {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [lin(c[0]!), lin(c[1]!), lin(c[2]!)];
  const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
const dE = (a: readonly number[], b: readonly number[]) => Math.hypot(...lab(a).map((v, i) => v - lab(b)[i]!) as V3);

interface Spot {
  /** the point in the organ's own box (0,0 top left) and in the figure's units */
  box: [number, number]; svg: [number, number];
  /** the inner shade's strokes that cover it (lower right edge: all three), and whether the rim light does */
  shade: [boolean, boolean, boolean]; rim: boolean;
}
const CENTRE = (box: [number, number], svg: [number, number]): Spot => ({ box, svg, shade: [false, false, false], rim: false });

/** 2D's liver at a spot, on a look: the group's paint in order, then the group at the layer's opacity over --stage-bg. */
function twoDLiver(look: keyof typeof PALETTES, sp: Spot): V3 {
  const og = PALETTES[look].organs, [o1, o2] = og.tones.liver, v = og.vol, over = (dst: V3, src: readonly number[], a: number) => lerp3(dst, c01(src), a);
  // the gradient from the box's (.15,0) to (.85,1) in the box's own units
  const t = clamp01(((sp.box[0] - 0.15) * 0.7 + sp.box[1] * 1.0) / (0.7 * 0.7 + 1));
  let c = lerp3(rgbOf(o1), rgbOf(o2), t);
  const r = Math.hypot(sp.box[0] - v.cx, sp.box[1] - v.cy) / v.r;
  c = over(c, v.light, v.light[3] * (1 - clamp01(r / v.lightEnd)));
  c = over(c, og.volShade, v.shadeA * clamp01((r - v.shadeStart) / (1 - v.shadeStart)));
  sp.shade.forEach((on, i) => { if (on) c = over(c, og.dark, og.dark[3] * og.shade[i]!); });
  // (2D's rim light and capsule sheen are not on the 3D liver: too shiny, owner 20 Nov)
  // (the layer's opacity is the look's own: Light's is Mohammad's .72, richer than 2D's .55 (palette.ts LIGHT_ORGAN_LAYER); every other look's is 2D's)
  return lerp3(rgbOf(PALETTES[look].bg), c, PALETTES[look].organLayer);
}

type U = Record<string, { value: any }>;   // eslint-disable-line @typescript-eslint/no-explicit-any
/** ORGAN_FS's arithmetic, on a material's uniforms, at a spot (the dither, the vertex paint and the live derivative aside): the colour blended on the page at the layer's opacity. */
function shaderOrgan(u: U, page: V3, sp: Spot, turnRim = 0.95): V3 {
  const rgb = (x: { r: number; g: number; b: number }): V3 => [x.r, x.g, x.b];
  const ss = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
  const t = clamp01(((sp.box[0] - 0.15) * 0.7 + sp.box[1]) / (0.7 * 0.7 + 1));
  let fill = lerp3(rgb(u.o1!.value), rgb(u.o2!.value), t);
  const vl = u.volLight!.value, vs = u.volShade!.value, vg = u.volGeo!.value;
  const r = Math.hypot(sp.box[0] - vg.x, sp.box[1] - vg.y) / vg.z;
  fill = lerp3(fill, [vl.x, vl.y, vl.z], vl.w * (1 - clamp01(r / vg.w)));
  fill = lerp3(fill, [vs.x, vs.y, vs.z], vs.w * clamp01((r - u.volShadeAt!.value) / (1 - u.volShadeAt!.value)));
  // the inner shade (the lower right edge: its three steps all on) and the rim light (the upper left)
  const sh = u.shadeSteps!.value, on = sp.shade.map((b) => (b ? 1 : 0));
  const k = 1 - (1 - sh.x * on[0]!) * (1 - sh.y * on[1]!) * (1 - sh.z * on[2]!), dk = u.ogDark!.value;
  fill = lerp3(fill, [dk.x, dk.y, dk.z], dk.w * k * (on.some(Boolean) ? ss(-0.35, 0.65, 1) : 0));
  const lg = u.ogLight!.value;
  if (sp.rim) fill = lerp3(fill, [lg.x, lg.y, lg.z], lg.w * u.rimK!.value * ss(0.62, 0.8, turnRim));   // (rimK is 0 on the liver)
  return lerp3(page, fill, u.layer!.value);
}

const liverBox = (() => {
  const b = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
  setOrganData(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  return organsReady.then(() => { const g = ORGAN_MESHES.liver!(); g.computeBoundingBox(); return g.boundingBox!.clone(); });
})();

async function liverLayer(look: keyof typeof PALETTES): Promise<{ u: U; seat: U | undefined; at: (fx: number, fy: number) => { box: [number, number]; svg: [number, number] } }> {
  const bb = await liverBox;
  const meshes: Record<string, () => BufferGeometry> = {};
  for (const id of Object.keys(ORGAN_STYLE)) meshes[id] = id === 'liver' ? ORGAN_MESHES.liver! : () => new BoxGeometry(0.4, 0.3, 0.1);
  const layer = new OrganLayer(createShared(), meshes);
  layer.applyLook(PALETTES[look]); layer.update(0);   // (these terms are the see-through fill's: the cel fill replaces them)
  const w = bb.max.x - bb.min.x, h = bb.max.y - bb.min.y;
  const at = (fx: number, fy: number) => ({ box: [fx, fy] as [number, number], svg: [700 + 300 * (bb.min.x + fx * w), 556 - 300 * (bb.max.y - fy * h)] as [number, number] });
  const o = layer.byId.get('liver')!;
  const seat = o.group.children.map((c) => (c as { material?: { uniforms?: U } }).material?.uniforms).find((m) => m && m.px && m.inkA && m !== o.ink.uniforms && m.color && !m.inflate);
  return { u: o.toon.uniforms as U, seat, at };
}

for (const look of ['light', 'soft', 'dark'] as const) {
  test(`WP1b ${look}: the liver's centre, and its lower right inner shade land on 2D's composite (ΔE well under 6)`, async () => {
    const { u, at } = await liverLayer(look), page = rgbOf(PALETTES[look].bg);
    const centre = CENTRE(...(Object.values(at(0.5, 0.5)) as [[number, number], [number, number]]));
    const rimSpot: Spot = { ...centre, box: [0.8, 0.9], shade: [true, true, true] };
    for (const [name, sp] of [['centre', centre], ['lower right shade', rimSpot]] as const) {
      const a = twoDLiver(look, sp), b = shaderOrgan(u, page, sp);
      assert.ok(dE(a, b) < 2, `${look} ${name}: 2D ${hex(a)}, 3D ${hex(b)}, ΔE ${dE(a, b).toFixed(2)}`);
    }
  });
}

test('WP1b: the liver on Light and Dark is not the washed blob: its centre is the composite of 2D\'s layers; and it has no sheen and no rim light (too shiny)', async () => {
  for (const look of ['light', 'dark'] as const) {
    const { u, at } = await liverLayer(look), page = rgbOf(PALETTES[look].bg);
    const c = at(0.5, 0.5), centre = shaderOrgan(u, page, CENTRE(c.box, c.svg));
    assert.ok(dE(twoDLiver(look, CENTRE(c.box, c.svg)), centre) < 6, `${look}: ΔE to 2D's centre`);
    assert.equal(u.rimK!.value, 0, `${look}: no rim light on the liver`);
    assert.equal(u.sheenK, undefined, `${look}: no capsule sheen`);
  }
  assert.doesNotMatch(ORGAN_FS, /sheen/i);
});

test('WP1b: the rim light (og-light on the upper left edge) is off on the liver (and its caudate lobe, the liver\'s own dome), the stomach and the duodenum, 2D\'s on the others, in the see-through fill', () => {
  const layer = new OrganLayer(createShared(), Object.fromEntries(Object.keys(ORGAN_STYLE).map((id) => [id, () => new BoxGeometry(0.4, 0.3, 0.1)])));
  layer.applyLook(PALETTES.light); layer.update(0);
  for (const id of Object.keys(ORGAN_STYLE)) {
    const rim = layer.byId.get(id)!.toon.uniforms.rimK!.value;
    if (['liver', 'caudate', 'stomach', 'duodenum'].includes(id)) assert.equal(rim, 0, id); else assert.ok(rim > 0, id);
  }
  layer.dispose();
});

test('WP1b: Dark\'s #ogVol light is --light-ink at .22 as 2D draws it (it was --og-light at .14 × .22 / .55, a quarter of it)', async () => {
  const { u } = await liverLayer('dark');
  assert.deepEqual(u.volLight!.value.toArray(), [1, 1, 1, 0.22]);
  assert.match(ORGAN_FS, /volLight\.a \* \(1\.0 - clamp\(r \/ volGeo\.w/);
  assert.doesNotMatch(ORGAN_FS, /0\.22 \/ 0\.55/);
});

test('WP1b: the soft AO seat (.org-ao): round every plain organ at --og-ao under the layer\'s opacity, none on the atrium or the gut', async () => {
  const { seat } = await liverLayer('dark');
  assert.ok(seat, 'the liver has an AO seat');
  assert.ok(Math.abs(seat!.inkA!.value - 0.3 * PALETTES.dark.organLayer) < 1e-9, `Dark: .3 at the layer's opacity, got ${seat!.inkA!.value}`);
  assert.equal(seat!.px!.value, 4.5, 'the 9-unit stroke\'s outer half');
  for (const id of Object.keys(ORGAN_STYLE)) assert.equal(!!ORGAN_STYLE[id]!.ao, ['heart', 'liver', 'spleen', 'stomach', 'kidney-l'].includes(id), id);
  const layer = new OrganLayer(createShared(), Object.fromEntries(Object.keys(ORGAN_STYLE).map((id) => [id, () => new BoxGeometry(0.4, 0.3, 0.1)])));
  layer.applyLook(PALETTES.light); layer.update(0);
  assert.ok(layer.byId.get('heart-ra')!.toon.uniforms.shadeSteps!.value.x < 0.06, 'the atrium\'s inner shade is its own, faint');
  assert.equal(layer.byId.get('heart-ra')!.group.children.length, 2, 'no AO seat on the atrium');
  assert.equal(layer.byId.get('bowel')!.group.children.length, 2, 'none on the gut');
  layer.dispose();
});

test('WP1b: #ogVol and the AO seat: the terms are in the shader and the seat shows', async () => {
  for (const term of [/volLight\.a \* \(1\.0 - clamp\(r \/ volGeo\.w, 0\.0, 1\.0\)\)/, /\(1\.0 - volShadeAt\), 0\.0, 1\.0\)/]) assert.match(ORGAN_FS, term);
  const bb = await liverBox, meshes: Record<string, () => BufferGeometry> = {};
  for (const id of Object.keys(ORGAN_STYLE)) meshes[id] = id === 'liver' ? ORGAN_MESHES.liver! : () => new BoxGeometry(0.4, 0.3, 0.1);
  assert.ok(bb);
  const layer = new OrganLayer(createShared(), meshes);
  const seatOf = () => layer.byId.get('liver')!.group.children.find((c) => c.name === 'org-ao') as unknown as { visible: boolean; material: { uniforms: U } };
  layer.applyLook(PALETTES.dark); layer.update(0);
  assert.ok(seatOf().visible && seatOf().material.uniforms.inkA!.value > 0.1, 'see-through: the seat shows');
  layer.dispose();
});

// Review 21 Nov, #16 (close-up organ rims read as concentric bands): the inner shade is ONE monotonic ramp reaching the strokes' stacked total at the rim, and the AO seat is one soft halo, not a flat band.
test('the inner shade is one smooth monotonic ramp that matches the three strokes\' plateaus and total; the seat falls off from the outline to nothing at its outer edge', () => {
  assert.doesNotMatch(ORGAN_FS, /smoothstep\(0\.45 - w/);
  const ss = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const kMax = 1 - 0.91 * 0.85 * 0.76, k = (t: number) => kMax * ss(0.35, 1, t);
  let last = k(0);
  for (let t = 0; t <= 1.0001; t += 0.01) { assert.ok(k(t) >= last - 1e-12, 'never steps back'); assert.ok(k(t) - last < 0.02, `no jump at turn ${t.toFixed(2)}`); last = k(t); }
  assert.ok(Math.abs(k(1) - kMax) < 1e-9, 'the rim is the stack\'s total');
  for (const [t, plateau] of [[0.56, 1 - 0.91], [0.77, 1 - 0.91 * 0.85], [0.93, kMax]] as const) assert.ok(Math.abs(k(t) - plateau) < 0.075, `turn ${t}: ${k(t).toFixed(3)} near the stack's ${plateau.toFixed(3)}`);
  const layer = new OrganLayer(createShared(), Object.fromEntries(Object.keys(ORGAN_STYLE).map((id) => [id, () => new BoxGeometry(0.4, 0.3, 0.1)])));
  const seat = [...(layer as unknown as { seats: Map<string, { defines?: Record<string, unknown> }> }).seats.values()];
  assert.ok(seat.length > 0, 'the organs with a seat');
  for (const m of seat) assert.ok('INK_SEAT' in (m.defines ?? {}) && 'INK_EDGE' in (m.defines ?? {}), 'the seat is a soft halo');
  assert.match(INK_FS, /#ifdef INK_SEAT[\s\S]*cov \*= 2\.0 \* sk \* sk \* \(3\.0 - 2\.0 \* sk\)/);
});
