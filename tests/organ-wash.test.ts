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

test('the organ painter is cel: no layer blend, the vertex paint kept, the dive fades it without dots', () => {
  assert.doesNotMatch(ORGAN_FS, /if \(fadedOut\(\)\)/, 'the dive fades the layer, no dots');
  assert.match(ORGAN_FS, /vInk - color/);
  assert.match(ORGAN_VS, /attribute vec3 ink/);
  assert.match(ORGAN_FS, /gl_FragColor = vec4\(fill, fade \* win\)/, 'opaque: organs hide each other by depth, not by a blend');
});

const twoD = pinned2D('styles/tokens.css');
test('the copied tones equal the 2D app\'s at the pin (copy-organ-tones --check)', { skip: twoD.skip }, () => {
  execFileSync('node', ['scripts/copy-organ-tones.mjs', '--from', twoD.repo, '--check'], { stdio: 'pipe' });
});

test('the organ outline is in the figure\'s units (2D 1.1, kidney 1.4), floored at one device pixel, and the organs draw in 2D\'s order with the gut last', async () => {
  const { ORGAN_INK_VS } = await import('../src/scene/organs/organ-shader.ts');
  const { ORGAN_ORDER } = await import('../src/scene/organs/layer.ts');
  assert.match(ORGAN_INK_VS, /max\(1\.0 \/ max\(dpr, 1\.0\), \(?px( \+ hiOn \* hiPx\))? \/ max\(wpc, 1e-6\)\)/);
  assert.equal(ORGAN_STYLE.liver!.px, 1.1); assert.equal(ORGAN_STYLE['kidney-l']!.px, 1.4);
  assert.deepEqual(ORGAN_ORDER.slice(-2), ['bowel', 'colon']);
  for (const id of Object.keys(ORGAN_STYLE)) assert.ok(ORGAN_ORDER.includes(id), id);
});

// ---- the cel fill: three authored tones, one quantised signal, opaque, its own ink --------------------------------------------------------------------------------------------------
import { CEL_STYLE } from '../src/scene/cel-style.ts';
import { CEL_LIGHT_UNIT } from '../src/scene/cel-glsl.ts';
import { Color, Vector4 } from 'three';

type U = Record<string, { value: any }>;   // eslint-disable-line @typescript-eslint/no-explicit-any
const lum = (c: { r: number; g: number; b: number }) => 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
const boxes = () => Object.fromEntries(Object.keys(ORGAN_STYLE).map((id) => [id, () => new BoxGeometry(0.4, 0.3, 0.1)])) as Record<string, () => BufferGeometry>;
const settled = (layer: OrganLayer) => { for (let t = 0; t < 4000 && layer.update(t); t += 16); };

test('every organ wears three authored tones in order, lit over base over shade, on every look: the base is the look\'s own middle and the steps are told apart', () => {
  for (const look of LOOK_IDS) {
    const layer = new OrganLayer(createShared(), boxes());
    layer.applyLook(PALETTES[look]); layer.update(0);
    for (const id of Object.keys(ORGAN_STYLE)) {
      const u = layer.byId.get(id)!.toon.uniforms as U, lit = u.o1!.value as Color, shade = u.o2!.value as Color, base = u.color!.value as Color;
      const l = lum(lit), b = lum(base), d = lum(shade);
      assert.ok(l > b && b > d, `${look} ${id}: lit ${l.toFixed(3)} > base ${b.toFixed(3)} > shade ${d.toFixed(3)}`);
      assert.ok(Math.min(l - b, b - d) >= 0.025, `${look} ${id}: each step is a visible one (${(l - b).toFixed(3)}, ${(b - d).toFixed(3)})`);
      assert.ok(Math.abs(lum({ r: (lit.r + shade.r) / 2, g: (lit.g + shade.g) / 2, b: (lit.b + shade.b) / 2 }) - b) < 0.004, `${look} ${id}: the base is halfway`);
    }
    layer.dispose();
  }
});

