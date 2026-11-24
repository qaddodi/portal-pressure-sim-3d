import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyVesselOverrides, armFalloff } from '../src/editor/vessel-apply.ts';
import { EMPTY } from '../src/editor/types.ts';
import { EDGE_PATH_2D } from '../src/scene/vessels/paths.copied.ts';
import { EDGES } from '../src/engine/hales/portal/topology.js';

type Pt = readonly [number, number];
const edge = (id: string): { id: string; from: string; to: string } => (EDGES as { id: string; from: string; to: string }[]).find((e) => e.id === id)!;
/** The sharpest turn between two consecutive bones, in degrees. */
function maxTurn(p: readonly Pt[]): number {
  let m = 0;
  for (let i = 1; i < p.length - 1; i++) {
    const a = [p[i]![0] - p[i - 1]![0], p[i]![1] - p[i - 1]![1]], b = [p[i + 1]![0] - p[i]![0], p[i + 1]![1] - p[i]![1]];
    const c = (a[0]! * b[0]! + a[1]! * b[1]!) / ((Math.hypot(a[0]!, a[1]!) * Math.hypot(b[0]!, b[1]!)) || 1);
    m = Math.max(m, Math.acos(Math.min(1, Math.max(-1, c))));
  }
  return (m * 180) / Math.PI;
}
const side = (p: readonly Pt[]): Pt => { const a = p[0]!, b = p[p.length - 1]!, l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l]; };

test('the node falloff is C2: value 1 at the node, 0 at the reach, zero slope and curvature at both', () => {
  assert.equal(armFalloff(0, 10), 1); assert.equal(armFalloff(10, 10), 0);
  const h = 1e-3, f = (d: number): number => armFalloff(d, 10);
  for (const d of [h, 10 - h]) { assert.ok(Math.abs((f(d + h) - f(d - h)) / (2 * h)) < 1e-3); assert.ok(Math.abs((f(d + h) - 2 * f(d) + f(d - h)) / (h * h)) < 2e-2); }
});

test('empty overrides: the very same path, nothing refitted', () => {
  const p = EDGE_PATH_2D['PV_TRUNK']!;
  assert.equal(applyVesselOverrides(edge('PV_TRUNK'), p as readonly Pt[], EMPTY).path, p);
});

test('a node move or a control point bends the course by no more than a gentle turn, and the arm leaves its node in the same direction', () => {
  for (const id of ['PV_TRUNK', 'IVC_IS', 'SV_CONF']) {
    const e = edge(id), p = EDGE_PATH_2D[id]! as readonly Pt[], before = maxTurn(p), [nx, ny] = side(p);
    for (const radii of [2, 4, 8]) {
      const m = 3 * radii;   // (radius 3 plan units)
      const node = applyVesselOverrides(e, p, { version: 1, nodes: { [e.from]: { dx: nx * m, dy: ny * m } } }, { radius: 3 });
      const ctrl = applyVesselOverrides(e, p, { version: 1, vessels: { [id]: { pts: [{ u: 0.5, dx: nx * m, dy: ny * m }] } } }, { radius: 3 });
      assert.ok(maxTurn(node.path) <= before + 9, `${id} node ${radii} radii: ${maxTurn(node.path)} against ${before}`);
      assert.ok(maxTurn(ctrl.path) <= before + 9, `${id} control ${radii} radii: ${maxTurn(ctrl.path)} against ${before}`);
      // the node moves by the whole move; the direction the arm leaves it in stays within a few degrees (the falloff is flat at the node)
      assert.ok(Math.abs(node.path[0]![0] - p[0]![0] - nx * m) < 1e-9 && Math.abs(node.path[0]![1] - p[0]![1] - ny * m) < 1e-9);
      const dir = (q: readonly Pt[]): number => Math.atan2(q[1]![1] - q[0]![1], q[1]![0] - q[0]![0]);
      assert.ok(Math.abs(dir(node.path) - dir(p)) < 0.05, `${id} leaves its node turned by ${dir(node.path) - dir(p)}`);
    }
  }
});
