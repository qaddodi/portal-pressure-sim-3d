import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CelScene } from '../src/scene/scene.ts';
import { useSettings } from '../src/state/settings.ts';
import { collectMaterials, uniformProblems, budget, ES3_FLOOR } from '../src/debug/gl-programs.ts';
import { namedSources } from '../src/debug/gl-registry.ts';
import { CELLS_FS, CELLS_VS } from '../src/scene/blood/cells/shader.ts';
import {
  CELL_CAP, CELL_SAMPLES, MIN_PER_EDGE, cellArc, cellsWanted, cellCap, designFlow, easeAmount, edgeCapacity, endFade, flowShare, hash2, layoutCells, particleBudget, resample, ringCentres, slotShown, taperAt, thinOrder,
  writeEdgeLength, writeEdgeLive, writeEdgeStatic, writeCourse, type BudgetEdge,
} from '../src/scene/blood/cells/core.ts';

// Blood-cell particles (depth upgrade 5): the pure core, the switch, and the program.

const edge = (flow: number, length = 200, radius = 6): BudgetEdge => ({ flow, length, radius });

test('the budget: never over the hard cap, never over what a tube holds, nothing for no flow or a hairline', () => {
  const edges = [edge(27), edge(6), edge(1.5), edge(1.5, 200, 0.5), edge(0), edge(60, 400, 9), edge(3, 0)];
  for (const total of [CELL_CAP.desktop, CELL_CAP.phone, 10, 3]) {
    const n = particleBudget(edges, total);
    assert.ok(n.reduce((a, b) => a + b, 0) <= total, `sum under ${total}`);
    n.forEach((c, i) => assert.ok(c <= edgeCapacity(edges[i]!), `edge ${i} within its tube`));
    assert.deepEqual([n[3], n[4], n[6]], [0, 0, 0], 'a hairline, no flow and no length carry none');
  }
  assert.ok(particleBudget(edges, CELL_CAP.desktop).every((c, i) => c === 0 || c >= MIN_PER_EDGE || i === -1), 'a vessel that carries any keeps the minimum');
});

test('the budget: cells follow flow (same tube, more flow, no fewer cells), and a phone gets about half', () => {
  const same = [1.5, 3, 6, 12, 24, 48].map((f) => edge(f, 3000, 8));
  const n = particleBudget(same, 400);
  for (let i = 1; i < n.length; i++) assert.ok(n[i]! >= n[i - 1]!, `${n.join(',')}`);
  assert.ok(n[5]! > n[0]! * 4, 'a flow thirty times bigger has many times the cells');
  const many = Array.from({ length: 60 }, (_, i) => edge(designFlow(1 + (i % 9) * 3), 300, 5));
  const d = particleBudget(many, cellCap(false)).reduce((a, b) => a + b, 0), p = particleBudget(many, cellCap(true)).reduce((a, b) => a + b, 0);
  assert.ok(p <= CELL_CAP.phone && d <= CELL_CAP.desktop);
  assert.ok(p < d, 'a phone draws fewer');
  assert.equal(CELL_CAP.phone * 2, CELL_CAP.desktop, 'about half on a phone');
  assert.ok(CELL_CAP.desktop >= 1500 && CELL_CAP.desktop <= 3000, 'the owner asked for 1500 to 3000 on a desktop');
});

test('the budget: a tube that cannot take its share passes the rest on', () => {
  const edges = [edge(100, 30, 3), edge(1, 500, 8), edge(1, 500, 8)];
  const n = particleBudget(edges, 200);
  assert.equal(n[0], edgeCapacity(edges[0]!), 'the small tube is full');
  assert.ok(n[1]! > 20 && n[2]! > 20, 'the others took the rest');
});