test('the bands: n.L of a pillow\'s face-on normal is the base tone, its shoulder toward the light is lit and the one away from it is shade, with the thresholds from cel-style.ts alone', () => {
  const { SHADE_AT, LIT_AT } = CEL_STYLE.ORGAN, L = CEL_LIGHT_UNIT;
  const nl = (n: [number, number, number]) => n[0] * L[0] + n[1] * L[1] + n[2] * L[2];
  assert.ok(SHADE_AT < nl([0, 0, 1]) && nl([0, 0, 1]) < LIT_AT, 'face on is the base');
  const toward = Math.hypot(L[0], L[1]), tilt = (deg: number): [number, number, number] => { const a = (deg * Math.PI) / 180; return [(L[0] / toward) * Math.sin(a), (L[1] / toward) * Math.sin(a), Math.cos(a)]; };
  assert.ok(nl(tilt(45)) > LIT_AT, 'turned 45 degrees toward the light is lit');
  assert.ok(nl(tilt(-45)) < SHADE_AT, 'turned 45 degrees away is shade');
  assert.ok(nl(tilt(10)) < LIT_AT && nl(tilt(-10)) > SHADE_AT, 'a gentle tilt does not change the band: the middle is wide');
  assert.ok(SHADE_AT < LIT_AT && LIT_AT - SHADE_AT > 0.4, 'the bands are wide, not a fringe');
  assert.match(ORGAN_FS, new RegExp(`const float ORG_SHADE_AT = ${String(SHADE_AT).replace('.', '\\.')};`));
  assert.match(ORGAN_FS, new RegExp(`const float ORG_LIT_AT = ${String(LIT_AT).replace('.', '\\.')};`));
  for (const f of ['src/scene/organs/organ-shader.ts', 'src/scene/organs/layer.ts']) {
    const t = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    assert.ok(!/SHADE_AT\s*[:=]\s*-?\d|LIT_AT\s*[:=]\s*\d/.test(t.replace(/CEL_STYLE\.ORGAN\.\w+/g, '')), `${f} carries no threshold of its own`);
  }
});

test('the fill is opaque and the outline is its own ink: no layer uniform, the line takes the organ\'s deep tone at its own alpha, never mixed with the page', () => {
  for (const look of ['light', 'dark'] as const) {
    const layer = new OrganLayer(createShared(), boxes());
    layer.applyLook(PALETTES[look]); layer.update(0);
    for (const [id, st] of Object.entries(ORGAN_STYLE)) {
      const o = layer.byId.get(id)!, tu = o.toon.uniforms as U, iu = o.ink.uniforms as U;
      assert.equal(tu.layer, undefined, `${id}: no see-through layer uniform`);
      assert.equal(iu.inkA!.value, st.inkA, `${id}: the line's alpha is its own`);
      const ink = iu.color!.value as Color, o3 = tu.o3!.value as Color;
      assert.deepEqual([ink.r, ink.g, ink.b], [o3.r, o3.g, o3.b], `${look} ${id}: the line is the organ's third tone as is`);
      assert.ok(o.toon.transparent && o.toon.depthWrite, `${id}: kept in 2D's draw order, writes depth`);
    }
    const a = (id: string) => (layer.byId.get(id)!.ink.uniforms as U).inkA!.value;
    assert.equal(a('liver'), CEL_STYLE.ORGAN.INK_A); assert.equal(a('heart-ra'), CEL_STYLE.ORGAN.INK_A_ATRIUM); assert.equal(a('bowel'), CEL_STYLE.ORGAN.INK_A_GUT);
    assert.ok(a('heart-ra')! < a('heart')! && a('bowel')! < a('liver')!, 'the atrium and the gut are the fainter lines');
    layer.dispose();
  }
});

test('a change of look glides: the tones, the page they sit on and the nodules\' light ease over 420 ms and end exactly on the new look; no pop, nothing eased once settled', () => {
  const layer = new OrganLayer(createShared(), boxes());
  layer.applyLook(PALETTES.light); layer.update(0); settled(layer);
  const u = layer.byId.get('liver')!.toon.uniforms as U, read = () => (u.color!.value as Color).clone(), from = read();
  layer.applyLook(PALETTES.dark);
  assert.ok(layer.update(5016), 'a frame is asked for');
  const mid = read();
  assert.ok(mid.r < from.r && mid.r > 0.05, 'one frame in it is between the looks, not on the new one');
  for (let t = 5032; t < 8000 && layer.update(t); t += 16);
  const end = read();
  const direct = new OrganLayer(createShared(), boxes());
  direct.applyLook(PALETTES.dark); direct.update(0);
  const want = (direct.byId.get('liver')!.toon.uniforms as U).color!.value as Color;
  assert.ok(Math.abs(end.r - want.r) < 1e-6 && Math.abs(end.g - want.g) < 1e-6 && Math.abs(end.b - want.b) < 1e-6, 'it lands exactly on the dark look');
  assert.equal(layer.update(9000), false, 'settled: no more frames');
  const l0 = layer.byId.get('liver')!.ink.uniforms.color!.value as Color;
  assert.ok(Math.abs(l0.r - ((direct.byId.get('liver')!.ink.uniforms as U).color!.value as Color).r) < 1e-6, 'the line eased with it');
  layer.dispose(); direct.dispose();
});

