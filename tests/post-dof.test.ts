// Depth of field in the dive (src/scene/post-dof.ts): who gets it (a pure truth table), how much (the strength with the camera's distance, the circle of confusion), where the focus plane is,
// that a phone pays nothing, that a refused program turns it off, and that its programs are registered for the glslang compile and the ?gl page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PerspectiveCamera, Plane, Raycaster, Vector2, Vector3, Vector4, WebGLRenderTarget, type Material } from 'three';
import { DOF_COPY_FS, DOF_GATHER_FS, DOF_MAX_FRAC, DOF_MIN_WIDTH, DOF_MIX_FS, DOF_SPAN, DOF_TAPS, PostDof, cocPx, dofAllowed, dofShare, planeUniform, type DofEnv } from '../src/scene/post-dof.ts';
import { PostAA } from '../src/scene/post-aa.ts';
import { installShaderGuard } from '../src/debug/shader-guard.ts';
import { GL_FILES, namedSources, rawPrograms } from '../src/debug/gl-registry.ts';

const MAC: DofEnv = { coarsePointer: false, hover: true, width: 1440, reducedMotion: false, touchMac: false };
const gl = (w: number, h: number) => ({ getDrawingBufferSize: (v: Vector2) => v.set(w, h) });

test('dofAllowed: a laptop or desktop only (truth table)', () => {
  assert.equal(dofAllowed(MAC), true, 'a Mac');
  assert.equal(dofAllowed({ ...MAC, width: DOF_MIN_WIDTH }), true, 'exactly the minimum');
  assert.equal(dofAllowed({ ...MAC, width: DOF_MIN_WIDTH - 1 }), false, 'a narrow window');
  assert.equal(dofAllowed({ ...MAC, coarsePointer: true, hover: false, width: 390 }), false, 'a phone');
  assert.equal(dofAllowed({ ...MAC, coarsePointer: true, hover: false, width: 1366 }), false, 'an iPad Pro, landscape');
  assert.equal(dofAllowed({ ...MAC, coarsePointer: true, hover: false, width: 1024 }), false, 'an iPad');
  assert.equal(dofAllowed({ ...MAC, touchMac: true }), false, 'an iPad that says it is a Mac (fine pointer from a trackpad, touch points)');
  assert.equal(dofAllowed({ ...MAC, hover: false }), false, 'no hover');
  assert.equal(dofAllowed({ ...MAC, reducedMotion: true }), false, 'reduced motion');
  assert.equal(dofAllowed({ coarsePointer: true, hover: false, width: 390, reducedMotion: true, touchMac: false }), false);
});

test('the strength: 0 while any of the body is drawn, 1 from the lobule\'s framing in, a smooth ramp between, none in Circuit', () => {
  const rest = 0.04, edge = 0.7;
  assert.equal(dofShare('lobule', rest, rest, edge), 1);
  assert.equal(dofShare('lobule', 0.001, rest, edge), 1, 'closer in (the sinusoid) is still whole');
  assert.equal(dofShare('lobule', edge, rest, edge), 0, 'the body is gone from here: it dissolves out from here');
  assert.equal(dofShare('body', 6.5, rest, edge), 0, 'every body shot');
  assert.equal(dofShare('circuit', rest, rest, edge), 0);
  assert.equal(dofShare('lobule', NaN, rest, edge), 0);
  let last = 1;
  for (let d = rest; d <= edge; d += 0.01) { const s = dofShare('lobule', d, rest, edge); assert.ok(s <= last + 1e-12, 'never grows as the camera backs out'); assert.ok(s >= 0 && s <= 1); last = s; }
  const mid = dofShare('lobule', 0.3, rest, edge); assert.ok(mid > 0 && mid < 1);
  // the way out is the same picture run back: a function of the distance, not of the view that was left
  assert.equal(dofShare('body', 0.3, rest, edge), mid);
});