test('slots: every cell is placed along its vessel, thinning is even, the layout is the same every time', () => {
  const a = layoutCells([5, 0, 12]), b = layoutCells([5, 0, 12]);
  assert.equal(a.count, 17);
  assert.deepEqual([...a.place], [...b.place]);
  assert.deepEqual([...a.extra], [...b.extra]);
  for (let i = 0; i < a.count; i++) {
    assert.ok(a.place[i * 3 + 1]! >= 0 && a.place[i * 3 + 1]! < 1, 'phase on the course');
    assert.ok(Math.abs(a.extra[i * 4 + 1]!) <= 1, 'lateral place inside the tube');
    assert.ok(a.place[i * 3 + 2]! >= 0 && a.place[i * 3 + 2]! < 1);
  }
  assert.deepEqual([...a.place].filter((_, i) => i % 3 === 0).slice(5), Array(12).fill(2), 'cells carry their vessel\'s index (edge 1 has none)');
  // the half of the slots that show at half the flow are every other one
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map(thinOrder), [0, 0.5, 0.25, 0.75, 0.125, 0.625, 0.375, 0.875]);
  const shown = (share: number, n: number) => Array.from({ length: n }, (_, j) => j).filter((j) => thinOrder(j) < share);
  assert.deepEqual(shown(0.5, 8), [0, 2, 4, 6]);
  assert.deepEqual(shown(0.25, 8), [0, 4]);
  assert.ok(hash2(1, 2) !== hash2(2, 1) && hash2(3, 4) === hash2(3, 4));
});

test('a cell\'s place: it follows the blood\'s distance, wraps at the ends, runs back when the flow is reversed, stands when there is none', () => {
  const L = 240, phase = 0.9;
  const u = (D: number) => cellArc(phase, D, L);
  assert.ok(Math.abs(u(0) - 0.9) < 1e-9);
  assert.ok(Math.abs(u(12) - 0.95) < 1e-9, 'forward flow moves it down the course');
  assert.ok(Math.abs(u(48) - 0.1) < 1e-9, 'past the end it comes back at the start');
  assert.ok(Math.abs(u(-24) - 0.8) < 1e-9, 'reversed flow (D going down) moves it back up the course');
  assert.ok(Math.abs(u(-240 * 3 - 24) - 0.8) < 1e-9, 'whole laps the other way land in the same place');
  const D = [10, 10, 10]; // no flow: D stands
  assert.deepEqual(D.map(u).map((x) => x.toFixed(9)), [u(10), u(10), u(10)].map((x) => x.toFixed(9)));
  for (const d of [-1e5, -3.3, 0, 7.7, 229000]) { const x = u(d); assert.ok(x >= 0 && x < 1); }
  // the speed is the chevrons': a cell moves exactly as far as the stream's distance moves
  const moved = (d0: number, d1: number) => (((u(d1) - u(d0)) * L) + 1.5 * L) % L - 0.5 * L;
  assert.ok(Math.abs(moved(3, 8) - 5) < 1e-6);
  assert.ok(Math.abs(moved(8, 3) + 5) < 1e-6);
});

test('how many cells show follows the flow: none at no flow, all at the design flow, one by one between', () => {
  const design = designFlow(10);
  assert.equal(flowShare(0, design), 0);
  assert.equal(flowShare(design * 3, design), 1);
  assert.equal(flowShare(-design / 2, design), 0.5, 'a reversed flow counts by its size');
  assert.equal(slotShown(0, 0, 10), 0);
  assert.equal(slotShown(1, 0.8, 10), 1);
  assert.ok(slotShown(0.55, 0.5, 10) > 0 && slotShown(0.55, 0.5, 10) < 1, 'a slot comes in over one slot\'s width of flow');
  assert.equal(slotShown(0.4, 0.5, 10), 0);
  assert.ok(designFlow(0) > 0, 'a vessel at rest flow 0 (a collateral) still has a design flow');
});

test('the ends fade and the taper eases (the wrap never pops)', () => {
  assert.equal(endFade(0, 300), 0);
  assert.equal(endFade(1, 300), 0);
  assert.equal(endFade(0.5, 300), 1);
  assert.ok(endFade(0.02, 300) > 0 && endFade(0.02, 300) < 1);
  assert.equal(taperAt(undefined, 0.1), 1);
  assert.equal(taperAt([0.6, 1.4], 0), 0.6);
  assert.equal(taperAt([0.6, 1.4], 1), 1.4);
  assert.equal(taperAt([0.6, 1.4], 0.5), 1);
});

