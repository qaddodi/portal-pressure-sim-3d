import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CatmullRomCurve3, SphereGeometry, TubeGeometry, Vector3, type BufferGeometry } from 'three';
import { setOverridesForTest } from '../src/editor/store.ts';
import { EMPTY } from '../src/editor/types.ts';
import { endVesselPreview, previewVesselEdits, setVesselPreviewHost } from '../src/scene/vessels/edit-preview.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { x3 } from '../src/scene/frame2d.ts';

const edgeStretch = (g: BufferGeometry, rest: Float32Array): number => {
  const pos = g.getAttribute('position').array as Float32Array, idx = g.getIndex()!.array;
  const len = (a: ArrayLike<number>, i: number, j: number): number => Math.hypot(a[3 * i]! - a[3 * j]!, a[3 * i + 1]! - a[3 * j + 1]!, a[3 * i + 2]! - a[3 * j + 2]!);
  let worst = 0;
  for (let t = 0; t < idx.length; t += 3) for (let k = 0; k < 3; k++) {
    const i = idx[t + k]!, j = idx[t + ((k + 1) % 3)]!, r = len(rest, i, j);
    if (r > 1e-9) worst = Math.max(worst, len(pos, i, j) / r);
  }
  return worst;
};

test('a node drag: the tube end ring stays within half a radius of the node, and a junction skin on it stretches, never tears (no edge over 3 times its rest length)', () => {
  setOverridesForTest(EMPTY);
  // a node of three arms: the portal confluence's, or the first node three tubes meet at
  const at = new Map<string, { id: string; end: 0 | 1 }[]>();
  for (const v of NETWORK_BY_ID.values()) if (!v.feeder && v.pts.length > 3) for (const [n, end] of [[v.from, 0], [v.to, 1]] as const) at.set(n, [...(at.get(n) ?? []), { id: v.id, end }]);
  const [node, arms] = [...at].find(([, l]) => l.length >= 3 && l.every((a) => NETWORK_BY_ID.get(a.id)!.radius > 0))!;
  const v0 = NETWORK_BY_ID.get(arms[0]!.id)!, centre = arms[0]!.end ? v0.pts[v0.pts.length - 1]! : v0.pts[0]!, r = Math.max(...arms.map((a) => NETWORK_BY_ID.get(a.id)!.radius));
  const tubes = new Map<string, BufferGeometry>();
  for (const a of arms) { const v = NETWORK_BY_ID.get(a.id)!; tubes.set(a.id, new TubeGeometry(new CatmullRomCurve3(v.pts.map((p) => new Vector3(p[0], p[1], p[2]))), 60, v.radius, 8, false)); }
  const skin = new SphereGeometry(2 * r, 14, 10); skin.translate(centre[0], centre[1], centre[2]);
  const rest = (skin.getAttribute('position').array as Float32Array).slice();
  setVesselPreviewHost(() => ({ tubes, skins: [{ geometry: skin, arms: arms.map((a) => a.id) }] }));
  const unit = Math.abs(x3(1) - x3(0));
  for (const mult of [1, 3]) {
    const m = (mult * r) / unit;
    previewVesselEdits({ version: 1, nodes: { [node]: { dx: m * 0.8, dy: m * 0.6 } } });
    const want = [centre[0] + 0.8 * mult * r * Math.sign(x3(1) - x3(0) || 1), 0, 0];
    void want;
    // every arm's end ring is within half a radius of the node's new place (the same for all three: they meet)
    const ends = arms.map((a) => {
      const g = tubes.get(a.id)!, pos = g.getAttribute('position').array as Float32Array, ringN = 9, ring = a.end ? 60 : 0, c = [0, 0, 0];
      for (let j = 0; j < 8; j++) for (let q = 0; q < 3; q++) c[q]! += pos[3 * (ring * ringN + j) + q]! / 8;
      return c;
    });
    for (const e of ends) assert.ok(Math.hypot(e[0]! - ends[0]![0]!, e[1]! - ends[0]![1]!, e[2]! - ends[0]![2]!) < 0.5 * r, `arms meet at ${node}`);
    const moved = Math.hypot(ends[0]![0]! - centre[0], ends[0]![1]! - centre[1], ends[0]![2]! - centre[2]);
    assert.ok(Math.abs(moved - mult * r) < 0.5 * r, `the end ring moved ${moved} for a move of ${mult * r}`);
    assert.ok(edgeStretch(skin, rest) <= 3, `${mult} radii: the skin's worst edge is ${edgeStretch(skin, rest)} times its rest length`);
  }
  endVesselPreview();
  setVesselPreviewHost(null);
});
