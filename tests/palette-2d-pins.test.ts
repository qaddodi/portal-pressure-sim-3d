// 2D's colours the figure paints with, held against the 2D app's own tokens (src/ui/styles/tokens.css is the copy the app ships): the ground the renderer clears to, the ascites' straw, the vessels'
// casing and light rim. A number that drifts from the tokens fails here, not on a phone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Color, LinearSRGBColorSpace, SRGBColorSpace } from 'three';
import { LOOK_IDS, PALETTES, type LookId } from '../src/scene/palette.ts';
import { groundFor } from '../src/scene/ground.ts';
import { CelScene } from '../src/scene/scene.ts';
import { ASCITES_INK, AscitesLayer, DEEP_AT, POOL_ROWS, ROW_DEPTHS, SURFACE_SHARE, fluidTone } from '../src/scene/disease/ascites.ts';
import { CASING, CASING_2D, RIM_A, RIM_INK } from '../src/scene/vessels/cel-ink.ts';
import { CEL_STYLE } from '../src/scene/cel-style.ts';
import { sceneSource } from './helpers/scene-source.ts';

const css = readFileSync(new URL('../src/ui/styles/tokens.css', import.meta.url), 'utf8');
/** The text of every block whose header line is `header {`. */
function blocks(header: string): string[] {
  const lines = css.split('\n'), out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]!.trim() !== `${header} {`) continue;
    let j = i + 1; const body: string[] = [];
    while (j < lines.length && !/^\s*\}\s*$/.test(lines[j]!)) body.push(lines[j++]!);
    out.push(body.join('\n'));
  }
  return out;
}
/** A token's value in the first of the blocks that sets it. */
function token(bs: readonly string[], name: string): string | null {
  for (const b of bs) { const m = b.match(new RegExp(`${name.replace(/[-]/g, '\\-')}:\\s*([^;]+);`)); if (m) return m[1]!.trim(); }
  return null;
}
const HEADERS: Record<LookId, string[]> = {
  light: [':root'], soft: [':root[data-theme="soft"]', ':root'], dark: [':root[data-theme="dark"]'],
  navy: [':root[data-theme="dark"][data-palette="navy"]', ':root[data-theme="dark"]'], black: [':root[data-theme="dark"][data-palette="black"]', ':root[data-theme="dark"]'],
};
const tok = (look: LookId, name: string): string => {
  for (const h of HEADERS[look]) { const v = token(blocks(h), name); if (v !== null) return v; }
  assert.fail(`${look}: ${name} is not in tokens.css`);
};
const rgbOf = (hex: string): [number, number, number] => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };

test('the ground the renderer clears to is the page\'s own colour: straight to the canvas and into the anti-aliasing pass\'s texture, to the byte', () => {
  for (const id of LOOK_IDS) {
    const hex = PALETTES[id].bg, want = rgbOf(hex);
    // the canvas: three converts the colour from its linear working space to sRGB when it clears (the output colour space)
    const direct = groundFor(new Color(hex), false), o = { r: 0, g: 0, b: 0 };
    direct.getRGB(o, SRGBColorSpace);
    assert.deepEqual([o.r, o.g, o.b].map((v) => Math.round(v * 255)), want, `${id}: canvas`);
    // a render target: three writes the working space's numbers as they are, and the pass writes the canvas those numbers
    const into = groundFor(new Color(hex), true);
    into.getRGB(o, LinearSRGBColorSpace);
    assert.deepEqual([o.r, o.g, o.b].map((v) => Math.round(v * 255)), want, `${id}: texture`);
  }
});

test('the scene clears to the page\'s ground into the pass\'s texture and to the converted one on the canvas', () => {
  const s = new CelScene();
  for (const id of LOOK_IDS) {
    s.applyLook(id);
    const want = rgbOf(PALETTES[id].bg), o = { r: 0, g: 0, b: 0 };
    s.clearColor(true).getRGB(o, LinearSRGBColorSpace);
    assert.deepEqual([o.r, o.g, o.b].map((v) => Math.round(v * 255)), want, `${id}: into the texture`);
    s.clearColor(false).getRGB(o, SRGBColorSpace);
    assert.deepEqual([o.r, o.g, o.b].map((v) => Math.round(v * 255)), want, `${id}: on the canvas`);
  }
  const src = sceneSource();
  assert.match(src, /gl\.setClearColor\(this\.clearColor\(this\.post\.on\)\)/, 'the frame asks for the ground that goes where the figure is drawn');
});

