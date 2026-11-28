// One blood: the stomach's pool wears the colour of the bleeding jet (disease/paint.ts bloodColour), and the pool fills the stomach's lumen.
(globalThis as { location?: unknown }).location = { search: '', pathname: '/', hostname: 'localhost' };
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry } from 'three';
import type { CelShared } from '../src/scene/materials/cel.ts';
import { paletteFor } from '../src/scene/palette.ts';
import { LOOK_IDS } from '../src/looks/looks.ts';
import { OrganLayer } from '../src/scene/organs/layer.ts';
import { rgbOf } from '../src/scene/organs/organ-look.ts';
import { poolSurfaceY } from '../src/scene/organs/pool-level.ts';
import { LUMEN_BOTTOM, STO_Y0 } from '../src/scene/disease/copied/stomach-lumen.js';
import { BLOOD_TOKEN, bloodColour } from '../src/scene/disease/paint.ts';
import { SCOPE_TOKENS } from '../src/ui/tests/copied/scope-tokens.copied.js';
import { parseColour } from '../src/ui/charts/colour.ts';
import { bodyTargets } from '../src/scene/disease/targets.ts';
import { CelScene } from '../src/scene/scene.ts';
import { x3, y3 } from '../src/scene/frame2d.ts';
import { presetState } from './b4-presets.ts';

const shared = (s: CelScene) => (s as unknown as { shared: CelShared }).shared;

test('the pool is the jet\'s blood in every look: the wash plus the pool\'s delta lands on bloodColour', async () => {
  const t = bodyTargets((await presetState('cirr-decomp')).frame, {}, null);
  for (const look of LOOK_IDS) {
    const s = new CelScene(), palette = paletteFor(look);
    const o = new OrganLayer(shared(s), { stomach: () => new BoxGeometry(0.5, 1.2, 0.1, 3, 30, 1).translate(x3(850), y3(400), 0) });
    o.applyLook(palette); o.setBlood(bloodColour());
    o.setBody({ ...t, bleed: { active: true, site: 'VAR', rate: 90, total: 900 } }, true);
    for (let i = 0; i < 160; i++) o.update(1000 + i * 33);
    const u = o.byId.get('stomach')!.toon.uniforms;
    const c = u.color!.value as { r: number; g: number; b: number }, d = u.poolDelta!.value as { x: number; y: number; z: number };
    const want = bloodColour();
    assert.ok(Math.abs(c.r + d.x - want[0]) < 0.01 && Math.abs(c.g + d.y - want[1]) < 0.01 && Math.abs(c.b + d.z - want[2]) < 0.01, `${look}: the pool is bloodColour`);
    o.dispose(); s.dispose?.();
  }
  assert.ok(rgbOf('#8E1A20')[0] > 0, 'the old fixed maroon is only the fallback of a layer used alone');
});

test('a full pool fills half the lumen at most, and a fuller one stands higher, never lower', () => {
  assert.ok(poolSurfaceY(1) > STO_Y0 + 8, 'full is no longer the top of the lumen');
  assert.ok(poolSurfaceY(0.12) > poolSurfaceY(0.5) && poolSurfaceY(0.5) > poolSurfaceY(1), 'the surface only rises with the fill');
  assert.ok(poolSurfaceY(0) >= LUMEN_BOTTOM, 'empty is at the bottom of the lumen');
});

test('the pool is the jet\'s material: below the surface it is the blood\'s cel (shade to colour), not the wash moved toward red', async () => {
  const { poolShade } = await import('../src/scene/organs/pool-level.ts');
  const wash = [0.9, 0.75, 0.68], blood = [0.8, 0.25, 0.18], shade = [0.5, 0.12, 0.09], light = [1, 0.95, 0.9];
  const at = (b: number, dU = 40) => poolShade(wash, 0.6, { dU, lobe: 0, amount: 1, flow: 0.8, delta: [-0.1, -0.5, -0.5], light, cel: { blood, shade, b } });
  const lit = at(1).fill, dim = at(0).fill;
  for (let i = 0; i < 3; i++) {
    assert.ok(lit[i]! <= blood[i]! + 1e-9 && lit[i]! > blood[i]! * 0.9, 'the lit band is the blood\'s colour (a little deepened, never the wash)');
    assert.ok(dim[i]! <= shade[i]! + 1e-9 && dim[i]! > shade[i]! * 0.9, 'the dark band is its shade');
  }
  assert.deepEqual(at(1, -40).fill.map((v) => +v.toFixed(3)), wash, 'above the surface the wall is untouched');
  assert.equal(at(1).layer, 1, 'and the blood is opaque');
});

