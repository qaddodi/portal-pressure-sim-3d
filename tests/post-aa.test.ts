// The anti-aliasing pass (src/scene/post-aa.ts): the mode the address asks for, the texture the figure is drawn into (the canvas's own size, made again when it changes), a refused
// program giving the plain canvas, and the order the scene draws in.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Vector2, type Material } from 'three';
import { PostAA, aaMode, AA_FS } from '../src/scene/post-aa.ts';
import { installShaderGuard } from '../src/debug/shader-guard.ts';
import { msaaFor } from '../src/scene/quality.ts';

const gl = (w: number, h: number) => ({ getDrawingBufferSize: (v: Vector2) => v.set(w, h) });

test('the address picks the mode: FXAA by default, ?aa=msaa the old multisampled canvas, ?aa=off nothing', () => {
  assert.equal(aaMode(''), 'fxaa');
  assert.equal(aaMode('?x=1'), 'fxaa');
  assert.equal(aaMode('?aa=msaa'), 'msaa');
  assert.equal(aaMode('?aa=off'), 'off');
  assert.equal(aaMode('?aa=bogus'), 'fxaa');
});

test('the pass is on only in FXAA mode; its texture is the size of the drawing buffer and is made again only when that changes', () => {
  assert.equal(new PostAA('msaa').target(gl(100, 50)), null);
  assert.equal(new PostAA('off').target(gl(100, 50)), null);
  const p = new PostAA('fxaa');
  const a = p.target(gl(786, 1704))!;
  assert.equal(a.width, 786); assert.equal(a.height, 1704);
  assert.equal(p.target(gl(786, 1704)), a, 'the same size keeps the texture');
  const b = p.target(gl(1179, 2556))!;
  assert.notEqual(b, a); assert.equal(b.width, 1179);
  const res = p.material.uniforms.resolution!.value as Vector2;
  assert.ok(Math.abs(res.x - 1 / 1179) < 1e-12 && Math.abs(res.y - 1 / 2556) < 1e-12, 'one texel, so the taps land on neighbours');
  assert.equal(b.samples, 0, 'no multisampling: that is what the pass stands in for');
  p.dispose();
});

test('a program the device refuses turns the pass off for good: the figure is drawn straight to the canvas', () => {
  const p = new PostAA('fxaa');
  assert.ok(p.target(gl(10, 10)));
  const program = {};
  const renderer = { debug: { onShaderError: null as unknown }, properties: { get: (m: Material) => (m === p.material ? { currentProgram: { program } } : {}) } };
  installShaderGuard(renderer, { traverse() {} } as never, () => undefined, () => [p.material]);
  const fn = renderer.debug.onShaderError as (gl: unknown, program: unknown, vs: unknown, fs: unknown) => void;
  const glx = { getShaderInfoLog: () => 'ERROR: 0:1: bad', getProgramInfoLog: () => '' };
  const origError = console.error; console.error = () => undefined;
  try { fn(glx, program, {}, {}); } finally { console.error = origError; }
  assert.equal(p.on, false);
  assert.equal(p.target(gl(10, 10)), null);
});

test('the scene draws both passes into the texture, then the canvas takes the filtered picture; the context is multisampled only on request', () => {
  const scene = readFileSync('src/scene/scene.ts', 'utf8');
  const at = (s: string) => scene.indexOf(s, scene.indexOf('render(gl: WebGLRenderer)'));
  assert.ok(at('this.post.target(gl)') > 0 && at('gl.setRenderTarget(into)') > at('this.post.target(gl)'));
  assert.ok(at('gl.setRenderTarget(null)') > at('cam.layers.set(VESSEL_LAYER)'), 'the canvas is back only after the vessels');
  assert.ok(at('this.post.resolve(gl)') > at('gl.setRenderTarget(null)'));
  const stage = readFileSync('src/scene/Stage.tsx', 'utf8');
  assert.match(stage, /const msaa = aaMode\(\) === 'msaa';/, '?aa=msaa multisamples at any pixel ratio (the post pass is off in that mode)');
  assert.doesNotMatch(stage, /msaaFor/);
  assert.match(stage, /warmPrograms\(gl as unknown as WarmRenderer, cel\.scene, cel\.rig\.camera, cel\.post\.target\(gl\)\)/, 'every program of the scene is built into the pass\'s target');
  assert.ok(stage.indexOf('warmPrograms(gl') < stage.indexOf('figureDrawn();'), 'before the first frame, under the splash (L3)');
  assert.match(stage, /cel\.post\.material/, 'the guard knows the pass\'s material');
  assert.deepEqual([1, 1.5, 2].map(msaaFor), [true, true, false]);
});

test('the pass is classic FXAA: four corner taps and the middle, a direction from their luma, two or four taps along it, no more than four texels', () => {
  assert.match(AA_FS, /FXAA_SPAN_MAX 4\.0/);
  assert.equal((AA_FS.match(/texture2D\(/g) ?? []).length, 9);
  assert.match(AA_FS, /lumaB < lumaMin \|\| lumaB > lumaMax/, 'a result outside the neighbours\' luma range falls back to the shorter blend');
});
