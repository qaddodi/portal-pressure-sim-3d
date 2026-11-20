// Fade layers (src/scene/materials/fade-layer.ts): a part mid-fade is drawn whole into a layer and laid over the figure at one opacity, in place of the old screen-pattern dissolve.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { Group, Mesh, BoxGeometry, Scene, ShaderMaterial } from 'three';
import { FADE_LAYER, FADE_FS, FadeLayers, MAX_GROUPS, anyFading, fadeGroups, fadeLayersOn, fadeUniform, groupBit, groupOf } from '../src/scene/materials/fade-layer.ts';
import { FADE_GLSL } from '../src/scene/materials/shaders.ts';

test('fadeGroups: nearby values share a layer, never more than MAX_GROUPS, each laid at its mean', () => {
  assert.deepEqual(fadeGroups([]), []);
  assert.deepEqual(fadeGroups([0, 1, 0.0005, 0.9995]), [], 'whole and gone are not fades');
  const one = fadeGroups([0.5, 0.505, 0.51]);
  assert.equal(one.length, 1);
  assert.ok(Math.abs(one[0]!.mid - 0.505) < 1e-9);
  const two = fadeGroups([0.2, 0.8, 0.205]);
  assert.equal(two.length, 2);
  assert.ok(two[0]!.mid < two[1]!.mid, 'ascending');
  const many = fadeGroups(Array.from({ length: 40 }, (_, i) => 0.02 + i * 0.024));
  assert.ok(many.length <= MAX_GROUPS, 'forty distinct values still make at most MAX_GROUPS layers');
  for (const v of [0.05, 0.4, 0.93]) { const g = many[groupOf(many, v)]!; assert.ok(v >= g.lo - 0.05 && v <= g.hi + 0.05, 'a value lands in a layer near it'); }
  // the layers cover every value given
  const vs = [0.1, 0.3, 0.5, 0.7, 0.9, 0.95];
  const gs = fadeGroups(vs);
  for (const v of vs) { const g = gs[groupOf(gs, v)]!; assert.ok(v >= g.lo && v <= g.hi); }
});

test('groupBit: one bit per group and pass, clear of the passes\' own and the scene\'s other layers', () => {
  const seen = new Set<number>();
  for (let g = 0; g < MAX_GROUPS; g++) for (const p of [0, 1] as const) { const b = groupBit(g, p); assert.ok(b >= 16 && (b & (b - 1)) === 0 && b < 2 ** 31); assert.ok(!seen.has(b)); seen.add(b); }
});

test('anyFading sees only a fade strictly between whole and gone', () => {
  const u = fadeUniform();
  assert.equal(u.value, 1);
  assert.equal(anyFading(), false);
  u.value = 0.4; assert.equal(anyFading(), true);
  u.value = 0; assert.equal(anyFading(), false);
  u.value = 1; assert.equal(anyFading(), false);
});

const part = (fade: { value: number }, mask: number): Mesh => {
  const m = new Mesh(new BoxGeometry(), new ShaderMaterial({ uniforms: { fade, fadeLayer: FADE_LAYER } }));
  m.layers.mask = mask;
  return m;
};

test('plan: a part mid-fade is put on its layer\'s bit for the frame and set back after; at rest there is no plan and the main picture is drawn', () => {
  const scene = new Scene(), g = new Group(); scene.add(g);
  const a = fadeUniform(0.5), b = fadeUniform(1), c = fadeUniform(0.5), d = fadeUniform(0.2);
  const pa = part(a, 1), pb = part(b, 1), pc = part(c, 2), pd = part(d, 1);
  g.add(pa, pb, pc, pd);
  const fl = new FadeLayers(true);
  const plan = fl.plan(scene);
  assert.ok(plan);
  assert.equal(FADE_LAYER.value, 1, 'the main picture leaves faded parts out');
  assert.equal(plan.groups.length, 2, 'values 0.5 and 0.2');
  const ga = groupOf(plan.groups, 0.5), gd = groupOf(plan.groups, 0.2);
  assert.notEqual(ga, gd);
  assert.equal(pa.layers.mask, 1 | groupBit(ga, 0));
  assert.equal(pc.layers.mask, 2 | groupBit(ga, 1));
  assert.equal(pd.layers.mask, 1 | groupBit(gd, 0));
  assert.equal(pb.layers.mask, 1, 'a whole part is not in a layer');
  assert.deepEqual(plan.has[ga], [true, true]);
  assert.deepEqual(plan.has[gd], [true, false]);
  plan.restore();
  assert.equal(pa.layers.mask, 1); assert.equal(pc.layers.mask, 2); assert.equal(pd.layers.mask, 1);
  a.value = 1; c.value = 1; d.value = 0;
  assert.equal(fl.plan(scene), null, 'nothing mid-fade');
  assert.equal(FADE_LAYER.value, 1);
  fl.dispose();
});

test('plan: a part that is hidden is never in a layer, and a turned-off pass leaves the old dissolve', () => {
  const scene = new Scene();
  const u = fadeUniform(0.5);
  const p = part(u, 1); p.visible = false; scene.add(p);
  assert.equal(new FadeLayers(true).plan(scene), null);
  p.visible = true;
  const off = new FadeLayers(false);
  assert.equal(off.plan(scene), null);
  assert.equal(FADE_LAYER.value, 0, 'the old dissolve');
  u.value = 1;
});

test('?fade=dither turns the layers off', () => {
  assert.equal(fadeLayersOn(''), true);
  assert.equal(fadeLayersOn('?fade=dither'), false);
});

test('the shader: layer 2 draws whole, layer 1 leaves a fading part out, 0 is the old dissolve; the layer is laid at one opacity', () => {
  assert.match(FADE_GLSL, /uniform float fadeLayer;/);
  assert.match(FADE_GLSL, /fadeLayer > 1\.5\) return false;/);
  assert.match(FADE_GLSL, /fadeLayer > 0\.5\) return fade < 0\.999;/);
  assert.match(FADE_FS, /texture2D\(map, vUv\) \* opacity/);
});

// every material whose shader reads the fade (FADE_GLSL) must carry the shared uniform, or a part in it keeps the grain
test('every file that makes a material for a FADE_GLSL shader carries fadeLayer', () => {
  const walk = (d: string): string[] => readdirSync(d).flatMap((n) => { const p = join(d, n); return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : []; });
  const users = walk('src/scene').filter((f) => /FADE_GLSL/.test(readFileSync(f, 'utf8')) && !f.endsWith('materials/shaders.ts'));
  assert.ok(users.length >= 3, 'the organ, vessel and micro shaders');
  for (const f of ['src/scene/materials/cel.ts', 'src/scene/organs/layer.ts', 'src/scene/micro3d/cel3d.ts']) assert.match(readFileSync(f, 'utf8'), /fadeLayer: FADE_LAYER/, f);
  assert.match(readFileSync('src/scene/materials/cel.ts', 'utf8'), /fade: fadeUniform\(\)/);
});
