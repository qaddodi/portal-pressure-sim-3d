import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { applyVesselOverrides } from '../src/editor/vessel-apply.ts';
import { setOverridesForTest } from '../src/editor/store.ts';
import { EMPTY } from '../src/editor/types.ts';
import { EDGES } from '../src/engine/hales/portal/topology.js';
import { EDGE_PATH_2D } from '../src/scene/vessels/paths.copied.ts';

type Pt = readonly [number, number];
const edges = EDGES as { id: string; from: string; to: string; kind: string }[];
const arc = (p: readonly Pt[]): number => p.reduce((t, q, i) => (i ? t + Math.hypot(q[0] - p[i - 1]![0], q[1] - p[i - 1]![1]) : 0), 0);
const maxTurn = (p: readonly Pt[]): number => {
  let m = 0;
  for (let i = 1; i < p.length - 1; i++) {
    const a = [p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1]], b = [p[i + 1]![0] - p[i]![0], p[i + 1]![1] - p[i]![1]];
    m = Math.max(m, Math.acos(Math.min(1, Math.max(-1, (a[0]! * b[0]! + a[1]! * b[1]!) / ((Math.hypot(a[0]!, a[1]!) * Math.hypot(b[0]!, b[1]!)) || 1)))));
  }
  return (m * 180) / Math.PI;
};

test('a node of three or more arms of very different lengths: every arm end lands on the node, the arms keep their heading, and none bends hard', () => {
  const at = new Map<string, typeof edges>();
  for (const e of edges) if (EDGE_PATH_2D[e.id]) for (const n of [e.from, e.to]) at.set(n, [...(at.get(n) ?? []), e]);
  const nodes = [...at].filter(([, l]) => l.length >= 3 && Math.max(...l.map((e) => arc(EDGE_PATH_2D[e.id] as readonly Pt[]))) > 4 * Math.min(...l.map((e) => arc(EDGE_PATH_2D[e.id] as readonly Pt[]))));
  assert.ok(nodes.length >= 2, 'the figure has nodes with arms of very different lengths');
  for (const [node, list] of nodes) {
    const shortest = Math.min(...list.map((e) => arc(EDGE_PATH_2D[e.id] as readonly Pt[]))), m = shortest / 3, mv = { dx: m * 0.8, dy: -m * 0.6 };
    for (const e of list) {
      const p = EDGE_PATH_2D[e.id] as readonly Pt[], end = e.from === node ? 0 : 1, last = p.length - 1;
      const r = applyVesselOverrides(e, p, { version: 1, nodes: { [node]: mv } });
      const q = r.path[end ? last : 0]!, o = p[end ? last : 0]!;
      assert.ok(Math.abs(q[0] - o[0] - mv.dx) < 1e-9 && Math.abs(q[1] - o[1] - mv.dy) < 1e-9, `${e.id} end at ${node}`);
      const dir = (s: readonly Pt[]): number => (end ? Math.atan2(s[last]![1] - s[last - 1]![1], s[last]![0] - s[last - 1]![0]) : Math.atan2(s[1]![1] - s[0]![1], s[1]![0] - s[0]![0]));
      assert.ok(Math.abs(Math.atan2(Math.sin(dir(r.path) - dir(p)), Math.cos(dir(r.path) - dir(p)))) < 0.12, `${e.id} leaves ${node} in its own direction`);
      assert.ok(maxTurn(r.path) <= maxTurn(p) + 14, `${e.id} at ${node}: ${maxTurn(r.path)} against ${maxTurn(p)}`);
    }
  }
});

test('both ends of a short vessel edited at once: ends exact, finite, no fold, and the bend is bounded', () => {
  const short = edges.filter((e) => EDGE_PATH_2D[e.id] && e.kind !== 'liver').sort((a, b) => arc(EDGE_PATH_2D[a.id] as readonly Pt[]) - arc(EDGE_PATH_2D[b.id] as readonly Pt[])).find((e) => arc(EDGE_PATH_2D[e.id] as readonly Pt[]) > 20)!;
  const p = EDGE_PATH_2D[short.id] as readonly Pt[], L = arc(p), m = L / 4;
  const r = applyVesselOverrides(short, p, { version: 1, nodes: { [short.from]: { dx: m, dy: 0 }, [short.to]: { dx: -m * 0.5, dy: m } } });
  assert.ok(r.path.every((q) => Number.isFinite(q[0]) && Number.isFinite(q[1])));
  assert.ok(Math.abs(r.path[0]![0] - p[0]![0] - m) < 1e-9 && Math.abs(r.path[p.length - 1]![1] - p[p.length - 1]![1] - m) < 1e-9);
  // never folds back on itself: consecutive bones keep a positive dot product
  for (let i = 1; i < r.path.length - 1; i++) {
    const a = [r.path[i]![0] - r.path[i - 1]![0], r.path[i]![1] - r.path[i - 1]![1]], b = [r.path[i + 1]![0] - r.path[i]![0], r.path[i + 1]![1] - r.path[i]![1]];
    assert.ok(a[0]! * b[0]! + a[1]! * b[1]! > 0, `${short.id} folds at ${i}`);
  }
});