test('the antrum is filled to the pylorus: the funnel of the duodenum is lit by the stomach\'s own pool uniforms', async () => {
  const { readFileSync } = await import('node:fs');
  const { organsReady, setOrganData, ORGAN_MESHES } = await import('../src/scene/organs/meshes.ts');
  const { setArtData } = await import('../src/scene/organs/organ-art.ts');
  const { createShared } = await import('../src/scene/materials/cel.ts');
  const b = readFileSync(new URL('../public/anatomy/organs.bin', import.meta.url));
  setOrganData(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer);
  setArtData(JSON.parse(readFileSync(new URL('../public/anatomy/organ-art.json', import.meta.url), 'utf8')));
  await organsReady;
  const layer = new OrganLayer(createShared(), { stomach: ORGAN_MESHES.stomach, duodenum: ORGAN_MESHES.duodenum }), palette = paletteFor('light');
  layer.applyLook(palette); layer.setBlood(bloodColour());
  const t = bodyTargets((await presetState('cirr-decomp')).frame, {}, null);
  layer.setBody({ ...t, bleed: { active: true, site: 'VAR', rate: 90, total: 900 } }, true);
  for (let i = 0; i < 160; i++) layer.update(1000 + i * 33);
  const st = layer.byId.get('stomach')!.toon.uniforms, du = layer.byId.get('duodenum')!.toon.uniforms;
  for (const k of ['poolA', 'poolLand', 'poolDelta', 'poolBlood', 'poolShadeC']) assert.equal(du[k], st[k], `${k}: one pool across the stomach and the antrum`);
  assert.ok((du.poolA!.value as { z: number }).z > 0.9, 'and it is on');
  const want = bloodColour(), got = du.poolBlood!.value as { x: number; y: number; z: number };
  assert.ok(Math.abs(got.x - want[0]) < 0.01 && Math.abs(got.y - want[1]) < 0.01 && Math.abs(got.z - want[2]) < 0.01, 'in the jet\'s blood');
});

test('one blood token: the scope\'s red is the stream\'s, the splash\'s and the stomach\'s, in every look', async () => {
  const { readFileSync } = await import('node:fs');
  // the scope view draws its blood from SCOPE_TOKENS[BLOOD_TOKEN] (ui/tests/endo/bleed.ts), which is tokens.css's --scope-blood-pool-top
  const css = readFileSync(new URL('../src/ui/styles/tokens.css', import.meta.url), 'utf8');
  const hit = new RegExp(`--${BLOOD_TOKEN}:\\s*([^;]+);`).exec(css);
  assert.ok(hit, 'the token is in tokens.css');
  const tok = parseColour(hit![1]!.trim()), scope = parseColour((SCOPE_TOKENS as Record<string, string>)[BLOOD_TOKEN]!), blood = bloodColour();
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(tok[i]! - scope[i]!) < 1e-9 && Math.abs(scope[i]! - blood[i]!) < 1e-9, 'tokens.css, the scope\'s copy and the 3D blood are one colour');
  assert.ok(readFileSync(new URL('../src/ui/tests/endo/bleed.ts', import.meta.url), 'utf8').includes(`'${BLOOD_TOKEN}'`), 'the scope draws its pool with that token');
  // the jet (stream, spray, splash and lens are one mesh) wears it in every look
  for (const look of LOOK_IDS) {
    const s = new CelScene(), palette = paletteFor(look);
    const { BleedLayer } = await import('../src/scene/disease/bleed.ts');
    const layer = new BleedLayer(shared(s));
    layer.applyLook(look, palette);
    layer.set({ active: true, site: 'VAR', rate: 90, total: 600 }, 0.05, true, 0.5);
    const c = (layer as unknown as { obj: { toon: { uniforms: { color: { value: { r: number; g: number; b: number } } } } } }).obj.toon.uniforms.color.value;
    assert.ok(Math.abs(c.r - blood[0]) < 0.01 && Math.abs(c.g - blood[1]) < 0.01 && Math.abs(c.b - blood[2]) < 0.01, `${look}: the jet is the scope's blood`);
    layer.dispose(); s.dispose?.();
  }
});