test('the layer is wanted only when it is on, motion is allowed and the body is the view; it eases, never pops', () => {
  assert.equal(cellsWanted({ on: false, reduceMotion: false, view: 'body' }), false);
  assert.equal(cellsWanted({ on: true, reduceMotion: true, view: 'body' }), false, 'Reduce Motion: not drawn');
  for (const view of ['circuit', 'lobule', 'sinusoid'] as const) assert.equal(cellsWanted({ on: true, reduceMotion: false, view }), false, view);
  assert.equal(cellsWanted({ on: true, reduceMotion: false, view: 'body' }), true);
  let a = 0, frames = 0;
  while (a < 1 && frames < 100) { a = easeAmount(a, 1, 16); frames++; }
  assert.ok(frames > 5 && frames < 30, `${frames} frames to come in`);
  assert.equal(easeAmount(0.5, 0, 1e9), 0);
});

test('the course is read from the tube\'s rings and resampled evenly', () => {
  const seg = 4, ring = 15, pos: number[] = [];
  for (let k = 0; k <= seg; k++) for (let j = 0; j < ring; j++) { const a = (j % 14) / 14 * Math.PI * 2; pos.push(k + 0.3 * Math.cos(a), 2 + 0.3 * Math.sin(a), -1); }
  const c = ringCentres(pos, seg);
  for (let k = 0; k <= seg; k++) assert.ok(Math.abs(c[k * 3]! - k) < 1e-5 && Math.abs(c[k * 3 + 1]! - 2) < 1e-5 && c[k * 3 + 2] === -1);
  const r = resample(c);
  assert.equal(r.length, CELL_SAMPLES * 3);
  assert.ok(Math.abs(r[0]!) < 1e-6 && Math.abs(r[(CELL_SAMPLES - 1) * 3]! - 4) < 1e-5, 'from the first ring to the last');
  assert.ok(Math.abs(r[3]! - 4 / (CELL_SAMPLES - 1)) < 1e-6);
  const out = new Float32Array(3 * CELL_SAMPLES * 4);
  writeCourse(out, 2, r);
  assert.ok(Math.abs(out[(2 * CELL_SAMPLES + CELL_SAMPLES - 1) * 4]! - 4) < 1e-5);
});

test('the edge rows: static numbers once, live numbers when they change, the length when a vessel reshapes', () => {
  const n = 7, out = new Float32Array(n * 5 * 4);
  writeEdgeStatic(out, n, 3, { length: 250, radius: 0.02, baseD: 6, design: 12, widthKind: 1, tone: 2, taper: [0.8, 1.2], veil: 0.4 });
  assert.deepEqual([...out.slice(3 * 4, 3 * 4 + 4)].map((x) => +x.toFixed(4)), [250, 0.02, 6, 12]);
  assert.deepEqual([...out.slice((n + 3) * 4, (n + 3) * 4 + 4)].map((x) => +x.toFixed(4)), [9, 0.8, 1.2, 0.4], 'width kind 1 and tone 2 pack as 1 + 4 * 2');
  const live = { reveal: 1, visible: 1, fadeMode: 0, fadeA: [0, 1, 1, 1] as [number, number, number, number], fadeLine: [0, 0, 0, 1] as [number, number, number, number] };
  assert.equal(writeEdgeLive(out, n, 3, live), true);
  assert.equal(writeEdgeLive(out, n, 3, live), false, 'nothing changed, nothing to upload');
  live.visible = 0;
  assert.equal(writeEdgeLive(out, n, 3, live), true);
  assert.equal(writeEdgeLength(out, n, 3, 250), false);
  assert.equal(writeEdgeLength(out, n, 3, 260), true);
  assert.equal(out[3 * 4], 260);
});

test('the shader reads the chevrons\' stream and the engine\'s flow, owns no clock and takes no time', () => {
  assert.match(CELLS_VS, /texelFetch\(streamTex, ivec2\(e, 0\), 0\)\.x/, 'the distance the chevrons ride');
  assert.match(CELLS_VS, /texelFetch\(vdata, tc, 0\)/, 'the engine\'s per-vessel texture');
  assert.match(CELLS_VS, /abs\(td\.g\)/, 'the flow, by its size (direction is the stream\'s)');
  assert.match(CELLS_VS, /td\.b/, 'the diameter');
  assert.doesNotMatch(CELLS_VS + CELLS_FS, /uniform float time|requestAnimationFrame/);
  assert.match(CELLS_VS, /gl_PointSize/);
});

// ---- on the scene ----
const settings = useSettings.getState();
const frame = { view: 'body' as const, circuit: 0, body: 1, flowMoving: true };

