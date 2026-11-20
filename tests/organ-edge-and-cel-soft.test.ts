// 20 Nov, Mohammad: the organ edges are jagged and the cirrhotic liver "really looks rough"; he wants it "more cartoony and less dramatic and not flat".
// Root causes pinned here: (A) the organ shade steps were cut by the mesh's own per-vertex normal (shadeN is the smoothed one); (C) the outline hull's outer edge had no coverage ramp where the canvas has no
// multisampling (ringD, INK_EDGE); (cel8..cel11) the baked bands were hard-quantised (stair-stepped once sampled) and the nodule dome had a vertical wall (a serrated rim): the soft family eases both.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ORGAN_VS, ORGAN_INK_VS } from '../src/scene/organs/organ-shader.ts';
import { INK_FS } from '../src/scene/materials/shaders.ts';
import { ORGAN_MESHES, organsReady, setOrganData } from '../src/scene/organs/meshes.ts';
import { ringDistance, refineRim, smoothSilhouette } from '../src/scene/organs/contour.ts';
import { CELS, DEFAULT_CEL } from '../src/scene/organs/liver-texture.ts';

const file = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
setOrganData(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength) as ArrayBuffer);

test('A: the shade steps are cut by the smoothed normal, mixed in by shadeK (the gut keeps its own)', () => {
  assert.match(ORGAN_VS, /attribute vec3 shadeN;/);
  assert.match(ORGAN_VS, /uniform float shadeK;/);
  assert.match(ORGAN_VS, /normalize\(mix\(normal, shadeN, shadeK\)\)/);
  assert.match(ORGAN_VS, /vN = normalize\(normalMatrix \* sn\)/);
});