test('the circle of confusion is 0 in focus, inside the slab and whenever the strength is 0; it grows with the depth off the slab and never passes its maximum', () => {
  const zf = 0.04, slab = 0.003, max = 7;
  assert.equal(cocPx(zf, zf, slab, 1, max), 0, 'in focus');
  assert.equal(cocPx(zf + slab * 0.99, zf, slab, 1, max), 0, 'inside the slab (the lobule\'s own thickness)');
  assert.equal(cocPx(zf - slab * 0.99, zf, slab, 1, max), 0);
  for (const z of [0.01, 0.02, 0.05, 0.08, 1, 100]) assert.equal(cocPx(z, zf, slab, 0, max), 0, `strength 0 at ${z}`);
  assert.equal(cocPx(0, zf, slab, 1, max), 0, 'no depth is no blur');
  let last = 0;
  for (let z = zf + slab; z < zf * 4; z += zf / 50) { const c = cocPx(z, zf, slab, 1, max); assert.ok(c >= last - 1e-12, 'farther is never sharper'); assert.ok(c <= max + 1e-9); last = c; }
  assert.equal(cocPx(zf * 100, zf, slab, 1, max), max);
  assert.ok(Math.abs(cocPx(zf * 1.6, zf, slab, 0.5, max) - 0.5 * cocPx(zf * 1.6, zf, slab, 1, max)) < 1e-12, 'the strength scales it');
  assert.ok(cocPx(zf * 0.5, zf, slab, 1, max) > cocPx(zf * 1.5, zf, slab, 1, max), 'the near side blurs faster, as a lens does');
});

