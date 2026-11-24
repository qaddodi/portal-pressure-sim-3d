import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyVesselOverrides } from '../src/editor/vessel-apply.ts';
import { setOverridesForTest } from '../src/editor/store.ts';
import { EMPTY, type Overrides } from '../src/editor/types.ts';

type Net = typeof import('../src/scene/vessels/network.ts');
const load = (q: string): Promise<Net> => import(new URL('../src/scene/vessels/network.ts?' + q, import.meta.url).href) as Promise<Net>;
const key = (c: readonly (readonly number[])[]): string => JSON.stringify(c);

test('empty overrides: same path object, no dz', () => {
  const p = [[0, 0], [1, 0], [2, 1]] as const;
  const r = applyVesselOverrides({ id: 'a', from: 'X', to: 'Y' }, p, EMPTY);
  assert.equal(r.path, p); assert.equal(r.dz, null);
});

test('node move: arm end moves by the vector, eases to zero, far end stays', () => {
  const p = Array.from({ length: 41 }, (_, i) => [i * 10, Math.sin(i / 6) * 5] as const);
  const o: Overrides = { version: 1, nodes: { X: { dx: 12, dy: -7, dz: 0.02 } } };
  const r = applyVesselOverrides({ id: 'a', from: 'X', to: 'Y' }, p, o);
  assert.deepEqual([r.path[0]![0] - p[0]![0], r.path[0]![1] - p[0]![1]], [12, -7]);
  assert.equal(r.dz![0], 0.02);
  assert.deepEqual(r.path[40], p[40]); assert.equal(r.dz![40], 0);
  let prev = 12, maxStep = 0;
  for (let i = 0; i < 41; i++) { const d = r.path[i]![0] - p[i]![0]; assert.ok(d <= prev + 1e-12 && d >= 0); maxStep = Math.max(maxStep, prev - d); prev = d; }
  assert.ok(maxStep < 12 * 0.5);
});

test('two arms at one node end at the same point', () => {
  const a = [[0, 0], [10, 0], [20, 0], [30, 0], [40, 0]] as const, b = [[0, 0], [0, 10], [0, 20], [0, 30], [0, 40]] as const;
  const o: Overrides = { version: 1, nodes: { X: { dx: 3, dy: 4 } } };
  const ra = applyVesselOverrides({ id: 'a', from: 'X', to: 'Y' }, a, o), rb = applyVesselOverrides({ id: 'b', from: 'X', to: 'Z' }, b, o);
  assert.deepEqual(ra.path[0], rb.path[0]);
});

test('control points: ends pinned, smooth through the knot', () => {
  const p = Array.from({ length: 21 }, (_, i) => [i * 5, 0] as const);
  const o: Overrides = { version: 1, vessels: { a: { pts: [{ u: 0.5, dx: 0, dy: 8, dz: 0.01 }] } } };
  const r = applyVesselOverrides({ id: 'a', from: 'X', to: 'Y' }, p, o);
  assert.deepEqual(r.path[0], [0, 0]); assert.deepEqual(r.path[20], [100, 0]);
  assert.equal(r.path[10]![1], 8); assert.ok(Math.abs(r.dz![10]! - 0.01) < 1e-12);
  assert.ok(Math.abs(r.path[9]![1] - r.path[11]![1]) < 1e-9);
});

test('network: empty identical, moved node keeps arms together', async () => {
  setOverridesForTest(EMPTY);
  const ref = await import('../src/scene/vessels/network.ts');
  const before = new Map(ref.MAPPED.map((v) => [v.id, key(ref.courseOf(v.id))]));
  const node = ref.MAPPED.find((v) => v.id === 'PV_TRUNK')!.from, arms = ref.MAPPED.filter((v) => v.from === node || v.to === node);
  assert.ok(arms.length >= 1);
  setOverridesForTest({ version: 1, nodes: { [node]: { dx: 15, dy: 10 } } });
  const mod = await load('edited');
  const endOf = (m: typeof ref, v: { id: string; from: string }): readonly number[] => { const c = m.courseOf(v.id); return v.from === node ? c[0]! : c[c.length - 1]!; };
  const moved = arms.map((v) => endOf(mod, v)), still = arms.map((v) => endOf(ref, v));
  assert.ok(moved.some((e, i) => Math.hypot(e[0]! - still[i]![0]!, e[1]! - still[i]![1]!) > 1e-6));
  setOverridesForTest(EMPTY);
  const again = await load('empty');
  for (const v of again.MAPPED) assert.equal(key(again.courseOf(v.id)), before.get(v.id));
});

test('editableSkeleton lists nodes with arms and courses', async () => {
  setOverridesForTest(EMPTY);
  const { editableSkeleton } = await import('../src/editor/vessel-skeleton.ts');
  const s = editableSkeleton();
  assert.ok(s.nodes.length > 10 && s.vessels.length > 10);
  assert.ok(s.nodes.every((n) => n.arms.length >= 1 && n.pos.every(Number.isFinite)));
});

test('the plan accessor: same table when empty, edited for every reader', async () => {
  const { editedPlan } = await import('../src/editor/vessel-plan.ts');
  const { EDGE_PATH_2D } = await import('../src/scene/vessels/paths.copied.ts');
  setOverridesForTest(EMPTY);
  assert.equal(editedPlan(), EDGE_PATH_2D);
  const net = await import('../src/scene/vessels/network.ts');
  const v = net.MAPPED.find((x) => x.id === 'PV_TRUNK')!;
  setOverridesForTest({ version: 1, nodes: { [v.from]: { dx: 20, dy: 0 } } });
  const p = editedPlan()['PV_TRUNK']!, q = EDGE_PATH_2D['PV_TRUNK']!;
  assert.ok(Math.abs(p[0]![0] - q[0]![0] - 20) < 1e-9);
  setOverridesForTest(EMPTY);
  assert.equal(editedPlan(), EDGE_PATH_2D);
});
