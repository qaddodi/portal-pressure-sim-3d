// The lobule's one dissolve (Mohammad 20 Nov 2026, Sinusoid -> Lobule: "you're fading in/out the lymph first then the blood vessels ... the lobule blood vessels are flashing briefly"):
// every tile, tube, mark and the marks plate go at ONE fade value, by ONE screen pattern, and nothing is scaled by that value a second time. Root cause: the flow marks were given
// `k * fade` ON TOP of the tube's own pixel dissolve, so they went as the fade squared, and the lymph's weaker marks (0.4) before the blood's: the lymph first, the vessels after.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ShaderMaterial } from 'three';
import { createShared } from '../src/scene/materials/cel.ts';
import { LobuleView } from '../src/scene/lobule/view.ts';
import { Lobule3D } from '../src/scene/micro3d/lobule3d.ts';
import { LOBULE_PLATE_FS } from '../src/scene/lobule/plate.ts';
import { LobuleFade, LobuleRoot, readsFade } from '../src/scene/lobule/one-fade.ts';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, Points, PointsMaterial } from 'three';

const shared = createShared();
const flat = new LobuleView(shared);
const l3 = new Lobule3D(flat, shared);
l3.buildForTest('light');
flat.setVisible(true);

const FLOW = ['uFlowK', 'uFlowStreak', 'uFlowHead', 'uDustK'] as const;
const snapshot = () => l3.partsForTest.map((p) => ({ name: p.toonMesh.name, u: FLOW.map((k) => (p.mats.toon.uniforms[k] as { value: number } | undefined)?.value) }));

test('one fade value reaches every part of the lobule and its marks plate', () => {
  const fades = new Set<object>();
  for (const p of l3.partsForTest) for (const m of [p.mats.toon, p.mats.ink]) if (m) fades.add(m.uniforms.fade as object);
  fades.add((l3 as unknown as { marksMat: ShaderMaterial }).marksMat.uniforms.fade as object);
  assert.equal(fades.size, 1, 'tiles, tubes (blood, lymph, bile), mouths and the marks plate all read one uniform');
  assert.match(LOBULE_PLATE_FS, /if \(fadedOut\(\)\) discard;/, 'the marks plate drops the same pixels of the same pattern, not an alpha of its own');
});

test('the flow marks are not scaled by the fade a second time: the lymph, the bile and the blood keep their own strengths however far the lobule has dissolved', () => {
  l3.update(true, 0, 1000, 1); l3.update(true, 0, 1016, 1);
  const whole = snapshot();
  for (const under of [0.2, 0.5, 0.8]) {
    l3.update(true, under, 1032, 1);
    const part = snapshot();
    assert.deepEqual(part, whole, `at ${under} of the way under, every mark strength is what it is whole`);
  }
  assert.ok(whole.some((p) => p.u.some((v) => (v ?? 0) > 0)), 'there are marks to compare');
});

