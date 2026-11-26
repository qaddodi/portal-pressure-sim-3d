// The red cells in the Sinusoid view (owner, 26 Nov 2026: "make them much more, but don't make the RBCs any bigger than they are now"): how many are drawn follows the patient's hematocrit, and a red cell is
// never larger than it was. Pins the rule in one place, in the model, the count, the size and the cost: the share of the lumen's picture the cells cover equals the hematocrit; anemia (the engine's
// metrics.blood.hct) thins the stream; the cell stays RBC_R (1.05 µm) whatever the count; one instanced mesh draws them all, inside a triangle budget a phone can hold. Node only.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { type InstancedMesh, Matrix4, Vector3 } from 'three';
import { createCore } from '../src/engine/hales/host/worker-core.js';
import { unitRbc } from '../src/scene/micro3d/cel3d.ts';
import { HCT_HEALTHY, lobuleModel, sinusoidTargets, type SinusoidTargets } from '../src/scene/lobule/model.ts';
import {
  RBC_DENSITY_MAX, RBC_FAR, RBC_N, RBC_R, RBC_RINGS, RBC_SEG, Sinusoid3D, rbcDensity, rbcWanted,
} from '../src/scene/micro3d/sinusoid3d.ts';
import { createShared } from '../src/scene/materials/cel.ts';
import { SinusoidView } from '../src/scene/sinusoid/view.ts';
import type { InkContext } from '../src/scene/lobule/ink.ts';
import type { LensId } from '../src/scene/lenses/model.ts';

const OLD_N = 50, OLD_FAR = 20, OLD_R = 1.05;
const T = (o: Partial<SinusoidTargets> = {}): SinusoidTargets => ({ por: 1, col: 0, bm: 0, mv: 1, act: 0, lum: 1, pinch: 0, v: 1, filt: 1, prot: 1, ...o });

function scene(hct?: number) {
  const shared = createShared();
  const flat = new SinusoidView(shared, { look: 'light' });
  const s3 = new Sinusoid3D(flat, shared);
  flat.group.add(s3.group);
  flat.setVisible(true);
  flat.snapTargets(T(hct == null ? {} : { hct }));
  flat.update(1000); flat.update(1016);
  s3.update(true);
  const mesh = () => (s3 as unknown as { rbc: { toon: InstancedMesh; capacity: number } }).rbc;
  return { flat, s3, mesh };
}
/** How many cells the scene draws now, each one's radius (the length of its disc's own x axis) and its colour. */
function cells(m: { toon: InstancedMesh }) {
  const out: { r: number; rgb: number[] }[] = [], mat = new Matrix4(), v = new Vector3();
  for (let i = 0; i < m.toon.count; i++) {
    m.toon.getMatrixAt(i, mat); v.setFromMatrixColumn(mat, 0);
    out.push({ r: v.length(), rgb: m.toon.instanceColor ? Array.from(m.toon.instanceColor.array.subarray(i * 3, i * 3 + 3)) : [] });
  }
  return out;
}

/** One scene for the tests that only change the hematocrit (building one costs a second or two): it is snapped to `hct` and stepped, which is how the model reaches it. */
let shared1: ReturnType<typeof scene> | null = null, clockMs = 2000;
function at(hct: number) {
  const sc = (shared1 ??= scene());
  sc.flat.snapTargets(T({ hct }));
  sc.flat.update(clockMs += 16); sc.flat.update(clockMs += 16);
  sc.s3.update(true);
  return sc;
}

async function patient(id: string) {
  const out: { type: string; [k: string]: unknown }[] = [];
  const core = createCore((m: { type: string }) => out.push(m));
  await core.handle({ type: 'init' }); await core.handle({ type: 'run', running: false }); await core.handle({ type: 'preset', id, reqId: 1 });
  core.dispose();
  const frame = out.filter((m) => m.type === 'frame').at(-1) as unknown as { P: Float32Array; Q: Float32Array; metrics: { blood: { hct: number } } };
  const params = (out.find((m) => m.type === 'presetLoaded') as unknown as { params: unknown }).params;
  return { frame, params };
}