test('the shader\'s circle is the same formula as cocPx, and the pass takes no more than TAPS taps', () => {
  assert.match(DOF_GATHER_FS, /float rel = max\(abs\(z - focus\.x\) - focus\.y, 0\.0\) \/ max\(z, 1e-9\);/);
  assert.match(DOF_GATHER_FS, /smoothstep\(0\.0, focus\.z, rel\) \* gate\.x \* focus\.w/);
  assert.ok(DOF_TAPS >= 8 && DOF_TAPS <= 16, 'about 8 to 16 taps');
  assert.match(DOF_GATHER_FS, new RegExp(`#define TAPS ${DOF_TAPS}\\b`));
  assert.equal((DOF_GATHER_FS.match(/for \(int i/g) ?? []).length, 1, 'one loop');
  // reads per half-size pixel: four depth taps and the middle colour, then a depth and a colour tap per disc tap
  // reads per half-size pixel: four depth taps, then (a pixel in focus stops after the middle one) a mip-filtered colour tap and a depth tap per disc tap
  assert.equal((DOF_GATHER_FS.match(/texture2D\(/g) ?? []).length, 1, 'texture2D appears once: the depth');
  assert.equal((DOF_GATHER_FS.match(/textureLod\(tSrc/g) ?? []).length, 3, 'the colour is read by level: the middle, the disc\'s own centre and the loop');
  assert.match(DOF_GATHER_FS, /if \(cMax < 0\.25\) \{ gl_FragColor = vec4\(mid, 0\.0\); return; \}/, 'a pixel in focus stops after its four depth reads and the middle');
  assert.match(DOF_GATHER_FS, /clamp\(cocOf\(uv\) - length\(off\) \+ 1\.0, 0\.0, 1\.0\)/, 'a tap counts only when its own circle reaches the pixel: ink in focus never blooms into the blur');
  assert.match(DOF_MIX_FS, /if \(w <= 0\.0\) discard;/, 'a pixel in focus is not written at all');
  assert.ok(DOF_MAX_FRAC > 0 && DOF_MAX_FRAC <= 0.01 && DOF_SPAN > 0);
});

test('the blur is smooth, with no grain (Mohammad 20 Nov: "speckled, grainy" on his iPhone): no per-pixel random angle, every colour tap reads a pre-filtered mip level', () => {
  assert.doesNotMatch(DOF_GATHER_FS, /gl_FragCoord/, 'nothing in the gather depends on which pixel it is: a per-pixel rotation of the taps (interleaved gradient noise) is exactly what made the grain');
  assert.doesNotMatch(DOF_GATHER_FS, /\bign\b|fract\(52\.98/, 'no noise function');
  assert.match(DOF_GATHER_FS, /float lod = log2\(max\(1\.0, [\d.]+ \* radius \/ sqrt\(float\(TAPS\)\)\)\);/, 'the level follows the spacing of the taps: no tap is a lone texel');
  assert.doesNotMatch(DOF_GATHER_FS, /texture2D\(tSrc|texture2D\(tColor/, 'the picture is never read at full detail inside the disc');
  assert.match(DOF_COPY_FS, /texture2D\(tFrom, vUv\)/);
  const src = readFileSync('src/scene/post-dof.ts', 'utf8');
  assert.match(src, /minFilter: LinearMipmapLinearFilter, magFilter: LinearFilter, generateMipmaps: true/, 'the half-size copy keeps its mip chain');
  // the same noise must not creep back into the figure's other soft things: the sinusoid\'s dissolve is the one dither, and it sits inside the blur
  for (const f of ['src/scene/post-dof.ts', 'src/scene/post-aa.ts', 'src/scene/lobule/field.ts']) assert.doesNotMatch(readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''), /52\.9829189/, `${f} has no noise`);
});

test('the focus plane: the distance to a plane facing +z, as the shader takes it, equals the true ray and plane distance across the picture', () => {
  const cam = new PerspectiveCamera(14, 1.6, 0.1, 100);
  cam.setViewOffset(1600, 1000, 120, -40, 1600, 1000);
  const target = [0.3, -0.2, 0.05];
  cam.position.set(0.3 + 0.9, -0.2 + 1.4, 0.05 + 2.2); cam.lookAt(...(target as [number, number, number])); cam.zoom = 1.4; cam.updateProjectionMatrix(); cam.updateMatrixWorld();
  const u = new Vector4();
  const zf = planeUniform(cam, target, u);
  assert.ok(Math.abs(zf - cam.position.distanceTo(new Vector3(...target))) < 1e-9, 'the focus is the target\'s distance from the camera');
  const plane = new Plane(new Vector3(0, 0, 1), -target[2]!);
  for (const [x, y] of [[0, 0], [0.9, 0.9], [-0.9, 0.9], [0.9, -0.9], [-0.7, -0.3], [0.2, 0.8]] as const) {
    const ray = new Raycaster(); ray.setFromCamera(new Vector2(x, y), cam);
    const hit = ray.ray.intersectPlane(plane, new Vector3())!;
    const viewZ = -hit.clone().applyMatrix4(cam.matrixWorldInverse).z;
    const t = u.w / (u.x + u.y * x + u.z * y);
    assert.ok(Math.abs(t - viewZ) < 1e-6 * Math.max(1, viewZ), `at ndc ${x}, ${y}: ${t} vs ${viewZ}`);
  }
  // straight on, the plane is one distance everywhere: nothing of it is out of focus
  const flat = new PerspectiveCamera(14, 1.6, 0.1, 100); flat.position.set(0, 0, 3); flat.lookAt(0, 0, 0); flat.updateMatrixWorld(); flat.updateProjectionMatrix();
  const f = new Vector4(); const z0 = planeUniform(flat, [0, 0, 0], f);
  assert.ok(Math.abs(f.y) < 1e-9 && Math.abs(f.z) < 1e-9);
  assert.ok(Math.abs(f.w / f.x - z0) < 1e-9);
});

test('the focus distance read back from a depth value: the projection\'s two numbers give the view distance (what the shader does with a depth texel)', () => {
  const cam = new PerspectiveCamera(30, 1.5, 0.002, 12); cam.updateProjectionMatrix();
  const e = cam.projectionMatrix.elements;
  for (const z of [0.002, 0.01, 0.5, 3, 12]) {
    const clip = new Vector4(0, 0, -z, 1).applyMatrix4(cam.projectionMatrix);
    const ndcZ = clip.z / clip.w, depth = ndcZ * 0.5 + 0.5;
    assert.ok(Math.abs(e[14]! / (depth * 2 - 1 + e[10]!) - z) < 1e-6 * z + 1e-9, `z = ${z}`);
  }
});

test('a phone or an iPad pays nothing: no depth texture on the figure\'s target, no strength, no half-size target', () => {
  const phone = new PostDof(() => true, { ...MAC, coarsePointer: true, hover: false, width: 390 });
  assert.equal(phone.wants, false);
  const cam = new PerspectiveCamera(14, 1, 0.01, 10); cam.position.set(0, 0, 1); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  assert.equal(phone.frame('lobule', cam, [0, 0, 0], 0.04, 0.04, 0.7), 0);
  const aa = new PostAA('fxaa', phone);
  const rt = aa.target(gl(1179, 2556))!;
  assert.equal(rt.depthTexture, null, 'a depth buffer as before, no texture');
  assert.equal(rt.depthBuffer, true);
  const calls: string[] = [];
  phone.run({ render: () => calls.push('render'), setRenderTarget: () => calls.push('target') }, rt);
  assert.deepEqual(calls, [], 'run does nothing without a strength');
  aa.dispose();
});

test('a Mac with the switch on gets the depth texture; the switch off, applied live, takes it away again (exactly the FXAA frame)', () => {
  let on = true;
  const dof = new PostDof(() => on, MAC);
  const aa = new PostAA('fxaa', dof);
  const a = aa.target(gl(2160, 1350))!;
  assert.ok(a.depthTexture, 'a depth texture with the stencil, for the pass to read');
  assert.equal(a.depthTexture!.image.width, 2160);
  assert.equal(aa.target(gl(2160, 1350)), a, 'the same size and the same wish keeps the target');
  on = false;
  const b = aa.target(gl(2160, 1350))!;
  assert.notEqual(b, a); assert.equal(b.depthTexture, null);
  assert.equal(dof.frame('lobule', new PerspectiveCamera(), [0, 0, 0], 0.04, 0.04, 0.7), 0, 'off is no strength');
  on = true;
  assert.ok(aa.target(gl(2160, 1350))!.depthTexture);
  aa.dispose();
});

test('frame: a strength and a focus on a Mac in the lobule; none in the body at rest, in Circuit, or with the switch off', () => {
  let on = true;
  const dof = new PostDof(() => on, MAC);
  const cam = new PerspectiveCamera(14, 1.6, 0.0008, 5); cam.position.set(0, 0, 0.04); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  assert.equal(dof.frame('lobule', cam, [0, 0, 0], 0.04, 0.04, 0.7), 1);
  assert.ok(Math.abs((dof.gather.uniforms.focus!.value as Vector4).x - 0.04) < 1e-9, 'the focus is the camera\'s target');
  assert.equal(dof.frame('sinusoid', cam, [0, 0, 0], 0.001, 0.04, 0.7), 1);
  assert.equal(dof.frame('body', cam, [0, 0, 0], 6.5, 0.04, 0.7), 0);
  assert.equal(dof.share, 0);
  assert.equal(dof.frame('circuit', cam, [0, 0, 0], 0.04, 0.04, 0.7), 0);
  on = false;
  assert.equal(dof.frame('lobule', cam, [0, 0, 0], 0.04, 0.04, 0.7), 0);
});

test('run: the copy at half size (with its mip chain), the gather, then the blend over the picture, and back on the figure\'s target', () => {
  const dof = new PostDof(() => true, MAC);
  const aa = new PostAA('fxaa', dof);
  const rt = aa.target(gl(2000, 1000))!;
  const cam = new PerspectiveCamera(14, 2, 0.001, 5); cam.position.set(0, 0.5, 1); cam.lookAt(0, 0, 0); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  assert.ok(dof.frame('lobule', cam, [0, 0, 0], 0.04, 0.04, 0.7) > 0);
  const log: string[] = []; let current: WebGLRenderTarget | null = null;
  dof.run({ setRenderTarget: (t: WebGLRenderTarget | null) => { current = t; }, render: () => log.push(current === rt ? 'full' : current ? `half ${current.width}x${current.height}` : 'canvas') } as never, rt);
  assert.deepEqual(log, ['half 1000x500', 'half 1000x500', 'full'], 'the copy and its mips, the gather, then the blend');
  assert.equal((dof.gather.uniforms.focus!.value as Vector4).w, DOF_MAX_FRAC * 1000, 'the biggest circle follows the figure\'s height');
  assert.equal(dof.gather.uniforms.tDepth!.value, rt.depthTexture);
  aa.dispose();
});

test('a program the device refuses turns the blur off for good and leaves the figure as it was', () => {
  const dof = new PostDof(() => true, MAC);
  const aa = new PostAA('fxaa', dof);
  assert.ok(aa.target(gl(100, 100))!.depthTexture);
  const program = {};
  const renderer = { debug: { onShaderError: null as unknown }, properties: { get: (m: Material) => (m === dof.gather ? { currentProgram: { program } } : {}) } };
  installShaderGuard(renderer, { traverse() {} } as never, () => undefined, () => [aa.material, ...dof.materials]);
  const fn = renderer.debug.onShaderError as (gl: unknown, program: unknown, vs: unknown, fs: unknown) => void;
  const glx = { getShaderInfoLog: () => 'ERROR: 0:1: bad', getProgramInfoLog: () => '' };
  const origError = console.error; console.error = () => undefined;
  try { fn(glx, program, {}, {}); } finally { console.error = origError; }
  assert.equal(dof.wants, false);
  assert.equal(aa.on, true, 'FXAA is untouched');
  assert.equal(aa.target(gl(100, 100))!.depthTexture, null, 'the target is back to a depth buffer');
  const calls: string[] = [];
  dof.share = 1;
  dof.run({ render: () => calls.push('render'), setRenderTarget: () => undefined }, aa.target(gl(100, 100))!);
  assert.deepEqual(calls, [], 'nothing is drawn');
  aa.dispose();
});

test('the programs are registered: the glslang compile and the ?gl page both see them', () => {
  assert.ok('scene/post-dof.ts' in GL_FILES);
  const names = rawPrograms('').map((p) => p.name);
  assert.ok(names.includes('post dof') && names.includes('post dof mix') && names.includes('post dof copy'));
  const named = new Set(namedSources().values());
  assert.ok(named.has('post dof') && named.has('post dof mix') && named.has('post dof copy'));
  for (const p of rawPrograms('').filter((q) => q.name.startsWith('post dof'))) assert.match(p.fragmentGlsl, /^#version 300 es\n/);
});

test('scene.ts: the second pass keeps the depth while the pass runs, the pass runs before the canvas takes the picture, the guard lends the materials', () => {
  const scene = readFileSync('src/scene/scene.ts', 'utf8');
  const at = (s: string) => scene.indexOf(s, scene.indexOf('render(gl: WebGLRenderer)'));
  assert.ok(at('this.post.dof.frame(') > 0 && at('this.post.target(gl)') > at('this.post.dof.frame('));
  assert.ok(at('if (!dof) { gl.clearDepth(); gl.clearStencil(); }') > at('gl.render(this.scene, cam)'), 'the depth is cleared between the passes only without the blur');
  assert.ok(at('this.post.dof.run(gl, into)') > at('cam.layers.set(VESSEL_LAYER)') && at('this.post.dof.run(gl, into)') < at('gl.setRenderTarget(null)'));
  assert.match(readFileSync('src/scene/Stage.tsx', 'utf8'), /cel\.post\.dof\.materials/);
  assert.match(scene, /DIVE_IN\);\n/, 'the strength ends where the body is gone');
});

test('the focus band: drawn without a depth texture (every device), sharp on its line and blurred off it', () => {
  const d = new PostDof(() => false, null);
  const cam = new PerspectiveCamera(40, 1, 0.1, 100); cam.position.set(0, 0, 10); cam.updateMatrixWorld(); cam.updateProjectionMatrix();
  const k = d.bandFrame(cam, new Vector3(-1, 0, 0), new Vector3(1, 0, 0), new Vector3(0, 1, 0), new Vector3(0, 2, 0), 1000, 1000, 1);
  assert.equal(k, 1);
  const band = d.gather.uniforms.band!.value as Vector4, bk = d.gather.uniforms.bandK!.value as Vector4;
  assert.ok(Math.abs(Math.abs(band.y) - 1) < 1e-9 && Math.abs(band.x) < 1e-9, 'a horizontal line: its normal is vertical');
  assert.ok(Math.abs(Math.abs(band.z) - 500) < 1e-6, 'through the middle of the picture');
  assert.ok(bk.x > 0 && bk.y > 0 && bk.z > 0, 'sharp half width, a run, a biggest circle');
  assert.equal(d.bandFrame(cam, new Vector3(), new Vector3(), new Vector3(), new Vector3(), 1000, 1000, 0), 0, 'strength 0: none');
  assert.match(DOF_GATHER_FS, /bandCoc/);
});
