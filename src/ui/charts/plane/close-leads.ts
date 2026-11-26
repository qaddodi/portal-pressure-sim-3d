// Dots that touch each give their name a leader (capture 36b7deac, slide 12 of Sites and causes: Portal vein thrombosis and Schistosomiasis sit on one spot, two names stood beside it and nothing said
// which was whose). The 2D layout (layout.generated.js) gives a name a leader only when it must stand away from its point; that rule says nothing of a point that has company, and the file is a copy
// that is never edited here. So the 3D side holds the rule for every plane that draws names: a point whose ring meets another point's has a leader to its name, long enough to see, and a name that
// stood close enough to need none is slid out along its own line until the leader shows. Pure on the layout's numbers; tests/plane-close-leads.test.ts.
import type { Box, Fr, PlacedName } from './model.ts';

interface Pt { x: number; y: number }

/** Two dots are "together" when their centres are closer than this many dot radii: rings that touch, or leave less than a dot's width of air. */
export const TOGETHER = 4;
/** The leader's least length from the point's centre, in dot radii beyond one: the ring's own half-line, then a line the eye can find. */
export const LEAD_PAST = 14;

const meets = (b: Box, o: Box) => b[0] < o[2] && b[2] > o[0] && b[1] < o[3] && b[3] > o[1];
const nearestOn = (b: Box, p: Pt): [number, number] => [Math.min(Math.max(p.x, b[0]), b[2]), Math.min(Math.max(p.y, b[1]), b[3])];

/** The indices of the points that have another point within TOGETHER radii. */
export function togetherPoints(at: readonly Pt[], pr: number): Set<number> {
  const out = new Set<number>();
  for (let i = 0; i < at.length; i++) for (let j = i + 1; j < at.length; j++) if (Math.hypot(at[i]!.x - at[j]!.x, at[i]!.y - at[j]!.y) < TOGETHER * pr) { out.add(i); out.add(j); }
  return out;
}

/** The names with a leader for every point that has company (a name already on a leader keeps it).
 *  at: the points in px; names: the layout's, one per point or null; fr: the plot's frame;
 *  avoid: the zone words' and line names' boxes a slid name must keep clear of. Returns new names; the input is not changed. */
export function leadTogether(at: readonly Pt[], names: readonly (PlacedName | null)[], pr: number, fr: Fr, avoid: readonly Box[]): (PlacedName | null)[] {
  const out = names.map((n) => (n ? { ...n, box: [...n.box] as Box } : null));
  const together = togetherPoints(at, pr), want = pr + LEAD_PAST;
  const inside = (b: Box) => b[0] >= fr.L + 2 && b[2] <= fr.R - 2 && b[1] >= fr.T && b[3] <= fr.B - 2;
  for (const i of together) {
    const n = out[i], p = at[i]!;
    if (!n || n.lead) continue;
    let [lx, ly] = nearestOn(n.box, p);
    const d = Math.hypot(lx - p.x, ly - p.y);
    if (d < want) {
      // (Slid straight out from the point, by the least that shows the line, and only to a place that is clear; a place with no room keeps the short line it has.)
      const ux = d > 0.01 ? (lx - p.x) / d : 1, uy = d > 0.01 ? (ly - p.y) / d : 0, turn = Math.atan2(uy, ux);
      slide: for (const k of [1, 0.75, 0.5, 0.25]) {
        // (straight out first, then a little round to either side of it)
        for (const a of [0, 0.5, -0.5, 1, -1]) {
          const vx = Math.cos(turn + a), vy = Math.sin(turn + a), s = (want - d) * k;
          const b: Box = [n.box[0] + vx * s, n.box[1] + vy * s, n.box[2] + vx * s, n.box[3] + vy * s];
          const hits = avoid.some((o) => meets(b, o)) || out.some((o, j) => j !== i && o && meets(b, o.box))
            || at.some((q, j) => j !== i && meets(b, [q.x - pr - 2, q.y - pr - 2, q.x + pr + 2, q.y + pr + 2]));
          if (!inside(b) || hits) continue;
          n.x += vx * s; n.y += vy * s; n.box = b;
          [lx, ly] = nearestOn(b, p);
          break slide;
        }
      }
    }
    n.lead = [lx, ly];
  }
  return out;
}
