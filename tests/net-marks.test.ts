// N3 of the Opus review of the net mesh (WP3, 22 Nov): the fragment stage takes the marks' phase (chevrons, dust, streaks) from the dominant bone's edge, so inside a fillet, where the dominant edge switches (and a triangle's vertices carry different edges'
// parameters), the phase steps or blends. Rule (2D ends a branch's marks at the host wall): in a fillet the marks fade out by the dominant edge's share of the vertex's bone weight (smoothstep(MARK_FROM, MARK_TO)), and a fragment whose
// dominant edge row (interpolated) is not its triangle's (flat) is in a mixed triangle and has none. So no two edges' phases are ever blended.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNetMesh } from '../src/scene/vessels/net/mesh.ts';
import { MARK_FROM, MARK_ROW_TOL, MARK_TO, NET_FS, NET_VS } from '../src/scene/vessels/net/shaders.ts';
import { fixtures } from './net-lib.ts';

const smooth = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

for (const fx of fixtures()) {
  const r = buildNetMesh(fx.skel), m = r.mesh;
  const reps = r.nodes.filter((n) => n.kind === 'junction' && n.caps);
  if (!reps.length) continue;
  // a vertex's dominant edge (by bone weight summed over its edge) and that edge's share
  const dom = (v: number): { edge: number; share: number } => {
    const w = new Map<number, number>();
    for (let j = 0; j < 4; j++) { const wb = m.weight[4 * v + j]!; if (wb > 0) { const e = fx.skel.bones[m.bone[4 * v + j]!]!.edge; w.set(e, (w.get(e) ?? 0) + wb); } }
    let edge = -1, share = 0;
    for (const [e, x] of w) if (x > share) { share = x; edge = e; }
    return { edge, share };
  };
  test(`${fx.name}: in a fillet a fragment has marks only where its triangle's three vertices share one dominant edge (the phases of two edges are never blended)`, () => {
    let mixedSamples = 0, mixedWithMarks = 0, pureTris = 0;
    for (const n of reps) for (let q = n.triStart; q < n.triStart + n.triCount; q++) {
      const vs = [0, 1, 2].map((j) => m.index[3 * q + j]!), ds = vs.map(dom), rows = ds.map((d) => d.edge), flat = rows[2]!;   // (the provoking vertex of a flat varying is the last)
      const mixed = new Set(rows).size > 1;
      if (!mixed) pureTris++;
      for (let i = 1; i < 10; i++) for (let j = 1; j < 10 - i; j++) {   // (the interior: on a triangle's own edge between two vertices of the provoking vertex's edge the row is exactly its flat value)
        const b = [i / 10, j / 10, 1 - i / 10 - j / 10], row = b[0]! * rows[0]! + b[1]! * rows[1]! + b[2]! * rows[2]!;
        const purity = 1 - smooth(0, MARK_ROW_TOL, Math.abs(row - flat));
        if (!mixed) assert.equal(purity, 1, 'a triangle of one edge keeps its marks');
        else { mixedSamples++; if (purity > 0) mixedWithMarks++; }
      }
    }
    assert.ok(pureTris > 0);
    // (a mixed triangle has marks only in the sliver along its edge of the provoking vertex's own edge)
    assert.ok(mixedSamples === 0 || mixedWithMarks / mixedSamples < 0.03, `${mixedWithMarks} of ${mixedSamples} samples of mixed triangles keep marks`);
  });
}

test('the marks\' weight is the dominant edge\'s share, eased; both stages carry it, and the dust and the chevrons take it', () => {
  assert.ok(MARK_FROM < MARK_TO && MARK_FROM > 0.5);
  assert.ok(NET_VS.includes(`markK = smoothstep(${MARK_FROM}, ${MARK_TO}, wmax);`) || NET_VS.includes(`markK = smoothstep(${MARK_FROM.toFixed(1)}, ${MARK_TO}, wmax);`));
  assert.match(NET_VS, /vMarkE = vec2\(markK, rowA\);/);
  assert.match(NET_FS, /float markK = vMarkE\.x \* \(1\.0 - smoothstep\(0\.0, 0\.02, abs\(vMarkE\.y - vEdge\.x\)\)\);/);
  assert.match(NET_FS, /fd = clamp\(fd, 0\.0, 1\.0\) \* dHold\(fadeHere\) \* markK;/);
  assert.match(NET_FS, /hd = clamp\(hd, 0\.0, 1\.0\) \* markK;/);
});