test('the same look applied again changes nothing and asks for no ease', () => {
  const layer = new OrganLayer(createShared(), boxes());
  layer.applyLook(PALETTES.light); layer.update(0); settled(layer);
  layer.applyLook(PALETTES.light);
  const moving = layer.update(7000);
  assert.equal(moving, false);
  layer.dispose();
});

test('the scarred liver keeps its cel look: the nodule texture, its septa and its dome light and shade are still in the fill, laid on every band', async () => {
  assert.match(ORGAN_FS, /texture2D\(nodTex, vRest\)/);
  assert.match(ORGAN_FS, /fill \+= sepDelta \* nt\.r;/);
  assert.match(ORGAN_FS, /nl > 0\.0 \? ogLight\.rgb : ogDark\.rgb/);
  assert.ok(ORGAN_FS.indexOf('vec3 fill = organTone(o1, o2);') < ORGAN_FS.indexOf('texture2D(nodTex, vRest)'), 'the bands first, the nodules over them');
  await liverBox;
  const meshes = boxes(); meshes.liver = ORGAN_MESHES.liver!;
  const layer = new OrganLayer(createShared(), meshes);
  layer.applyLook(PALETTES.light);
  layer.setBody({ spleenScale: 1, splenicRx: 0, bleed: { active: false, total: 0 }, cirrhosis: 1, congestion: 0, tint: 0 } as never, true);
  for (let t = 0; t < 3000; t += 16) layer.update(t);
  const u = layer.byId.get('liver')!.toon.uniforms as U;
  assert.ok(u.nodAmt!.value > 0.5, 'the scarred liver has its nodules');
  assert.ok(u.nodTex!.value && u.nodTex!.value.image && u.nodTex!.value.image.width > 1, 'its texture is baked');
  const sep = u.sepDelta!.value as { x: number; y: number; z: number };
  assert.ok(Math.hypot(sep.x, sep.y, sep.z) > 0.01, 'its septa differ from a nodule');
  layer.dispose();
});

test('the soft AO seat (.org-ao): round every plain organ at --og-ao under the layer\'s strength, none on the atrium or the gut', () => {
  const layer = new OrganLayer(createShared(), boxes());
  layer.applyLook(PALETTES.dark); layer.update(0);
  const seat = (layer.byId.get('liver')!.group.children.find((c) => c.name === 'org-ao') as unknown as { visible: boolean; material: { uniforms: U } });
  assert.ok(seat.visible && seat.material.uniforms.inkA!.value > 0.1, 'the seat shows');
  assert.ok(Math.abs(seat.material.uniforms.inkA!.value - 0.3 * PALETTES.dark.organLayer) < 1e-9, `Dark: .3 at the layer's strength, got ${seat.material.uniforms.inkA!.value}`);
  assert.equal(seat.material.uniforms.px!.value, 4.5, 'the 9-unit stroke\'s outer half');
  for (const id of Object.keys(ORGAN_STYLE)) assert.equal(!!ORGAN_STYLE[id]!.ao, ['heart', 'liver', 'spleen', 'stomach', 'kidney-l'].includes(id), id);
  assert.equal(layer.byId.get('heart-ra')!.group.children.length, 2, 'no AO seat on the atrium');
  assert.equal(layer.byId.get('bowel')!.group.children.length, 2, 'none on the gut');
  layer.dispose();
});

const liverBox = (() => {
  const b = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
  setOrganData(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength));
  return organsReady.then(() => { const g = ORGAN_MESHES.liver!(); g.computeBoundingBox(); return g.boundingBox!.clone(); });
})();
