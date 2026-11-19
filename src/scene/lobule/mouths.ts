// Where the vessels that join a disc (a vessel seen end-on) open its wall: 2D's lobule-mouths.js (mouthSite, mouthWords, copied), worked out for this lobule's courses. The central vein, the portal venule, the
// arteriole, the ductule and the tract's lymphatic are drawn as discs (shading.ts); the rim of each has 72 bins of 5 degrees, a bin set where a vessel's lumen crosses it, and the wall line and the pale band are left
// out there so the vessel flows in. The words are written into the disc's own vertices (the `mouth` attribute) and worked out again whenever the radii they depend on change (2D: akRad).
import type { BufferGeometry, BufferAttribute } from 'three';
import { mouthSite, mouthWords } from './from2d/lobule-mouths.generated.js';
import type { Course, P2 } from './geometry.ts';
import type { Batch } from './batch.ts';

/** A vessel that may join a disc: its points (lobule radii) and an id. */
export interface Joiner { id: number; pts: readonly P2[] }
interface Site { cx: number; cy: number; rim: number; list: { ang: number; oid: number }[] }

/** A disc, its sites and the joiners it was found with. */
export interface Disc { centre: P2; rim: number; site: Site | null; ids: number[]; start: number; count: number }

/** How far from a disc's centre (in its radii) an end of a vessel may be and still join it (a vessel starts or ends at the rim or inside it). */
export const JOIN_REACH = 2.2;

/** The discs of one kind (`courses`, in the order they were added to `batch`), each with the joiners whose end lies at it. */
export function buildDiscs(courses: readonly Course[], batch: Batch, rim: number, pool: readonly Joiner[]): Disc[] {
  const byId = new Map<number, Joiner>(pool.map((j) => [j.id, j]));
  return courses.map((c, k) => {
    const a = c.pts[0]!, b = c.pts[c.pts.length - 1]!, centre: P2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const ids = pool.filter((j) => {
      const e0 = j.pts[0]!, e1 = j.pts[j.pts.length - 1]!;
      return Math.min(Math.hypot(e0[0] - centre[0], e0[1] - centre[1]), Math.hypot(e1[0] - centre[0], e1[1] - centre[1])) < rim * JOIN_REACH;
    }).map((j) => j.id);
    const tubes = Object.fromEntries(ids.map((id) => [id, byId.get(id)!]));
    const site = ids.length ? (mouthSite({ id: -1, pts: [a, b] }, tubes, [{ members: [-1, ...ids] }], rim) as Site | null) : null;
    const span = batch.spans[k] ?? { start: 0, count: 0 };
    return { centre, rim, site, ids, start: span.start, count: span.count };
  });
}

const WORDS = [0, 0, 0];
/**
 * Writes the mask of every disc (as the vessels are drawn now) into the geometry, and returns the joining vessels' mean radius at the rims (lobule radii; 0 where nothing joins any disc).
 * `rDisc(d)`: the disc's radius now; `radiiOf(j)`: that joiner's radii at its samples now (an array indexed as its points).
 */
export function writeMouths(geo: BufferGeometry, discs: readonly Disc[], pool: ReadonlyMap<number, Joiner>, rDisc: (d: Disc) => number, radiiOf: (j: Joiner) => ArrayLike<number>): number {
  const a = geo.getAttribute('mouth') as BufferAttribute | undefined;
  if (!a) return 0;
  let sum = 0, n = 0;
  for (const d of discs) {
    WORDS[0] = WORDS[1] = WORDS[2] = 0;
    if (d.site) {
      const tubes = Object.fromEntries(d.ids.map((id) => [id, pool.get(id)!]));
      sum += mouthWords(d.site, rDisc(d), tubes, radiiOf, WORDS) as number; n++;
    }
    for (let v = d.start; v < d.start + d.count; v++) a.setXYZ(v, WORDS[0]!, WORDS[1]!, WORDS[2]!);
  }
  a.needsUpdate = true;
  return n ? sum / n : 0;
}