test('off (the default): nothing is built, nothing is in the scene, no frame is asked for', () => {
  useSettings.setState({ particles: false });
  const s = new CelScene();
  assert.equal(s.cells.built, false);
  assert.equal(s.cells.step(16, frame), false);
  assert.equal(s.cells.step(16, { ...frame, flowMoving: true }), false);
  assert.equal(s.cells.built, false);
  let found = false;
  s.scene.traverse((o) => { if (o.name === 'blood cells') found = true; });
  assert.equal(found, false, 'the cells are not even in the scene graph');
});

test('on: one Points, one draw call, within the cap, on the vessels\' layer; faded out again it is not visible and asks for nothing', () => {
  useSettings.setState({ particles: true });
  const s = new CelScene();
  assert.equal(s.cells.step(16, frame), true, 'fading in asks for frames');
  const o = s.cells.object!;
  assert.ok(o && o.isPoints, 'a Points: one draw call');
  assert.ok(s.cells.count > 100 && s.cells.count <= CELL_CAP.desktop, `${s.cells.count} cells`);
  console.log(`[cells] ${s.cells.count} cells on a desktop`);
  assert.equal(o.geometry.getAttribute('position').count, s.cells.count);
  assert.equal(o.geometry.index, null, 'one vertex a cell');
  assert.equal(o.layers.mask, 1 << 1, 'drawn in the vessels\' pass, over the organs');
  assert.equal(o.parent, (s as unknown as { body: unknown }).body);
  assert.equal(o.visible, true);
  for (let i = 0; i < 40; i++) s.cells.step(16, frame);
  assert.equal(s.cells.shown, 1);
  assert.equal(s.cells.step(16, { ...frame, flowMoving: false }), false, 'on, settled and the blood still: no frame');
  assert.equal(s.cells.step(16, frame), true, 'on and the blood moving: frames');
  // the Circuit, the lobule and the sinusoid: faded out, then nothing
  let asked = 0;
  for (let i = 0; i < 40; i++) if (s.cells.step(16, { ...frame, view: 'circuit' })) asked++;
  assert.ok(asked > 3 && asked < 30, 'fades out over a few frames');
  assert.equal(o.visible, false);
  assert.equal(s.cells.step(16, { ...frame, view: 'circuit' }), false);
  // switched off in Settings
  useSettings.setState({ particles: false });
  s.cells.step(16, frame);
  for (let i = 0; i < 40; i++) s.cells.step(16, frame);
  assert.equal(o.visible, false);
  assert.equal(s.cells.step(16, frame), false);
  useSettings.setState({ particles: settings.particles });
});

test('on: a phone gets about half the cells, rebuilt when the device class changes', () => {
  useSettings.setState({ particles: true });
  const s = new CelScene();
  s.setPhone(false); s.cells.step(16, frame);
  const desktop = s.cells.count;
  s.setPhone(true); s.cells.step(16, frame);
  console.log(`[cells] ${s.cells.count} on a phone, ${desktop} on a desktop`);
  assert.ok(s.cells.count <= CELL_CAP.phone && s.cells.count < desktop, `${s.cells.count} on a phone, ${desktop} on a desktop`);
  useSettings.setState({ particles: settings.particles });
});

test('the program is found on the scene graph once on, declares nothing the material lacks, and fits the phone floor', () => {
  useSettings.setState({ particles: true });
  const s = new CelScene();
  s.cells.step(16, frame);
  const ps = collectMaterials(s.scene, namedSources()).filter((p) => p.name.startsWith('blood cells'));
  assert.equal(ps.length, 1, ps.map((p) => p.name).join(' | '));
  assert.deepEqual(uniformProblems(ps[0]!), []);
  const b = budget(ps[0]!);
  for (const k of Object.keys(ES3_FLOOR) as (keyof typeof ES3_FLOOR)[]) assert.ok(b[k] <= ES3_FLOOR[k], `${k} ${b[k]}`);
  assert.ok(b.samplers <= 12, `${b.samplers} samplers in the vertex stage (iOS gives 16)`);
  const m = ps[0]!.material!;
  assert.equal(m.depthWrite, false);
  assert.equal(m.depthTest, true);
  useSettings.setState({ particles: settings.particles });
});

test('Settings: blood cells are off by default (the chevrons stay the flow mark)', () => {
  assert.equal(settings.particles, false);
  assert.match(readFileSync('src/state/settings.ts', 'utf8'), /particles: false/);
});