test('no mark, wash or tone in the lobule scene multiplies by its fade', () => {
  const src = readFileSync('src/scene/micro3d/lobule3d.ts', 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(src, /\*\s*this\.fade\.value|this\.fade\.value\s*\*/, 'nothing is scaled by the fade a second time');
  assert.doesNotMatch(src, /opacity!?\.value\s*=\s*fs/, 'the marks plate has no alpha fade of its own');
});

test('the neighbours\' plate (the yellow tissue round the lobule) goes under the sinusoid on the same curve as the tiles and the vessels, not as a hard switch of its own (Mohammad 20 Nov: "the yellow plate appears first before blood vessels")', async () => {
  const { LOBULE_FIELD_FS } = await import('../src/scene/lobule/field.ts');
  assert.match(LOBULE_FIELD_FS, /gl_FragColor = vec4\(col, a \* fade\);/, 'the plate\'s alpha is scaled by the lobule\'s dissolve');
  for (const under of [0, 0.25, 0.5, 0.75, 0.99]) {
    l3.update(true, under, 2000 + under * 100, 1);
    assert.ok(Math.abs(flat.field.fadeNow - (1 - under > 0.98 ? 1 : 1 - under)) < 1e-9, `the plate is at ${(1 - under).toFixed(2)} when the lobule is, at ${under} under`);
  }
  // and the tiles read the same number (the field's own breadth is not part of it)
  l3.update(true, 0.5, 3000, 1);
  assert.equal(flat.field.fadeNow, 0.5);
  const src = readFileSync('src/scene/micro3d/lobule3d.ts', 'utf8');
  assert.match(src, /f\.group\.setFade\(/);
});

// ---- the rule is structural: one place hands the fade to everything under the Lobule root (Mohammad 20 Nov 2026: every flash was a layer with a fade of its own) -------------------------------------

const everything = (root: Group) => { const o: { name: string; type: string; mats: unknown[] }[] = []; root.traverse((x) => { const m = (x as Mesh).material; if (m) o.push({ name: x.name, type: x.type, mats: Array.isArray(m) ? m : [m] }); }); return o; };

test('walking the whole Lobule scene graph: every mesh and material under the root reads the lobule\'s one fade, and the walk finds the tiles, tubes, plate, neighbours and halo', () => {
  l3.update(true, 0.3, 4000, 1);
  const seen = everything(flat.group);
  const names = seen.map((s) => s.name);
  for (const must of ['lobule/field', 'lobule/mark', 'lobule3d/marks', 'lobule3d/hepatocytes', 'lobule3d/sinusoids-0', 'lobule3d/arteriole-twigs', 'lobule3d/terminal-lymphatics', 'lobule3d/lymph-channels', 'lobule3d/canaliculi', 'lobule3d/central-vein-scar']) assert.ok(names.includes(must), `${must} is under the Lobule root`);
  assert.ok(seen.length >= 25, `the walk covers the whole graph (${seen.length} drawn objects)`);
  assert.deepEqual(flat.fade.unfaded(flat.group), [], 'nothing under the Lobule root has a fade of its own');
  // and the values they read are the ones written through the root, nothing else
  const detail = flat.fade.detail, ground = flat.fade.ground;
  for (const { mats } of seen) for (const m of mats as ShaderMaterial[]) {
    const u = m.uniforms?.fade ?? (m.userData as { oneFade?: unknown }).oneFade;
    assert.ok(u === detail || u === ground, 'a material holds the root\'s detail or ground fade object');
  }
  flat.group.setFade(0.37, 0.61);
  assert.equal(detail.value, 0.37); assert.equal(ground.value, 0.61);
  const field = flat.group.children.find((c) => c.name === 'lobule/field') as Mesh;
  assert.equal((field.material as ShaderMaterial).uniforms.fade!.value, 0.61, 'the neighbours\' ground reads the ground fade');
  assert.equal(l3.partsForTest[0]!.mats.toon.uniforms.fade!.value, 0.37, 'the tiles read the detail fade');
});

test('anything added later, to the root or to a group deep inside it, is taken into the fade: a new layer cannot have a fade of its own', () => {
  const fade = new LobuleFade(), root = new LobuleRoot(fade);
  const shader = (src: string) => new ShaderMaterial({ fragmentShader: src, uniforms: {} });
  const ok = new Mesh(new BoxGeometry(), shader('uniform float fade; bool fadedOut(){return fade < 0.999;} void main(){ if (fadedOut()) discard; gl_FragColor = vec4(1.0); }')); ok.name = 'ok';
  const halo = new Mesh(new BoxGeometry(), new MeshBasicMaterial({ transparent: true })); halo.name = 'halo';
  root.add(ok, halo);
  assert.deepEqual(fade.unfaded(root), [], 'a shader that reads it and a stock material are taken in on add');
  // a rogue: a stock material hidden inside a child group, added after (the way a new layer would arrive)
  const inner = new Group(); root.add(inner);
  const rogue = new Mesh(new BoxGeometry(), new MeshStandardMaterial()); rogue.name = 'rogue'; inner.add(rogue);
  assert.deepEqual(fade.unfaded(root).map((r) => r[0]), ['rogue'], 'the walk finds the one that was not given the fade');
  root.setFade(0.5, 0.5);
  assert.deepEqual(fade.unfaded(root), [], 'and the next write of the fade takes it in');
  assert.equal((rogue.material as MeshStandardMaterial).userData.oneFade, fade.detail);
  // a shader that never reads the fade is refused even though it holds the uniform
  const blind = new Mesh(new BoxGeometry(), shader('void main(){ gl_FragColor = vec4(1.0); }')); blind.name = 'blind';
  root.add(blind);
  assert.deepEqual(fade.unfaded(root), [['blind', 'its fragment shader never reads the fade']]);
  const pts = new Points(new BoxGeometry(), new PointsMaterial()); pts.name = 'pts'; inner.add(pts); root.setFade(1, 1);
  assert.equal(fade.unfaded(root).filter((r) => r[0] === 'pts').length, 0, 'points and lines are covered too');
  assert.ok(readsFade('if (fadedOut()) discard;') && readsFade('gl_FragColor = vec4(col, a * fade);') && !readsFade('// fade\nvoid main(){}'));
});

test('the stock material\'s patch scales its alpha by the same value in its program', () => {
  const fade = new LobuleFade(), root = new LobuleRoot(fade);
  const m = new MeshBasicMaterial({ transparent: true });
  root.add(new Mesh(new BoxGeometry(), m));
  const shader = { uniforms: {} as Record<string, unknown>, fragmentShader: 'void main(){\n#include <dithering_fragment>\n}' };
  (m.onBeforeCompile as (s: unknown, r: unknown) => void)(shader, null);
  assert.equal(shader.uniforms.fade, fade.detail);
  assert.match(shader.fragmentShader, /uniform float fade;[\s\S]*gl_FragColor\.a \*= fade;/);
});

test('the fade values have ONE writer: no file but one-fade.ts and the lobule\'s update writes a lobule fade, and no layer hides itself during the dive with a toggle of its own', () => {
  const lob = readFileSync('src/scene/micro3d/lobule3d.ts', 'utf8').replace(/\/\/.*$/gm, '');
  assert.equal((lob.match(/\.setFade\(/g) ?? []).length, 1, 'lobule3d.ts writes the fade once, through the root');
  assert.doesNotMatch(lob, /this\.fade\.value\s*=[^=]/, 'and never to the uniform directly');
  const field = readFileSync('src/scene/lobule/field.ts', 'utf8').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(field, /setFade|uniforms\.fade!?\.value\s*=[^=]/, 'the neighbours\' plate has no writer of its own');
  const scene = readFileSync('src/scene/scene.ts', 'utf8');
  assert.doesNotMatch(scene, /lobule\.group\.add\(/, 'the scene adds nothing to the Lobule root behind the fade\'s back (Lobule3D mounts itself, through add)');
});