test('C: the organ outline is one pixel wider and its edge ramps by distance in pixels from the rim', () => {
  assert.match(ORGAN_INK_VS, /#ifdef INK_EDGE[\s\S]*attribute float ringD;[\s\S]*varying float vRd;/);
  assert.match(ORGAN_INK_VS, /vRd = ringD;/);
  assert.match(ORGAN_INK_VS, /w \+= 1\.0 \/ max\(dpr, 1\.0\);/);
  assert.match(INK_FS, /#ifdef INK_EDGE[\s\S]*?varying float vRd;/);
  assert.match(INK_FS, /clamp\(vRd \/ max\(length\(vec2\(dFdx\(vRd\), dFdy\(vRd\)\)\), 1e-5\) - 0\.5, 0\.0, 1\.0\)/);
  assert.match(INK_FS, /\* cov\)/);
});

test('C: ringDistance is 0 on the rim, rises inward to the cap, and the liver has a rim', async () => {
  await organsReady;
  for (const id of ['liver', 'spleen', 'stomach']) {
    const g = ORGAN_MESHES[id]!(); smoothSilhouette(g); refineRim(g);
    const d = ringDistance(g);
    let zero = 0, cap = 0;
    for (const v of d) { assert.ok(v >= 0 && v <= 3); if (v === 0) zero++; if (v === 3) cap++; }
    assert.ok(zero > 20, `${id}: rim points ${zero}`);
    assert.ok(cap > d.length * 0.3, `${id}: most of the mesh is inside the feather (${cap})`);
  }
});

test('the soft cirrhosis looks (cel8..cel11): defined, cel13 the default, bands eased and dome wall rounded', async () => {
  assert.equal(DEFAULT_CEL, 'cel13', 'the soft nodules are the standing cirrhotic liver');
  for (const k of ['cel8', 'cel9', 'cel10', 'cel11']) assert.ok(CELS[k]!.soft! > 0 && CELS[k]!.raw! <= 0.6, `${k} is soft`);
  assert.equal(CELS.cel7!.soft, undefined);
  // sample each look through the real surface function (the page's address picks it: flags.ts)
  const levels = async (name: string) => {
    (globalThis as { location?: unknown }).location = { search: `?liver=${name}`, pathname: '/', hostname: 'localhost' };
    const mod = await import(`../src/scene/organs/liver-texture.ts?${name}`);
    const lights = new Set<number>(); let maxStep = 0, prev = mod.surfaceAt(330, 300).dome;
    for (let x = 330.25; x < 880; x += 0.25) { const s = mod.surfaceAt(x, 300); lights.add(Math.round(s.light * 50)); maxStep = Math.max(maxStep, Math.abs(s.dome - prev)); prev = s.dome; }
    return { lights: lights.size, maxStep };
  };
  const hard = await levels('cel7');
  assert.ok(hard.lights <= 3, `cel7 keeps its three flat bands (${hard.lights})`);
  for (const k of ['cel8', 'cel9', 'cel10', 'cel11']) {
    const soft = await levels(k);
    assert.ok(soft.lights > 6, `${k}: the light eases between bands (${soft.lights} levels)`);
    assert.ok(soft.maxStep < 0.3, `${k}: no wall in the dome (${soft.maxStep.toFixed(2)} in 0.25 units)`);
  }
  delete (globalThis as { location?: unknown }).location;
});

test('C: the outline\'s pixel is the drawing buffer\'s (scene.render hands the canvas ratio to the organs), not the screen\'s', () => {
  const scene = readFileSync(new URL('../src/scene/scene.ts', import.meta.url), 'utf8');
  assert.match(scene, /this\.disease\.organs\.setDpr\(dpr\);/);
  assert.match(readFileSync(new URL('../src/scene/organs/layer.ts', import.meta.url), 'utf8'), /setDpr\(d: number\): void \{ for \(const o of this\.objects\)/);
});

test('cel12, the subtle look: no grid, no wall, no line, soft shade in valleys and a faint lift on tops, a slow field', async () => {
  const { CELS: C, softField } = await import('../src/scene/organs/liver-texture.ts');
  const c = C.cel12!;
  assert.ok(c.field && c.ink === 0 && c.shade >= 0.15 && c.shade <= 0.25 && c.a <= 0.5 && c.raw === 0 && c.bump <= 0.2 && c.rim >= 0.5 && c.rim <= 1, 'subtle but visible numbers (a 5% shade read as no change)');
  (globalThis as { location?: unknown }).location = { search: '?liver=cel12', pathname: '/', hostname: 'localhost' };
  const m = await import(`../src/scene/organs/liver-texture.ts?${'cel12'}`);
  let lo = 1, hi = 0, maxStep = 0, prev = softField(330, 300), valley = 0, n = 0, lightMax = -1, lightMin = 1;
  for (let x = 330.5; x < 880; x += 0.5) {
    const h = softField(x, 300); lo = Math.min(lo, h); hi = Math.max(hi, h); maxStep = Math.max(maxStep, Math.abs(h - prev)); prev = h;
    const s = m.surfaceAt(x, 300); lightMax = Math.max(lightMax, s.light); lightMin = Math.min(lightMin, s.light);
    assert.equal(s.sep, 0); if (s.light < -0.05) valley++; n++;
  }
  assert.ok(hi - lo > 0.5, `the lobes use a good range (${lo.toFixed(2)}..${hi.toFixed(2)})`);
  assert.ok(maxStep < 0.04, `the field is slow: ${maxStep.toFixed(3)} in half a unit`);
  assert.ok(lightMax <= 0.35 + 1e-9 && lightMin >= -0.6 - 1e-9 && lightMax > 0.1 && lightMin < -0.3, `soft: dark to 0.6 of the shade, lift to 0.35 (${lightMin}..${lightMax})`);
  assert.ok(valley / n > 0.1 && valley / n < 0.7, `valleys are a share of the surface (${(100 * valley / n).toFixed(0)}%)`);
  delete (globalThis as { location?: unknown }).location;
});

test('cel13, the standing look: distinct rounded nodules (not a grid), soft shade, no line, a bumpy but smooth rim', async () => {
  const c = CELS.cel13!;
  assert.ok(c.ink === 0 && c.soft! > 0 && c.warp! > 0 && c.jit >= 0.2 && c.round, 'no line, eased bands, warped, jittered, round domes');
  assert.ok(c.shade >= 0.18 && c.shade <= 0.3 && c.a <= 0.5, 'soft: between cel12 (0.22) and cel7 (0.38)');
  assert.ok(c.size >= 20 && c.size <= 30 && c.size > CELS.cel7!.size * 3, 'broad nodules, far larger than the cobbles');
  (globalThis as { location?: unknown }).location = { search: '?liver=cel13', pathname: '/', hostname: 'localhost' };
  const m = await import(`../src/scene/organs/liver-texture.ts?${'cel13'}`);
  // nodule clumps along a row: runs of dome above zero, separated by a gap of valley (dome 0)
  const count = (y: number): { n: number; at: number[] } => {
    let n = 0, up = false; const at: number[] = [];
    for (let x = 330; x < 880; x += 0.5) { const d = m.surfaceAt(x, y).dome; if (!up && d > 0.02) { up = true; n++; at.push(x); } else if (up && d <= 0.0) up = false; }
    return { n, at };
  };
  const a = count(300), b = count(323);
  assert.ok(a.n >= 8 && a.n <= 40, `nodule clumps along a row: ${a.n}`);
  assert.notDeepEqual(a.at.slice(0, 5).map((v) => Math.round(v % c.size)), b.at.slice(0, 5).map((v) => Math.round(v % c.size)), 'not a grid: two rows do not line up');
  let sep = 0, lo = 1, hi = -1, step = 0, prev = m.surfaceAt(330, 300).dome;
  for (let x = 330.25; x < 880; x += 0.25) { const s = m.surfaceAt(x, 300); sep += s.sep; lo = Math.min(lo, s.light); hi = Math.max(hi, s.light); step = Math.max(step, Math.abs(s.dome - prev)); prev = s.dome; }
  assert.equal(sep, 0, 'no wall, no line'); assert.ok(lo < -0.5 && hi > 0.2, `shade and a faint lit shoulder (${lo}..${hi})`); assert.ok(step < 0.3, `no wall in the dome (${step.toFixed(2)})`);
  delete (globalThis as { location?: unknown }).location;
});