test('a node dz joins arms of different tiers without a step: every arm end gains the same dz, eased smoothly down the arm', () => {
  const p = [[0, 0], [10, 0], [20, 0], [30, 0], [40, 0], [50, 0], [60, 0], [70, 0], [80, 0], [90, 0], [100, 0]] as const;
  const dz = 0.05;
  for (const [id, from] of [['ARTERY_ARM', 'N'], ['VEIN_ARM', 'N']] as const) {
    const r = applyVesselOverrides({ id, from, to: 'FAR' }, p, { version: 1, nodes: { N: { dx: 0, dy: 0, dz } } });
    assert.ok(Math.abs(r.dz![0]! - dz) < 1e-12 && r.dz![10] === 0);
    let prev = dz;
    for (let i = 1; i < 11; i++) { assert.ok(r.dz![i]! <= prev + 1e-12 && prev - r.dz![i]! < dz * 0.5, `step at ${i}`); prev = r.dz![i]!; }
  }
});

/** Runs the probe in a fresh process: the network is built from the overrides at import. */
function probe(over: object): { minBend: Record<string, number>; r: Record<string, number>; moved: Record<string, number> } {
  const code = `
    import { setOverridesForTest } from './src/editor/store.ts';
    setOverridesForTest(${JSON.stringify(over)});
    const { centrelineOf } = await import('./src/scene/vessels/centreline.ts');
    const out = { minBend: {}, r: {}, moved: {} };
    for (const id of ['PV_TRUNK', 'C8']) {
      const c = centrelineOf(id); if (!c) continue;
      const P = Array.from({ length: 201 }, (_, i) => c.pointAt(i / 200));
      let min = Infinity;
      for (let i = 1; i < 200; i++) {
        const a = P[i - 1], b = P[i], d = P[i + 1], A = Math.hypot(b[0]-a[0], b[1]-a[1], b[2]-a[2]), B = Math.hypot(d[0]-b[0], d[1]-b[1], d[2]-b[2]), C = Math.hypot(d[0]-a[0], d[1]-a[1], d[2]-a[2]);
        const cr = [(b[1]-a[1])*(d[2]-a[2]) - (b[2]-a[2])*(d[1]-a[1]), (b[2]-a[2])*(d[0]-a[0]) - (b[0]-a[0])*(d[2]-a[2]), (b[0]-a[0])*(d[1]-a[1]) - (b[1]-a[1])*(d[0]-a[0])];
        const area2 = Math.hypot(cr[0], cr[1], cr[2]);
        if (area2 > 1e-12) min = Math.min(min, (A * B * C) / (2 * area2));
      }
      out.minBend[id] = min; out.r[id] = c.radiusAt(0.5); out.moved[id] = c.pointAt(0.5)[0];
    }
    console.log(JSON.stringify(out));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { cwd: process.cwd(), encoding: 'utf8', timeout: 120000 });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout.trim().split('\n').pop()!);
}

test('a strong bend of the portal trunk and C8 keeps the centreline a clot rides on gentler than the lumen: the radius of the tightest bend stays above the vessel radius', () => {
  const base = probe(EMPTY), out = probe({ version: 1, vessels: { PV_TRUNK: { pts: [{ u: 0.5, dx: 14, dy: 0 }] }, C8: { pts: [{ u: 0.5, dx: 14, dy: 0 }] } } });
  for (const id of ['PV_TRUNK', 'C8']) {
    assert.ok(out.moved[id]! !== base.moved[id]!, `${id} bent`);
    assert.ok(out.minBend[id]! > out.r[id]!, `${id}: tightest bend radius ${out.minBend[id]} against the lumen ${out.r[id]}`);
  }
});
