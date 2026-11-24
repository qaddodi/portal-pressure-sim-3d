// The organ names' other spots on the APPROVED placement (docs/approved/anatomy-placement.md): organ-names.copied.js `nameSpots`, the 2D app's own rule, run on the placed organs'
// front silhouettes and name anchors (anatomy/source.ts PLACED_ORGAN_RINGS, PLACED_ORGAN_NAMES) instead of the 2D outlines. The copied file is not edited: its constants are read
// from it, and only the outlines it reads are swapped. Worked out once per name, the first time it is asked, and kept.
// @ts-ignore copied plain JS
import { NAME_ORGAN, NEAR, REACH, STEP, APART, MOST } from './organ-names.copied.js';
import { PLACED_ORGAN_RINGS, PLACED_ORGAN_NAMES } from '../../anatomy/source.ts';

type Ring = readonly (readonly [number, number])[];
const inRing = (x: number, y: number, P: Ring): boolean => {
  let c = false;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) if ((P[i]![1] > y) !== (P[j]![1] > y) && x < ((P[j]![0] - P[i]![0]) * (y - P[i]![1])) / (P[j]![1] - P[i]![1]) + P[i]![0]) c = !c;
  return c;
};
const inside = (rings: readonly Ring[], x: number, y: number): boolean => rings.reduce((n, P) => n + (inRing(x, y, P) ? 1 : 0), 0) % 2 === 1;
const away = (rings: readonly Ring[], x: number, y: number): number => {
  let d = Infinity;
  for (const P of rings) for (let i = 0; i < P.length; i++) {
    const a = P[i]!, b = P[(i + 1) % P.length]!, ex = b[0] - a[0], ey = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * ex + (y - a[1]) * ey) / (ex * ex + ey * ey || 1)));
    d = Math.min(d, Math.hypot(x - a[0] - ex * t, y - a[1] - ey * t));
  }
  return d;
};

/** Where a name stands on the placed figure (2D world units), or null for a name the placement has no organ for. */
export const placedAnchor = (name: string): readonly [number, number] | null => { const p = PLACED_ORGAN_NAMES[name]; return p ? [p[0], p[1]] : null; };

const kept = new Map<string, [number, number][]>();
/** nameSpots on the placed organs: the other places a caption may stand ([x, y], 2D world units, its box's centre), nearest its anchor first; [] for a name with no placed organ. */
export function placedNameSpots(name: string): [number, number][] {
  const had = kept.get(name);
  if (had) return had;
  const at = placedAnchor(name), rings = PLACED_ORGAN_RINGS[(NAME_ORGAN as Record<string, string>)[name] ?? ''] ?? [];
  const out: [number, number][] = [];
  if (at && rings.length) {
    const [ax, ay] = at, own = inside(rings, ax, ay), cands: [number, number, number][] = [];
    for (let dx = -REACH; dx <= REACH; dx += STEP) for (let dy = -REACH; dy <= REACH; dy += STEP) {
      if (!dx && !dy) continue;
      const d = Math.hypot(dx, dy), x = ax + dx, y = ay + dy;
      if (d > REACH) continue;
      if (own ? inside(rings, x, y) : inside(rings, x, y) || away(rings, x, y) <= NEAR) cands.push([x, y, d]);
    }
    for (const [x, y] of cands.sort((p, q) => p[2] - q[2])) if (out.length < MOST && out.every(([u, v]) => Math.hypot(u - x, v - y) >= APART)) out.push([x, y]);
  }
  kept.set(name, out);
  return out;
}
