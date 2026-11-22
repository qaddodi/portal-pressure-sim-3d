// One program per blend-capable material: three keys a ShaderMaterial's program on `transparent` (the OPAQUE define: transparent false AND NormalBlending), so a vessel or skin that flipped it at run time asked the driver for a
// program the page had never built, mid-motion. materials/warm.ts marks such materials with CustomBlending (the key is then constant) and flips them with setBlendState.
// Run: node --test tests/warm-programs.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { BoxGeometry, CustomBlending, Group, Mesh, NormalBlending, OneFactor, PerspectiveCamera, ShaderMaterial, ZeroFactor } from 'three';
import { markBlends, setBlendState, warmPrograms, type WarmRenderer } from '../src/scene/materials/warm.ts';

const sm = (transparent = false): ShaderMaterial => new ShaderMaterial({ vertexShader: 'void main(){}', fragmentShader: 'void main(){}', transparent });
/** three's program key part for this flag (WebGLPrograms.getParameters: `opaque`). */
const opaqueKey = (m: ShaderMaterial): boolean => m.transparent === false && m.blending === NormalBlending && m.alphaToCoverage === false;

test('a marked material has the same program key in both blend states (opaque is constantly false), and the factors carry the state', () => {
  const m = markBlends(sm());
  assert.equal(m.blending, CustomBlending);
  assert.equal(opaqueKey(m), false);
  assert.equal(m.transparent, false); assert.equal(m.blendSrc, OneFactor); assert.equal(m.blendDst, ZeroFactor);
  setBlendState(m, true);
  assert.equal(opaqueKey(m), false); assert.equal(m.transparent, true); assert.notEqual(m.blendDst, ZeroFactor);
  setBlendState(m, false);
  assert.equal(opaqueKey(m), false); assert.equal(m.transparent, false); assert.equal(m.blendDst, ZeroFactor);
  assert.equal(opaqueKey(sm()), true, 'an unmarked material still forks (the control)');
});

test('markBlends keeps a material that is built blended blended', () => {
  const m = markBlends(sm(true));
  assert.equal(m.transparent, true); assert.notEqual(m.blendDst, ZeroFactor);
});

test('warmPrograms compiles the scene once and nothing flips a flag', async () => {
  const root = new Group(), a = markBlends(sm());
  root.add(new Mesh(new BoxGeometry(), a));
  let n = 0;
  const gl: WarmRenderer = { compileAsync: async () => { n++; } };
  await warmPrograms(gl, root, new PerspectiveCamera());
  assert.equal(n, 1); assert.equal(a.transparent, false);
});

const src = (p: string): string => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

test('every material whose transparent flag is flipped while the page runs is marked, and the boot warm-up is warmPrograms', () => {
  // vessel tubes, their veil copies and every junction skin copy flip at run time (setTipFade, setCavaEnd, setCavaCut, setTransparent), only through setBlendState ...
  const vo = src('scene/vessels/vessel-object.ts'), so = src('scene/vessels/skin/skin-object.ts');
  assert.match(vo, /const toon = markBlends\(new ShaderMaterial\(/);
  assert.match(vo, /const mat = markBlends\(new ShaderMaterial\(\{ name: 'vessel veil', vertexShader: this\.toon\.vertexShader/, 'the veil copy');
  assert.match(so, /const material = markBlends\(new ShaderMaterial\(\{\s*name: 'skin'/, 'the three skin copies (the Circuit\'s too: one class)');
  assert.match(so, /setTransparent\(on: boolean\)/);
  assert.match(src('scene/Stage.tsx'), /warmPrograms\(wgl, cel\.scene, cel\.rig\.camera, cel\.post\.target\(gl\)\)/);
  assert.doesNotMatch(vo, /\.transparent = /, 'vessel-object flips only through setBlendState');
  assert.doesNotMatch(so, /\.transparent = /, 'skin-object flips only through setBlendState');
  // ... and no other file assigns it after construction: a new runtime flip must be marked (or listed here with why it is fixed)
  const FIXED = new Set(['scene/materials/cel.ts', 'scene/organs/layer.ts', 'scene/micro3d/sinusoid3d.ts', 'scene/micro3d/lobule3d.ts', 'scene/devices/device-object.ts', 'scene/materials/warm.ts']);
  const walk = (d: string): string[] => readdirSync(new URL(`../src/${d}`, import.meta.url)).flatMap((f) => { const p = `${d}/${f}`; return statSync(new URL(`../src/${p}`, import.meta.url)).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : []; });
  const flippers = walk('scene').filter((p) => /\.transparent = /.test(src(p))).filter((p) => !FIXED.has(p));
  assert.deepEqual(flippers, [], 'a file that flips `transparent` at run time must mark its material (markBlends) and flip it with setBlendState');
});

test('warmPrograms compiles with the figure\'s render target bound (programs are keyed on the output colour space), and puts the previous target back before any frame', async () => {
  const log: string[] = [], rt = { rt: 1 };
  let cur: unknown = null;
  const gl: WarmRenderer = {
    getRenderTarget: () => cur,
    setRenderTarget: (t) => { cur = t; log.push(t === rt ? 'bind rt' : 'bind none'); },
    compileAsync: async () => { log.push(`compile with ${cur === rt ? 'rt' : 'none'}`); },
  };
  const p = warmPrograms(gl, new Group(), new PerspectiveCamera(), rt);
  assert.deepEqual(log, ['bind rt', 'compile with rt', 'bind none'], 'the target is only held across the synchronous compile call');
  await p;
  const l2: string[] = [];
  await warmPrograms({ compileAsync: async () => { l2.push('compile'); } }, new Group(), new PerspectiveCamera());
  assert.deepEqual(l2, ['compile'], 'with no target nothing is bound');
});

test('Stage warms into the post pass\'s target', () => {
  assert.match(src('scene/Stage.tsx'), /warmPrograms\(wgl, cel\.scene, cel\.rig\.camera, cel\.post\.target\(gl\)\)/);
});
