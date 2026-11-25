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
import { sceneSource } from './helpers/scene-source.ts';

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

test('the soft cirrhosis looks (cel8..cel11): defined, cel15 the default, bands eased and dome wall rounded', async () => {
  assert.equal(DEFAULT_CEL, 'cel15', 'the cartoon, outline-led nodules are the standing cirrhotic liver');
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
  const scene = sceneSource();
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

test('cel13 (no longer the default): distinct rounded nodules (not a grid), soft shade, no line, a bumpy but smooth rim', async () => {
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

test('cel14, the standing look: nodular by its outline, a faint soft relief on the face, mixed sizes, nothing drawn between', async () => {
  const c = CELS.cel14!;
  assert.ok(c.height && c.ink === 0 && c.micro && c.micro.size < c.size / 1.8, 'a height field of macro lumps and smaller ones');
  assert.ok(c.shade <= 0.12, `the face is faint (shade ${c.shade})`);
  assert.ok(c.rim >= 1.5, `the outline is strongly lumpy (rim ${c.rim})`);
  (globalThis as { location?: unknown }).location = { search: '?liver=cel14', pathname: '/', hostname: 'localhost' };
  const m = await import(`../src/scene/organs/liver-texture.ts?${'cel14'}`);
  let sep = 0, sum = 0, n = 0, step = 0, prev = m.surfaceAt(330, 300), levels = new Set<number>(), tall = 0;
  for (let x = 330.25; x < 880; x += 0.25) {
    const s = m.surfaceAt(x, 300); sep += s.sep; sum += Math.abs(s.light); n++; step = Math.max(step, Math.abs(s.dome - prev.dome)); prev = s; levels.add(Math.round(s.light * 40)); if (s.dome > 0.9) tall++;
  }
  assert.equal(sep, 0, 'no wall, no line');
  assert.ok(sum / n < 0.5, `faint: the mean light on the face is ${(sum / n).toFixed(2)} of full`);
  assert.ok(levels.size > 15, 'continuous light, not bands');
  assert.ok(step < 0.15, `rounded, no wall (${step.toFixed(3)} per quarter unit)`);
  assert.ok(tall > 0, 'the lumps reach their full height');
  // the outline follows the broad lumps with a little of the small ones: in 0..1 and varied along a run of the rim
  let lo = 1, hi = 0; for (let x = 330; x < 880; x += 2) { const r = m.rimDomeAt(x, 150); lo = Math.min(lo, r); hi = Math.max(hi, r); assert.ok(r >= 0 && r <= 1); }
  assert.ok(hi - lo > 0.5, `the rim height varies from lump to valley (${lo.toFixed(2)}..${hi.toFixed(2)})`);
  // the baked texture: no septum, a varied light
  const t: Uint8Array = m.bake(); let sepMax = 0, bMin = 255, bMax = 0;
  for (let i = 0; i < t.length; i += 4 * 97) { sepMax = Math.max(sepMax, t[i]!); bMin = Math.min(bMin, t[i + 2]!); bMax = Math.max(bMax, t[i + 2]!); }
  assert.equal(sepMax, 0); assert.ok(bMax - bMin > 40, `the light varies (${bMin}..${bMax})`);
  delete (globalThis as { location?: unknown }).location;
});

test('cel15, the cartoon look: rounded valleys (smooth maximum), three clean bands, the previous look still reachable', async () => {
  const c = CELS.cel15!, p = CELS.cel14!;
  assert.ok(c.height && c.cartoon && (c.blend ?? 0) > 0, 'a height field, blended, in cartoon bands');
  assert.ok(!p.cartoon && !p.blend, 'cel14 stays as it was');
  const at = (look: string): { search: string; pathname: string; hostname: string } => ({ search: `?liver=${look}`, pathname: '/', hostname: 'localhost' });
  const row = async (look: string, tag: string): Promise<{ kink: number; light: number[]; sep: number }> => {   // the look is read when called, so each is measured while its own flag is set
    (globalThis as { location?: unknown }).location = at(look);
    const mod = await import(`../src/scene/organs/liver-texture.ts?${tag}`);
    let kink = 0, sep = 0; const light: number[] = [];
    for (let y = 200; y < 300; y += 20) for (let x = 340; x < 880; x += 0.5) kink = Math.max(kink, Math.abs(mod.surfaceAt(x - 0.5, y).dome - 2 * mod.surfaceAt(x, y).dome + mod.surfaceAt(x + 0.5, y).dome));
    for (let x = 330.25; x < 880; x += 0.25) { const s = mod.surfaceAt(x, 300); sep += s.sep; light.push(s.light); }
    return { kink, light, sep };
  };
  const m15 = await row('cel15', 'cel15'), m14 = await row('cel14', 'cel14b');
  assert.ok(m15.kink < 0.06 && m14.kink < 0.1, `valleys are rounded, no crease or cliff (second difference ${m15.kink.toFixed(3)} / cel14 ${m14.kink.toFixed(3)})`);
  // the light: three plateaus (shade, body, lit), each held for most of the row, the edges between them narrow and eased
  let shade = 0, body = 0, lit = 0, jump = 0, prev = m15.light[0]!; const n = m15.light.length;
  for (const l of m15.light) { if (l < -0.8) shade++; else if (l > 0.8) lit++; else if (Math.abs(l) < 0.05) body++; jump = Math.max(jump, Math.abs(l - prev)); prev = l; }
  assert.equal(m15.sep, 0, 'no wall, no line');
  assert.ok(shade > 0 && body / n > 0.3 && lit > 0, `three tones: shade ${shade}, body ${body}, lit ${lit} of ${n}`);
  assert.ok(jump < 0.8, `the band edges are eased, not a step (${jump.toFixed(2)} per quarter unit)`);
  delete (globalThis as { location?: unknown }).location;
});

test('the liver shape is displaced along the SMOOTHED rest normals (the raw ones jag along the rim)', async () => {
  const fs = await import('node:fs'); const src = fs.readFileSync(new URL('../src/scene/organs/layer.ts', import.meta.url), 'utf8');
  assert.match(src, /new LiverShape\(.*getAttribute\('hullN'\)/);
});

test('root cause of the abrupt transitions: the dome height is continuous where two nodules of different size meet (no cliff along the border), in the height looks', async () => {
  for (const look of ['cel14', 'cel15']) {
    (globalThis as { location?: unknown }).location = { search: `?liver=${look}`, pathname: '/', hostname: 'localhost' };
    const m = await import(`../src/scene/organs/liver-texture.ts?${'cont' + look}`);
    let worst = 0;
    for (let y = 180; y < 330; y += 7) { let p = m.surfaceAt(340, y).dome; for (let x = 340.2; x < 880; x += 0.2) { const d = m.surfaceAt(x, y).dome; worst = Math.max(worst, Math.abs(d - p)); p = d; } }
    assert.ok(worst < 0.1, `${look}: the dome never steps (largest step ${worst.toFixed(3)} per 0.2 unit)`);
  }
  delete (globalThis as { location?: unknown }).location;
});
