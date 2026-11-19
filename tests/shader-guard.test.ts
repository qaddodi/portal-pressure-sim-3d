// Fail loud, not invisible: a program the device's driver refuses is drawn plain, remembered, shown on the ?perf bar and named in a bug packet; and the canvas is never above 2x
// or multisampled at 2x (WP10, docs/atlas-look-plan.md sections 8.1 and 8.2). The GPU's own refusal is faked here: three.js calls renderer.debug.onShaderError(gl, program, vs, fs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Color, Group, Mesh, MeshBasicMaterial, ShaderMaterial } from 'three';
import { installShaderGuard } from '../src/debug/shader-guard.ts';
import { clearShaderFailures, shaderFailureLine, shaderFailures } from '../src/debug/shader-fail.ts';
import { perfReport } from '../src/ui/perf/report.ts';
import { FIGURE_DETAIL } from '../src/state/settings.ts';
import { MAX_FIGURE_DPR, figureDpr, msaaFor } from '../src/scene/quality.ts';

const BAD = { id: 'bad-program' }, GOOD = { id: 'good-program' };
const vessel = (defines?: Record<string, unknown>) => new ShaderMaterial({ vertexShader: 'void main(){}', fragmentShader: 'void main(){}', defines, uniforms: { color: { value: new Color(0.8, 0.2, 0.1) }, inkColor: { value: new Color(0, 0, 0) } } });
const fakeGl = { getShaderInfoLog: (s: unknown) => (s === 'vs' ? 'ERROR: 0:76: \'rk\' : redefinition' : ''), getProgramInfoLog: () => 'link failed' };

function rig() {
  const solid = vessel(), veil = vessel({ VEIL: 1 }), other = new ShaderMaterial({ vertexShader: 'void main(){}', fragmentShader: 'void main(){}', uniforms: { color: { value: new Color(0.1, 0.1, 0.1) } }, name: 'toon' });
  const meshes = [solid, veil, other].map((m) => new Mesh(new BoxGeometry(), m));
  const root = new Group(); root.add(...meshes);
  const programOf = new Map<unknown, unknown>([[solid, BAD], [veil, BAD], [other, GOOD]]);
  const renderer = { debug: { onShaderError: null as unknown }, properties: { get: (m: unknown) => ({ currentProgram: { program: programOf.get(m) } }) } };
  return { root, meshes, renderer };
}

test('a refused program is drawn plain in the part\'s own colour, its veil is not drawn, the other programs are untouched', () => {
  clearShaderFailures();
  const { root, meshes, renderer } = rig();
  let asked = 0;
  installShaderGuard(renderer, root, () => { asked++; });
  assert.equal(typeof renderer.debug.onShaderError, 'function');
  (renderer.debug.onShaderError as (...a: unknown[]) => void)(fakeGl, BAD, 'vs', 'fs');
  const m = meshes[0]!.material as unknown as MeshBasicMaterial;
  assert.ok(m.isMeshBasicMaterial, 'the vessel is a plain material now');
  const want = new Color(0.8, 0.2, 0.1).convertSRGBToLinear();
  assert.ok(Math.abs(m.color.r - want.r) < 1e-6 && Math.abs(m.color.g - want.g) < 1e-6 && Math.abs(m.color.b - want.b) < 1e-6, 'in the tone colour, shown as the sRGB value the cel shaders write');
  assert.equal(meshes[1]!.visible, false, 'a veil has no plain form: it is not drawn');
  assert.ok((meshes[2]!.material as ShaderMaterial).isShaderMaterial && meshes[2]!.visible, 'another program is left alone');
  assert.equal(asked, 1, 'a frame is asked for');
  assert.equal(shaderFailures().length, 1);
  assert.equal(shaderFailures()[0]!.kind, 'vessel');
  assert.equal(shaderFailures()[0]!.meshes, 2);
  assert.match(shaderFailures()[0]!.log, /rk.*redefinition/s);
  assert.equal(shaderFailureLine(), 'vessel shader failed: 1');
  clearShaderFailures();
});

test('a program that is not a vessel is filed under its material\'s name; the guard can be taken off', () => {
  clearShaderFailures();
  const { root, renderer } = rig();
  const off = installShaderGuard(renderer, root);
  (renderer.debug.onShaderError as (...a: unknown[]) => void)(fakeGl, GOOD, 'vs', 'fs');
  assert.equal(shaderFailureLine(), 'toon shader failed: 1');
  off();
  assert.equal(renderer.debug.onShaderError, null);
  clearShaderFailures();
});

test('the ?perf text leads with the refusal when there is one, and says nothing when there is none', () => {
  const s = { framesDrawn: 0, windowFrames: 0, p50: 0, p95: 0, max: 0, slow: [], awake: false, holds: [] };
  const ctx = { ua: 'ua', dpr: 2, size: '1x1', look: 'light', hash: 'abc' };
  assert.doesNotMatch(perfReport(s, ctx), /shader/);
  assert.match(perfReport(s, { ...ctx, shaders: 'vessel shader failed: 1' }), /!! vessel shader failed: 1/);
});

test('the figure is never drawn above 2x, whatever the screen, and the canvas is multisampled below 2x only', () => {
  assert.equal(MAX_FIGURE_DPR, 2);
  for (const ratio of [1, 1.25, 1.5, 2, 3, 4]) for (let d = 0; d < FIGURE_DETAIL.length; d++) for (const sharp of [true, false]) for (const moving of [true, false]) assert.ok(figureDpr(d, sharp, moving, ratio) <= 2);
  assert.equal(figureDpr(2, true, false, 3), 2);
  assert.deepEqual([1, 1.5, 2].map(msaaFor), [true, true, false]);
  // on a 3x phone: Soft 1x and Standard 1.5x keep the multisampled canvas, Sharp 2x has none
  assert.deepEqual(FIGURE_DETAIL.map((_, d) => msaaFor(figureDpr(d, true, false, 3))), [true, true, false]);
  // a 1x screen is always multisampled
  assert.deepEqual(FIGURE_DETAIL.map((_, d) => msaaFor(figureDpr(d, true, false, 1))), [true, true, true]);
});