test('the model hands the sinusoid the patient\'s hematocrit: healthy 0.42, the anemia of liver disease lower, and a model without one reads healthy', async () => {
  const h = await patient('healthy'), c = await patient('cirr-decomp');
  const th = sinusoidTargets(lobuleModel({ P: h.frame.P, Q: h.frame.Q, metrics: h.frame.metrics }, null, h.params));
  const tc = sinusoidTargets(lobuleModel({ P: c.frame.P, Q: c.frame.Q, metrics: c.frame.metrics }, null, c.params));
  assert.ok(Math.abs(th.hct! - HCT_HEALTHY) < 0.005, `healthy ${th.hct}`);
  assert.equal(tc.hct, c.frame.metrics.blood.hct, 'the target is the engine\'s own hematocrit');
  assert.ok(tc.hct! < th.hct! - 0.05, `anemic ${tc.hct} against ${th.hct}`);
  assert.equal(sinusoidTargets(lobuleModel({ P: h.frame.P, Q: h.frame.Q }, null, h.params)).hct, HCT_HEALTHY, 'no blood metrics: healthy');
});

test('the count follows the hematocrit: proportional to it, none at none, capped at what a transfusion can pack', () => {
  assert.equal(rbcDensity(HCT_HEALTHY), 1);
  assert.ok(Math.abs(rbcDensity(0.21) - 0.5) < 1e-9, 'half the hematocrit, half the cells');
  assert.equal(rbcDensity(0), 0);
  assert.equal(rbcDensity(0.8), RBC_DENSITY_MAX, 'the packed stream stops at the buffers\' size');
  let last = -1;
  for (let h = 0; h <= 0.6; h += 0.01) { const w = rbcWanted(h); assert.ok(w.main >= last, 'never fewer cells at a higher hematocrit'); last = w.main; assert.ok(Math.abs(w.far / w.main - RBC_FAR / RBC_N) < 1e-9 || w.main === 0); }
  assert.ok(rbcWanted(0.31).main < rbcWanted(0.42).main * 0.8, 'anemia visibly thins the stream');
});

test('a healthy sinusoid carries the 50 red cells it always did, and 20 in each next one (owner, 26 Nov: "less, just like before")', () => {
  assert.equal(RBC_N, OLD_N);
  assert.equal(RBC_FAR, OLD_FAR);
  assert.equal(rbcWanted(HCT_HEALTHY).main, OLD_N);
  assert.equal(rbcWanted(HCT_HEALTHY).far, OLD_FAR);
});

test('the scene draws exactly the cells the hematocrit asks for', () => {
  for (const hct of [0.42, 0.31, 0.2, 0.52]) {
    const { mesh } = at(hct);
    const w = rbcWanted(hct), want = Math.ceil(w.main) + 2 * Math.ceil(w.far);
    assert.ok(Math.abs(mesh().toon.count - want) <= 3, `hct ${hct}: ${mesh().toon.count} drawn, ${want} asked`);
  }
  const full = at(0.42).mesh().toon.count, thin = at(0.21).mesh().toon.count;
  assert.ok(Math.abs(thin / full - 0.5) < 0.02, `half the hematocrit draws half the cells (${thin} of ${full})`);
});

test('a patient\'s anemia thins the drawn stream, and it eases (one cell at a time, none pops in at full size)', () => {
  const { flat, s3, mesh } = scene(0.42);
  const before = mesh().toon.count;
  flat.setTargets(T({ hct: 0.31 }));
  let prev = before, t = 1032;
  const sizes: number[] = [];
  for (let i = 0; i < 80; i++, t += 16) { flat.update(t); s3.update(true); const c = mesh().toon.count; assert.ok(c <= prev, 'only fewer'); prev = c; if (i % 10 === 0) sizes.push(c); }
  assert.ok(prev < before * 0.8, `thinned: ${before} to ${prev}`);
  assert.ok(sizes.some((c, i) => i > 0 && c < sizes[i - 1]!), 'it took time (eased), not one step');
});

test('the red cell is no bigger than it was: RBC_R, every drawn cell at most that, the whole ones exactly that', () => {
  assert.equal(RBC_R, OLD_R, 'the radius is the one from before the stream was thickened');
  assert.equal(RBC_SEG, 16);
  const g = unitRbc(RBC_SEG, RBC_RINGS), p = g.getAttribute('position');
  let maxR = 0; for (let i = 0; i < p.count; i++) maxR = Math.max(maxR, Math.hypot(p.getX(i), p.getY(i)));
  assert.ok(Math.abs(maxR - 1) < 1e-6, 'the unit cell is one radius across, whatever its rings');
  for (const hct of [0.42, 0.2, 0.52]) {
    const { mesh } = at(hct), cs = cells(mesh());
    assert.ok(cs.length > 0);
    assert.ok(cs.every((c) => c.r <= RBC_R + 1e-6), `hct ${hct}: nothing larger than ${RBC_R}`);
    assert.ok(Math.abs(Math.max(...cs.map((c) => c.r)) - RBC_R) < 1e-6, 'whole cells are exactly RBC_R');
    assert.ok(cs.filter((c) => Math.abs(c.r - RBC_R) < 1e-6).length >= cs.length - 3, 'all but the one or two being added are whole');
  }
});

