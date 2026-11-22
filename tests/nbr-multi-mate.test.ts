// THE DOTTED SEAM ROW on the splenic vein (Mohammad, 22 Nov). A tube with several mates (SV_CONF: V_IMV, SMV_CONF, PV_TRUNK_1) takes, per vertex, the deepest mate's signed distance and radius; the GPU blends them across a triangle, and a blend of a vertex
// on one mate's left (+0.02) and a vertex on another's right (-0.6) crosses zero: "on the axis, deep inside the lumen" where there is none. The tube dropped the pixels there (the dotted row of holes). Root cause: the sign. With several mates the distance is unsigned (neighbour.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slicesFor } from '../src/scene/circuit/geometry.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { neighbourAttr, nbrMatesOf } from '../src/scene/vessels/neighbour.ts';
import { setSmoothJoins } from '../src/scene/vessels/join-mode.ts';
import { REST, coursesOf, tubularOf } from '../src/scene/vessels/shape.ts';
import { buildTubes } from '../src/scene/vessels/tubes.ts';

setSmoothJoins(true);
const build = (id: string) => { const v = NETWORK_BY_ID.get(id)!; return buildTubes(coursesOf(v, REST), tubularOf(v, slicesFor(id)), v.radius); };

test('a tube with several mates carries its distance from them unsigned; with one mate it stays signed', () => {
  assert.ok(nbrMatesOf('SV_CONF').length > 1 && nbrMatesOf('PV_TRUNK_1').length > 1);
  for (const id of ['SV_CONF', 'PV_TRUNK_1']) {
    const a = neighbourAttr(id, build(id).geometry.getAttribute('position').array)!;
    for (let i = 0; i < a.length; i += 2) assert.ok(a[i]! >= 0, `${id}: vertex ${i / 2} has a negative distance`);
  }
  const one = NETWORK_BY_ID.has('A_HL') ? 'A_HL' : null;
  if (one && nbrMatesOf(one).length === 1) { const a = neighbourAttr(one, build(one).geometry.getAttribute('position').array)!; assert.ok([...a].some((x, i) => i % 2 === 0 && x < 0), 'one mate: the sign is kept'); }
});

test('no pixel just outside the splenic vein or the portal trunk is read as inside a mate when none covers it (the blend of two mates no longer crosses zero)', () => {
  for (const id of ['SV_CONF', 'PV_TRUNK_1']) {
    const v = NETWORK_BY_ID.get(id)!, b = build(id), pos = b.geometry.getAttribute('position').array, nb = neighbourAttr(id, pos)!, idx = b.geometry.index!, run = b.runs[0]!;
    const ax = coursesOf(v, REST).reduce((a, c) => (c.radius > a.radius ? c : a)).pts;
    const dAx = (x: number, y: number): number => { let m = 1e9; for (let i = 0; i < ax.length - 1; i++) { const X = ax[i]![0]!, Y = ax[i]![1]!, dx = ax[i + 1]![0]! - X, dy = ax[i + 1]![1]! - Y, l = dx * dx + dy * dy || 1e-12, t = Math.min(1, Math.max(0, ((x - X) * dx + (y - Y) * dy) / l)); m = Math.min(m, Math.hypot(x - X - dx * t, y - Y - dy * t)); } return m; };
    const G = 8, pts: number[] = [], inside: number[] = [];
    for (let t = 0; t < idx.count; t += 3) {
      const a = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)] as const; if (a[0] < run.tubeStart || a[0] >= run.tubeStart + run.tubeCount) continue;
      for (let i = 0; i <= G; i++) for (let j = 0; j <= G - i; j++) {
        const w = [i / G, j / G, (G - i - j) / G] as const, f = (arr: ArrayLike<number>, o: number, s: number): number => w[0] * arr[a[0] * s + o]! + w[1] * arr[a[1] * s + o]! + w[2] * arr[a[2] * s + o]!;
        const y = f(nb, 1, 2), x = f(nb, 0, 2); if (!(y > 0)) continue;
        const px = f(pos, 0, 3), py = f(pos, 1, 3), d = dAx(px, py) / v.radius; if (d < 0.97 || d > 1.15) continue;   // the outline band, just outside the lumen
        pts.push(px, py, 0); inside.push((y - Math.abs(x)) / v.radius);
      }
    }
    const truth = neighbourAttr(id, new Float32Array(pts))!;
    let wrong = 0;
    for (let q = 0; q < inside.length; q++) { const td = truth[q * 2 + 1]! > 0 ? (truth[q * 2 + 1]! - Math.abs(truth[q * 2]!)) / v.radius : -9; if (inside[q]! > 0.1 && td < -0.02) wrong++; }
    assert.equal(wrong, 0, `${id}: ${wrong} outline-band samples read as inside a mate that does not cover them`);
  }
});
