// Where in the flow each vertex of a junction's skin lies (the rank the Circuit's change peels by), so the body's skin can leave and return as ITS OWN tubes do.
// The tubes peel by rank (circuit/peel.ts: the gut and the spleen first, the heart last). A skin has no course of its own: it is the union of its arms, so a vertex's rank is
// its arms' ranks at their seams, by the vertex's weights. A vessel with no map course (a fork's branch, a strand) has no rank and takes the mean of the others': it does not travel, it fades by the whole change (vessels/shaders.ts circStay).
import { COURSES } from '../../circuit/course.ts';
import type { SkinMesh } from './types.ts';

/** The flow rank of a vessel at `u` along it (0 start, 1 end), NaN when it has no map course. */
export function rankAt(vesselId: string, u: number): number {
  const c = COURSES.get(vesselId);
  if (!c) return NaN;
  const f = Math.min(Math.max(u, 0), 1) * (c.rank.length - 1), i = Math.min(Math.floor(f), c.rank.length - 2), t = f - i;
  return c.rank[i]! * (1 - t) + c.rank[i + 1]! * t;
}

/** One rank per vertex of the skin: its arms' ranks at their seams (skin.cuts[i].u), weighted by the vertex's own weights (they sum to 1). */
export function skinRankOf(skin: Pick<SkinMesh, 'cuts' | 'weight' | 'weight2'>): Float32Array {
  const n = skin.weight.length / 4, own = skin.cuts.map((c) => rankAt(c.vesselId, c.u)), known = own.filter((r) => !Number.isNaN(r));
  const mean = known.length ? known.reduce((a, b) => a + b, 0) / known.length : 0, arms = own.map((r) => (Number.isNaN(r) ? mean : r)), out = new Float32Array(n);
  for (let v = 0; v < n; v++) {
    let r = 0, w = 0;
    for (let i = 0; i < arms.length; i++) {
      const a = i < 4 ? skin.weight[4 * v + i]! : skin.weight2[2 * v + (i - 4)]!;
      r += a * arms[i]!; w += a;
    }
    out[v] = w > 1e-6 ? r / w : 0;
  }
  return out;
}