test('the ascites is 2D\'s straw in every look: --ascites at --ascites-a, never a mustard of its own', () => {
  for (const id of LOOK_IDS) {
    assert.equal(ASCITES_INK[id].hex.toLowerCase(), tok(id, '--ascites').toLowerCase(), `${id} colour`);
    assert.equal(ASCITES_INK[id].a, parseFloat(tok(id, '--ascites-a')), `${id} alpha`);
    const [r, g, b] = rgbOf(ASCITES_INK[id].hex);
    assert.ok(b / r > 0.4 && b / r < 0.6 && g / r > 0.8, `${id}: a pale straw (blue ${b}, red ${r}), not an orange`);
  }
});

test('the ascites pool is painted as 2D\'s fluidAt paints it: see-through at the surface, the whole ink by 28 units under, a pale meniscus on top, one mesh', () => {
  const ink: [number, number, number] = [0.8, 0.6, 0.4];
  const top = fluidTone(ink, 0.4, 0), deep = fluidTone(ink, 0.4, DEEP_AT);
  assert.ok(Math.abs(top[3] - 0.4 * SURFACE_SHARE) < 1e-9, 'the surface carries .55 of the ink');
  assert.ok(Math.abs(deep[3] - 0.4) < 1e-9, 'the whole ink at depth');
  assert.ok(top[0] > ink[0] && top[2] > ink[2] && top[2] - ink[2] > 0.45 * (1 - ink[2]) - 1e-9, 'the meniscus is the ink 45 % toward white');
  assert.deepEqual(deep.slice(0, 3).map((v) => +v.toFixed(3)), ink, 'and gone by the bottom row');
  assert.ok(fluidTone(ink, 0.4, ROW_DEPTHS[2]!)[3] < 0.4, 'the rows between lie on the ramp');
  const a = new AscitesLayer();
  assert.equal(a.group.children.length, 2, 'one hull: its back sheet and its front sheet and lid, no second band over the first');
  for (const id of LOOK_IDS) {
    a.applyLook(id); a.set(6000);
    const pos = (a.group.children[1] as unknown as { geometry: { getAttribute(n: string): { array: Float32Array } } }).geometry.getAttribute('position').array, NT = 20;
    assert.ok(pos[48 * NT * 3 + 1]! !== 0 && pos[(48 * NT + NT - 1) * 3 + 1]! < pos[48 * NT * 3 + 1]!, `${id}: the columns reach the geometry (the pool was once written to a copy and never drawn), the surface above the floor`);
    const u = ((a.group.children[1] as unknown as { material: { uniforms: { uInk: { value: { x: number; y: number; z: number } }; uInkA: { value: number } } } }).material).uniforms;
    const [r, g, b] = rgbOf(ASCITES_INK[id].hex);
    assert.ok(Math.abs(u.uInk.value.x * 255 - r) < 1 && Math.abs(u.uInk.value.y * 255 - g) < 1 && Math.abs(u.uInk.value.z * 255 - b) < 1, `${id}: the straw is the look's`);
    assert.ok(Math.abs(u.uInkA.value - ASCITES_INK[id].a) < 1e-6, `${id}: at its alpha`);
  }
  a.dispose();
});

test('the vessels\' ink is 2D\'s casing (rgb and alpha per look), held at the figure\'s least alpha; the light rim is 2D\'s: white at --vessel-rim-a', () => {
  for (const id of LOOK_IDS) {
    const rgb = tok(id, '--casing-rgb').split(/\s+/).map(Number);
    assert.deepEqual([...CASING_2D[id].rgb], rgb, `${id} ink`);
    assert.equal(CASING_2D[id].a, parseFloat(tok(id, '--casing-a')), `${id} alpha`);
    assert.deepEqual([...CASING[id].rgb], rgb, `${id}: the shader's ink is the token's`);
    assert.equal(CASING[id].a, Math.max(CASING_2D[id].a, CEL_STYLE.INK_ALPHA_MIN), `${id}: never fainter than the figure's ink`);
    assert.equal(RIM_A[id], parseFloat(tok(id, '--vessel-rim-a')), `${id} rim`);
  }
  assert.equal(RIM_INK.toUpperCase(), tok('light', '--light-ink').toUpperCase());
});
