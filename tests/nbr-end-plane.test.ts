// THE PALE STEPPED LINE along a vein's shade band (Mohammad, 22 Nov): where a mate's open end lies against a tube (SV_MID past V_IMV's end), `nbr` carried the mate's radius, 0 past the end, and the GPU's blend ramped it from its value to 0 over a whole
// triangle while |x| stayed: "inside the lumen" for twelve rows of the tube, and the shade pull lit the dark band in per-triangle steps. Root cause: the encoding was not linear. `nbr` is now (x, y, z): z the overshoot past the nearer end plane,
// which IS linear in position, so the blend is exact, and the shader (shaders.ts nbrK, nbrT) ends the ink drop and the pull by it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slicesFor } from '../src/scene/circuit/geometry.ts';
import { NETWORK_BY_ID } from '../src/scene/vessels/network.ts';
import { neighbourAttr, nbrMatesOf, cavaMateOf, NBR_STRIDE, NBR_NO_END } from '../src/scene/vessels/neighbour.ts';
import { setSmoothJoins } from '../src/scene/vessels/join-mode.ts';
import { REST, coursesOf, tubularOf } from '../src/scene/vessels/shape.ts';
import { buildTubes } from '../src/scene/vessels/tubes.ts';
import { VESSEL_FS, VESSEL_VS } from '../src/scene/vessels/shaders.ts';

setSmoothJoins(true);
const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const pull = (x: number, y: number, z: number): number => (y > 0 ? smooth(-0.8, 0, (y - Math.abs(x)) / y) * (1 - smooth(0, 0.8 * y, z)) : 0);
const G = 8;

/** Every 8x8 barycentric sample of a vessel's tube triangles: the blended (x, y, z) the GPU hands the shader, and the exact one at the same plane position. */
function samples(id: string): { blend: number[]; exact: number[] }[] {
  const v = NETWORK_BY_ID.get(id)!, b = buildTubes(coursesOf(v, REST), tubularOf(v, slicesFor(id)), v.radius), pos = b.geometry.getAttribute('position').array, nb = neighbourAttr(id, pos)!, idx = b.geometry.index!, run = b.runs[0]!;
  const pts: number[] = [], blends: number[][] = [];
  for (let t = 0; t < idx.count; t += 3) {
    const a = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)] as const; if (a[0] < run.tubeStart || a[0] >= run.tubeStart + run.tubeCount) continue;
    for (let i = 0; i <= G; i++) for (let j = 0; j <= G - i; j++) {
      const w = [i / G, j / G, (G - i - j) / G] as const, f = (arr: ArrayLike<number>, o: number, s: number): number => w[0] * arr[a[0] * s + o]! + w[1] * arr[a[1] * s + o]! + w[2] * arr[a[2] * s + o]!;
      pts.push(f(pos, 0, 3), f(pos, 1, 3), 0); blends.push([f(nb, 0, NBR_STRIDE), f(nb, 1, NBR_STRIDE), f(nb, 2, NBR_STRIDE)]);
    }
  }
  const tr = neighbourAttr(id, new Float32Array(pts))!;
  return blends.map((blend, q) => ({ blend, exact: [tr[q * NBR_STRIDE]!, tr[q * NBR_STRIDE + 1]!, tr[q * NBR_STRIDE + 2]!] }));
}
const singleMate = (): string[] => [...NETWORK_BY_ID.keys()].filter((id) => { try { return nbrMatesOf(id).length === 1 && !cavaMateOf(id); } catch { return false; } });

test('the overshoot z is linear in position: against a mate it is the same at the vertices\' blend as at the exact point, near the end, on every single-mate tube', () => {
  let n = 0;
  for (const id of singleMate()) {
    for (const { blend, exact } of samples(id)) {
      if (exact[2]! < -exact[1]!) continue;   // (far inside the mate's length the nearer-end plane may swap between two vertices: nothing there reads z)
      n++; assert.ok(Math.abs(blend[2]! - exact[2]!) < 1e-5, `${id}: z blends to ${blend[2]} where it is ${exact[2]}`);
    }
  }
  assert.ok(n > 1000, `${n} samples checked`);
});

test('the shade pull ends at the mate\'s end: no pulled sample where the mate is not (single-mate tubes), SV_MID reads exactly, and the error over the network falls to under half of what it was (5858)', () => {
  let total = 0, falsePull = 0, svMid = 0;
  for (const id of [...NETWORK_BY_ID.keys()]) {
    let s; try { s = nbrMatesOf(id).length ? samples(id) : []; } catch { continue; }
    for (const { blend, exact } of s) {
      const m = pull(blend[0]!, blend[1]!, blend[2]!), t = pull(exact[0]!, exact[1]!, exact[2]!);
      if (Math.abs(m - t) > 0.2) { total++; if (id === 'SV_MID') svMid++; }
      if (m > 0.1 && t < 0.02 && nbrMatesOf(id).length === 1) falsePull++;
    }
  }
  assert.equal(svMid, 0, 'SV_MID (past V_IMV\'s end)');
  assert.equal(falsePull, 0, 'a pulled sample where the single mate is not');
  assert.ok(total < 2900, `${total} samples off by more than 0.2 (was 5858)`);
});

test('the cava carries on past its pieces: z is NBR_NO_END against it; the shader cuts by vNbr.z', () => {
  // (a hepatic vein that opens into the cava itself, read from the placed topology: each of the three opens into it on its own since round 19, the left one is the example)
  const id = 'LHV_IVC';
  assert.equal(cavaMateOf(id), 'IVC_IS');
  const v = NETWORK_BY_ID.get(id)!, b = buildTubes(coursesOf(v, REST), tubularOf(v, slicesFor(id)), v.radius), nb = neighbourAttr(id, b.geometry.getAttribute('position').array)!;
  for (let i = 2; i < nb.length; i += NBR_STRIDE) assert.equal(nb[i], NBR_NO_END);
  assert.match(VESSEL_VS, /attribute vec3 nbr;/);
  assert.match(VESSEL_VS, /vNbr = vec3\(nbr\.x, nbr\.y \* \(/);
  assert.match(VESSEL_FS, /\* \(1\.0 - smoothstep\(-0\.5, 0\.5, vNbr\.z \/ max\(vW \* 2\.0 \/ \(res\.y \* projY\), 1e-9\) \* dpr\)\);/);
  assert.match(VESSEL_FS, /\* \(1\.0 - smoothstep\(0\.0, 0\.8 \* vNbr\.y, vNbr\.z\)\)\);/);
});
