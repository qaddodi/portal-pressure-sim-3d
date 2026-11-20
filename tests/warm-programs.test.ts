// Program warm-up: three keys a ShaderMaterial's program on `transparent` whether or not the shader reads it, so a vessel or junction skin that flips it at run time (a free end fading, an arm behind the organs, the Circuit's
// tubes fading as the map comes in) asked the driver for a program the page had never built, mid-motion: the first Anatomy to Circuit change stuck for seconds. materials/warm.ts compiles each in its other state at boot.
// Run: node --test tests/warm-programs.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { BoxGeometry, Group, Mesh, MeshBasicMaterial, PerspectiveCamera, ShaderMaterial } from 'three';
import { blendWarmups, markBlends, warmPrograms, type WarmRenderer } from '../src/scene/materials/warm.ts';

const sm = (fs: string, defines: Record<string, number> = {}, transparent = false): ShaderMaterial => new ShaderMaterial({ vertexShader: 'void main(){}', fragmentShader: fs, defines, transparent });
const mesh = (m: ShaderMaterial | MeshBasicMaterial): Mesh => new Mesh(new BoxGeometry(), m);

test('blendWarmups: one mesh per distinct program among the marked materials; unmarked ones and stock ones are left alone', () => {
  const root = new Group();
  const a = markBlends(sm('void main(){}')), a2 = markBlends(sm('void main(){}')), b = markBlends(sm('void main(){}', { VEIL: 1 })), c = markBlends(sm('void main(){}', {}, true)), plain = sm('void main(){}');
  for (const m of [a, a2, b, c, plain]) root.add(mesh(m));
  root.add(mesh(new MeshBasicMaterial()));
  const got = blendWarmups(root).map((w) => w.mat);
  assert.equal(got.length, 3, 'a, b and c (a2 is the same program as a; the plain and stock ones are not marked)');
  assert.ok(got.includes(a) && got.includes(b) && got.includes(c));
  assert.ok(!got.includes(plain));
});

test('warmPrograms: the whole scene first, then each marked program in its other state, and the flag is back before the call returns control to a frame', async () => {
  const root = new Group(), a = markBlends(sm('void main(){}')), c = markBlends(sm('void main(){}', {}, true)), ma = mesh(a), mc = mesh(c);
  root.add(ma, mc);
  const log: string[] = [];
  const gl: WarmRenderer = {
    compileAsync: async () => { log.push('async'); },
    compile: (o) => { const m = (o as Mesh).material as ShaderMaterial; log.push(`compile ${o === ma ? 'a' : 'c'} transparent=${m.transparent}`); },
  };
  let gaps = 0;
  const n = await warmPrograms(gl, root, new PerspectiveCamera(), async () => { gaps++; assert.equal(a.transparent, false, 'between two compiles no flag is left flipped'); assert.equal(c.transparent, true); });
  assert.equal(n, 2);
  assert.deepEqual(log, ['async', 'compile a transparent=true', 'compile c transparent=false']);
  assert.equal(gaps, 2);
  assert.equal(a.transparent, false); assert.equal(c.transparent, true);
});

test('warmPrograms puts the flag back when a compile throws', async () => {
  const root = new Group(), a = markBlends(sm('void main(){}'));
  root.add(mesh(a));
  const gl: WarmRenderer = { compileAsync: async () => undefined, compile: () => { throw new Error('driver'); } };
  await assert.rejects(warmPrograms(gl, root, new PerspectiveCamera(), async () => undefined), /driver/);
  assert.equal(a.transparent, false);
});

const src = (p: string): string => readFileSync(new URL(`../src/${p}`, import.meta.url), 'utf8');

test('every material whose transparent flag is flipped while the page runs is marked, and the boot warm-up is warmPrograms', () => {
  // vessel tubes, their veil copies and every junction skin copy flip at run time (setTipFade, setCavaEnd, setCavaCut, setTransparent) ...
  const vo = src('scene/vessels/vessel-object.ts'), so = src('scene/vessels/skin/skin-object.ts');
  assert.match(vo, /const toon = markBlends\(new ShaderMaterial\(/);
  assert.match(vo, /const mat = markBlends\(new ShaderMaterial\(\{ vertexShader: this\.toon\.vertexShader/, 'the veil copy');
  assert.match(so, /const material = markBlends\(new ShaderMaterial\(\{\s*name: 'skin'/, 'the three skin copies (the Circuit\'s too: one class)');
  assert.match(so, /setTransparent\(on: boolean\)/);
  assert.match(src('scene/Stage.tsx'), /warmPrograms\(gl as unknown as WarmRenderer, cel\.scene, cel\.rig\.camera\)/);
  // ... and no other file assigns it after construction: a new runtime flip must be marked (or listed here with why it is fixed)
  const FIXED = new Set(['scene/materials/cel.ts', 'scene/organs/layer.ts', 'scene/micro3d/sinusoid3d.ts', 'scene/micro3d/lobule3d.ts', 'scene/devices/device-object.ts', 'scene/materials/warm.ts']);
  const walk = (d: string): string[] => readdirSync(new URL(`../src/${d}`, import.meta.url)).flatMap((f) => { const p = `${d}/${f}`; return statSync(new URL(`../src/${p}`, import.meta.url)).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : []; });
  const flippers = walk('scene').filter((p) => /\.transparent = /.test(src(p))).filter((p) => !FIXED.has(p) && p !== 'scene/vessels/vessel-object.ts' && p !== 'scene/vessels/skin/skin-object.ts');
  assert.deepEqual(flippers, [], 'a file that flips `transparent` at run time must mark its material (markBlends) so the other program is warmed');
});
