// One program per blend-capable material: three keys a ShaderMaterial's program on `transparent` (the OPAQUE define: transparent false AND NormalBlending), so a vessel or skin that flipped it at run time asked the driver for a
// program the page had never built, mid-motion. materials/warm.ts marks such materials with CustomBlending (the key is then constant) and flips them with setBlendState.
// Run: node --test tests/warm-programs.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { BoxGeometry, CustomBlending, Group, Mesh, NormalBlending, OneFactor, PerspectiveCamera, ShaderMaterial, ZeroFactor } from 'three';
import { markBlends, setBlendState, warmPrograms, WARM_SLICE_MS, type WarmRenderer } from '../src/scene/materials/warm.ts';

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

test('every material whose transparent flag is flipped while the page runs is marked, and the boot warm-up is warmPrograms', async () => {
  // vessel tubes, their veil copies and every junction skin copy flip at run time (setTipFade, setCavaEnd, setCavaCut, setTransparent), only through setBlendState ...
  // (read off the made scene, not off the constructor's spelling: a wrapper round markBlends, markVesselStencil of plan 18, broke the old grep and changed nothing the check is for)
  const { CelScene } = await import('../src/scene/scene.ts');
  const scene = new CelScene();
  const seen = new Map<string, number>(), bad: string[] = [];
  scene.scene.traverse((o) => {
    const m = (o as Mesh).material as ShaderMaterial | ShaderMaterial[] | undefined;
    for (const x of Array.isArray(m) ? m : m ? [m] : []) {
      if (!/^(vessel toon|vessel veil|skin)$/.test(x.name)) continue;
      seen.set(x.name, (seen.get(x.name) ?? 0) + 1);
      if (x.userData.blends !== true || x.blending !== CustomBlending) bad.push(`${o.name || '?'} (${x.name})`);
    }
  });
  assert.ok((seen.get('vessel toon') ?? 0) > 50, `the vessel tubes were found (${seen.get('vessel toon') ?? 0})`);
  assert.deepEqual(bad, [], 'a tube, its veil copy or a skin copy that flips `transparent` is marked by markBlends (one program for both states)');
  scene.dispose?.();
  const so = src('scene/vessels/skin/skin-object.ts'), vo = src('scene/vessels/vessel-object.ts');
  assert.match(so, /markBlends\(new ShaderMaterial\(\{\s*name: 'skin'/, 'the three skin copies (the Circuit\'s too: one class; made when a weld is, so the default scene holds none to read)');
  assert.match(so, /setTransparent\(on: boolean\)/);
  assert.match(src('scene/Stage.tsx'), /warmPrograms\(wgl, cel\.scene, cel\.rig\.camera, cel\.post\.target\(gl\), bootBeat\)/);
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
  assert.match(src('scene/Stage.tsx'), /warmPrograms\(wgl, cel\.scene, cel\.rig\.camera, cel\.post\.target\(gl\), bootBeat\)/);
});

// The old computer stuck at "Almost there 96%" (25 Nov): with no parallel shader compile every link blocks the page, and the warm-up was ONE block, minutes on a weak
// machine, in which the cover's note and buttons could not run.
// The warm-up now compiles one material at a time and gives the page a turn after each slice of WARM_SLICE_MS, saying it is getting somewhere (`beat`).
test('warmPrograms compiles a material at a time, gives the page a turn between slices, beats, binds the target around each call, and closes with compileAsync', async () => {
  const root = new Group(), a = sm(), b = sm(), shared = sm();
  root.add(new Mesh(new BoxGeometry(), a), new Mesh(new BoxGeometry(), b), new Mesh(new BoxGeometry(), shared), new Mesh(new BoxGeometry(), shared));
  const log: string[] = [], rt = { rt: 1 };
  let cur: unknown = null, beats = 0;
  const gl: WarmRenderer = {
    getRenderTarget: () => cur, setRenderTarget: (t) => { cur = t; },
    compile: (o) => { log.push(`compile ${(o as Mesh).material === a ? 'a' : (o as Mesh).material === b ? 'b' : 'shared'} ${cur === rt ? 'rt' : 'none'}`); const t = Date.now(); while (Date.now() - t < WARM_SLICE_MS + 5); },   // (a slow link)
    compileAsync: async () => { log.push('close'); },
  };
  let turns = 0; const t0 = Date.now();
  const ticker = setInterval(() => { turns++; }, 1);   // (a timer the page could not run while one call blocked it)
  await warmPrograms(gl, root, new PerspectiveCamera(), rt, () => { beats++; });
  clearInterval(ticker);
  assert.deepEqual(log, ['compile a rt', 'compile b rt', 'compile shared rt', 'close'], 'one call per material (the shared one once), always with the figure\'s target, and the close');
  assert.equal(beats, 3, 'a beat after each slice');
  assert.ok(turns >= 1, `timers ran between the slices (${turns} in ${Date.now() - t0} ms)`);
  assert.equal(cur, null, 'the previous target is back');
});

test('a material the driver refuses does not stop the warm-up (the close says why)', async () => {
  const root = new Group();
  root.add(new Mesh(new BoxGeometry(), sm()), new Mesh(new BoxGeometry(), sm()));
  let n = 0;
  await warmPrograms({ compile: () => { if (n++ === 0) throw new Error('link failed'); }, compileAsync: async () => undefined }, root, new PerspectiveCamera());
  assert.equal(n, 2);
});