test('one instanced mesh draws every red cell, in a triangle budget a phone can hold', () => {
  const { mesh } = at(0.42);
  const m = mesh();
  assert.equal((m.toon as InstancedMesh).isInstancedMesh, true);
  const tris = unitRbc(RBC_SEG, RBC_RINGS).getIndex()!.count / 3;
  assert.ok(m.capacity >= Math.ceil(RBC_N * RBC_DENSITY_MAX) + 2 * Math.ceil(RBC_FAR * RBC_DENSITY_MAX), 'the buffers hold the most packed stream');
  assert.ok(m.toon.count * tris <= 150_000, `a healthy stream: ${m.toon.count} cells x ${tris} triangles`);
  assert.ok(m.capacity * tris <= 200_000, `the most packed: ${m.capacity} cells x ${tris} triangles`);
  assert.ok(m.toon.count <= m.capacity);
});

test('a cell keeps its source colour under Blood origin however many cells are drawn (the stream thinning never recolours the rest)', () => {
  const ctx = (): InkContext => ({
    lens: 'origin' as LensId, look: 'light', ref: new Float32Array(200).fill(5), fibSin: 0,
    model: {
      zone: { pre: 1, sin: 1, post: 1 }, Qs: { pre: 18, sin: 9, post: 18 }, Q0: { pre: 18, sin: 12, post: 18 }, oxy: [0.85, 0.78, 0.7], P1: 20, P2: 14, P3: 6, P4: 4,
      flow: 1, portal: 1, art: 1, rev: { pre: false, sin: false, post: false }, lymph: 0.9, lymph0: 0.9, lyProt: 0.87, sigma: 0.15, iap: 5, alb: 4, s: 0, cong: 0, fibSin: 0, fibPre: 0, fibPost: 0, congU: 0, shuntU: 0, septU: 0, act: 0,
      lanes: {
        origin: { pre: [[0.5, 0.1, 0.2, 0.2], [0.5, 0.1, 0.2, 0.2]], sin: [[0.4, 0.1, 0.2, 0.3], [0.4, 0.1, 0.2, 0.3]], post: [[0.4, 0.1, 0.2, 0.3], [0.4, 0.1, 0.2, 0.3]] },
        pass: { pre: [[0.8, 0, 0, 0.2], [0.8, 0, 0, 0.2]], sin: [[0.8, 0, 0, 0.2], [0, 0.8, 0, 0.2]], post: [[0, 0.8, 0, 0.2], [0, 0.8, 0, 0.2]] },
      },
    },
  } as unknown as InkContext);
  const { flat, s3, mesh } = scene(0.42);
  flat.setInk(ctx(), 'origin');
  let t = 1032; for (let i = 0; i < 120; i++, t += 16) { flat.update(t); s3.update(true); }
  const full = cells(mesh());
  assert.ok(new Set(full.map((c) => c.rgb.map((x) => x.toFixed(2)).join())).size >= 3, 'the cells wear several sources');
  flat.setTargets(T({ hct: 0.31 }));
  for (let i = 0; i < 160; i++, t += 16) { flat.update(t); s3.update(true); }
  const thin = cells(mesh());
  assert.ok(thin.length < full.length);
  // the main lane is the first cells in both: the same cell is the same colour
  for (let i = 0; i < 30; i++) assert.deepEqual(thin[i]!.rgb.map((x) => +x.toFixed(3)), full[i]!.rgb.map((x) => +x.toFixed(3)), `cell ${i}`);
});

test('the red cells\' colour attribute exists from the constructor, so their program is the one the boot compiles (no late compile in the dive: tests/program-warm.test.ts)', () => {
  const shared = createShared();
  const flat = new SinusoidView(shared, { look: 'light' });
  const s3 = new Sinusoid3D(flat, shared);
  const rbc = (s3 as unknown as { rbc: { toon: InstancedMesh } }).rbc;
  assert.ok(rbc.toon.instanceColor, 'before any cell is placed');
});
