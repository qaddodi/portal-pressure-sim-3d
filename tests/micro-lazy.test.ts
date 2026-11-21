// Review 21 Nov #11 and #12: the 3D lobule and sinusoid are built lazily (idle slot, or the first dive), their programs compiled off the frame once they exist; the red cell is a 16-segment lathe.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { unitRbc } from '../src/scene/micro3d/cel3d.ts';
import { RBC_SEG } from '../src/scene/micro3d/sinusoid3d.ts';

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const scene = strip(readFileSync('src/scene/scene.ts', 'utf8'));
const stage = readFileSync('src/scene/Stage.tsx', 'utf8');

test('the scene does not construct the 3D parts in its constructor', () => {
  assert.equal((scene.match(/new Sinusoid3D\(/g) ?? []).length, 1);
  assert.equal((scene.match(/new Lobule3D\(/g) ?? []).length, 1);
  const build = scene.slice(scene.indexOf('private buildMicro()'), scene.indexOf('buildMicroIdle()'));
  assert.match(build, /new Sinusoid3D\(/); assert.match(build, /new Lobule3D\(/);
});

test('a view change to the lobule or sinusoid builds them before anything draws', () => {
  assert.match(scene, /if \(v === 'lobule' \|\| v === 'sinusoid'\) this\.buildMicroIdle\(\);/);
  assert.match(scene, /get sinus3d\(\): Sinusoid3D \{ return this\.buildMicro\(\)\.sinus; \}/);
  assert.match(scene, /get lobule3d\(\): Lobule3D \{ return this\.buildMicro\(\)\.lobule; \}/);
});

test('the per-frame paths never force the build', () => {
  assert.match(scene, /this\.microReady && this\.lobule3d\.update\(/);
  assert.match(scene, /this\.microReady && this\.sinus3d\.update\(/);
  assert.match(scene, /this\.micro\?\.lobule\.setDpr\(dpr\)/);
  assert.doesNotMatch(scene.replace(/get (sinus|lobule)3d\(\)[^\n]*/g, ''), /this\.(sinus3d|lobule3d)\.(dispose|setDpr|focusBand|focusOpen|pinTraffic|holdScale)/);
});

test('the dpr seen before the build is applied when it happens', () => {
  assert.match(scene, /if \(this\.microDpr\) lobule\.setDpr\(this\.microDpr\)/);
});

test('Stage compiles the programs when they appear, and asks for the idle build after the first warm', () => {
  assert.match(stage, /cel\.onMicroBuilt = warm/);
  assert.match(stage, /warmP\(\)[\s\S]{0,160}cel\.buildMicroIdle\(\)/);   // (serialised 21 Nov: the build follows the warm-up's compile)
});

test('the red cell has 16 segments and well under half its old triangles', () => {
  assert.equal(RBC_SEG, 16);
  const tris = (seg: number) => unitRbc(seg).getIndex()!.count / 3;
  assert.ok(tris(RBC_SEG) <= tris(40) * 0.41, `${tris(RBC_SEG)} vs ${tris(40)}`);
  const g = unitRbc(RBC_SEG), p = g.getAttribute('position');
  let maxR = 0, minR = 9; for (let i = 0; i < p.count; i++) { const r = Math.hypot(p.getX(i), p.getY(i)); maxR = Math.max(maxR, r); if (r > 0.99) minR = Math.min(minR, r); }
  assert.ok(Math.abs(maxR - 1) < 1e-6, 'unit radius kept');
});

// ---- the dive's stalls: what keys a rebuild of the 3D sinusoid ----
import { createShared } from '../src/scene/materials/cel.ts';
import { SinusoidView } from '../src/scene/sinusoid/view.ts';
import { Sinusoid3D, shapeKey, tailKey } from '../src/scene/micro3d/sinusoid3d.ts';

test('the shape key reads only the lumen, the pinch and the collagen; the tail key only the activation', () => {
  const S = { lum: 1, pinch: 0.2, col: 0.1, act: 0.3, mv: 1, bm: 0 };
  const moved = { ...S, act: 0.9, mv: 0.2, bm: 1 };
  assert.equal(shapeKey(moved, 5), shapeKey(S, 5), 'activation, microvilli and basement membrane are not shapes');
  assert.notEqual(shapeKey({ ...S, lum: 1.2 }, 5), shapeKey(S, 5));
  assert.notEqual(shapeKey({ ...S, col: 0.5 }, 5), shapeKey(S, 5));
  assert.notEqual(shapeKey(S, 6), shapeKey(S, 5));
  assert.equal(tailKey({ act: 0.3 }), tailKey({ ...S }));
  assert.notEqual(tailKey({ act: 0.9 }), tailKey({ act: 0.3 }));
});

test('easing the basement membrane or the microvilli rebuilds nothing; the activation redoes only the tail', () => {
  const shared = createShared(), flat = new SinusoidView(shared, { look: 'light' }), s3 = new Sinusoid3D(flat, shared);
  flat.group.add(s3.group); flat.setVisible(true); flat.update(1000); flat.update(1016);
  const p = s3 as unknown as { buildShape(): void; buildTail(): void };
  s3.update(true);   // (the first: the shapes are prepared, the tail laid)
  let full = 0, tail = 0; const b = p.buildShape.bind(s3), t = p.buildTail.bind(s3);
  p.buildShape = () => { full++; b(); }; p.buildTail = () => { tail++; t(); };
  const cur = flat.cur;
  for (let i = 0; i <= 64; i++) { cur.bm = i / 64; cur.mv = 1 - i / 64; s3.update(true); }
  assert.equal(full + tail, 0, 'bm and mv ease with no rebuild');
  for (let i = 0; i <= 32; i++) { cur.act = i / 32; s3.update(true); }
  assert.equal(full, 0, 'activation never rebuilds a shape');
  assert.ok(tail > 0, 'activation redoes the tail');
  cur.lum = cur.lum! * 1.3; s3.update(true);
  assert.equal(full, 0, 'nor does the lumen: the shader follows it (tests/sinusoid-shape.test.ts)');
});

// ---- the audit names the system that costs a frame (scene.systemMs, update and render laps, per step) ----
test('render() laps its phases into systemMs, and the audit row carries the per-step delta into the LAGS line', () => {
  const sc = readFileSync('src/scene/scene.ts', 'utf8');
  for (const n of ['render: setup (dof, band, blur frame)', 'render: pass 1, layer 0 (organs; the lobule and the sinusoid are drawn here too)', 'render: pass 2, vessel layer', 'render: glow, blur, resolve']) assert.ok(sc.includes(`lap('${n}')`), n);
  const app = readFileSync('src/ui/debug/audit/app.ts', 'utf8'), rep = readFileSync('src/ui/debug/audit/report.ts', 'utf8');
  assert.match(app, /sys0 = \{ \.\.\.\(cel\.systemMs \?\? \{\}\) \}/);
  assert.match(app, /systemMs: Object\.entries\(cel\.systemMs/);
  assert.match(rep, /systems \(ms over the step\)/);
});

test('the idle slices prime the lobule and the sinusoid hidden, so the first shown frame builds nothing', () => {
  const sc = readFileSync(new URL('../src/scene/scene.ts', import.meta.url), 'utf8');
  assert.match(sc, /this\.micro\.lobule\.update\(true, 0, 0, 1, true\)/);
  assert.match(sc, /this\.micro\.sinus\.update\(true, 1, true\)/);
  assert.match(sc, /get microPrimedNow/);
});

test('a lazy Lobule3D builds its vessels in several slices, and a late weld plan rebuilds them in slices, never in one task', async () => {
  const { createShared } = await import('../src/scene/materials/cel.ts');
  const { LobuleView } = await import('../src/scene/lobule/view.ts');
  const { Lobule3D, THIN_SEG, TUBE_SEG } = await import('../src/scene/micro3d/lobule3d.ts');
  const shared = createShared(), l3 = new Lobule3D(new LobuleView(shared), shared, true);
  assert.equal(l3.vesselsReady, false, 'the constructor leaves the vessels to the idle slices');
  let slices = 0;
  while (l3.prepareVessels()) slices++;
  assert.ok(slices >= 6, `built in ${slices} slices`);
  assert.equal(l3.vesselsReady, true);
  assert.ok(THIN_SEG < TUBE_SEG);
  const src = readFileSync('src/scene/micro3d/lobule3d.ts', 'utf8');
  assert.match(src, /this\.vesselsBuilt = false; this\.vgen = null; this\.inkKey = '';\n\s+this\.pumpVessels\(\);/);
});

test('the sinusoid shape passes are cut into sections: many small steps, then ready; the scene takes them in time-boxed slices', async () => {
  const { CelScene } = await import('../src/scene/scene.ts');
  const sc = new CelScene() as unknown as { buildMicro(): void; micro: { sinus: { prepareShapeStep(): boolean; shapeReady: boolean } } };
  sc.buildMicro();
  let steps = 0;
  while (!sc.micro.sinus.prepareShapeStep()) steps++;
  assert.ok(steps > 40, `${steps} steps for the passes (was 8, one pass each)`);
  assert.equal(sc.micro.sinus.shapeReady, true);
  assert.match(readFileSync('src/scene/scene.ts', 'utf8'), /do \{ if \(this\.microStep\(\)\) return; \} while \(!this\.disposed && clock\.now\(\) - t0 < SLICE_MS\)/);
});
