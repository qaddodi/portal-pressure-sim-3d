// A fan of tributaries (the caput medusae: C3~F:caput) is a TREE of courses: each course ends where its children start (and several roots start at the umbilical hub). Two things follow from that, and both were wrong while every course was
// its own tube: (1) each course wore the host's colour ramp from 0 to 1 over ITS OWN length, so at every fork the parent ended in the downstream colour and its children began in the upstream one, a hard step (pink against purple);
// here every course wears the stretch of the ramp its place in the tree gives it (a child begins at the colour its parent ends in, siblings begin together), so colour is a gradient across every fork. (2) every end at a fork or at the hub
// was its own round cap, caps of different radii stacked on one centre and their ink crossed; here only the widest end at a point keeps its cap and the others run into it, so the point is one round hub.
import type { Course } from './tubes.ts';

/** The caput medusae fan's vessel id (the paraumbilical vein's tributaries that show with the collateral). */
export const CAPUT_FAN_ID = 'C3~F:caput';
/** From this share of a free tributary's course it eases to transparent (to nothing at its tip) and narrows to a fine point: each fan thins out of sight, no cut end. */
export const FAN_TIP_FROM = 0.3;
/** How far toward the viewer the fan is drawn in the depth buffer (scene units, a depth offset only: nothing moves, so no sideways shift in a tilted view). The caput veins lie on the abdominal wall, the most superficial vein of the figure: they draw over every other vessel,
 *  including the epigastric veins that run on to the same navel at the fan's own depth, where a tie went to the wider tube. */
export const FAN_FRONT = 0.03;

const TOL = 1e-4;
const d3 = (a: readonly number[], b: readonly number[]): number => Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
const lengthOf = (pts: readonly (readonly number[])[]): number => { let s = 0; for (let i = 1; i < pts.length; i++) s += d3(pts[i]!, pts[i - 1]!); return s; };

/** The share of the host's ramp each course wears, `[from, to]`, by its depth in the tree of courses (null when the courses do not join end to start: one course, or a set of separate ones). */
export function fanLensRanges(courses: readonly Pick<Course, 'pts'>[]): ([number, number] | null)[] {
  const n = courses.length, len = courses.map((c) => lengthOf(c.pts)), parent = new Array<number>(n).fill(-1);
  for (let i = 0; i < n; i++) {
    const s = courses[i]!.pts[0];
    if (!s) continue;
    for (let j = 0; j < n; j++) if (j !== i && courses[j]!.pts.length && d3(courses[j]!.pts[courses[j]!.pts.length - 1]!, s) < TOL) { parent[i] = j; break; }
  }
  if (!parent.some((p) => p >= 0)) return courses.map(() => null);
  const start = new Array<number>(n).fill(NaN);
  const depth = (i: number, guard = 0): number => {
    if (!Number.isNaN(start[i]!)) return start[i]!;
    return (start[i] = parent[i]! < 0 || guard > n ? 0 : depth(parent[i]!, guard + 1) + len[parent[i]!]!);
  };
  let total = 0;
  for (let i = 0; i < n; i++) total = Math.max(total, depth(i) + len[i]!);
  return courses.map((_, i) => (total > 0 ? [start[i]! / total, (start[i]! + len[i]!) / total] : null));
}

/** The ends that keep a round cap, `[start, end]` per course: at every point where course ends meet, only the widest one (the first of equals) keeps its cap, the others run into it uncapped, so the point is one round hub. */
export function fanCaps(courses: readonly Pick<Course, 'pts' | 'radius'>[]): [boolean, boolean][] {
  const ends: { c: number; e: 0 | 1; p: readonly number[]; r: number }[] = [];
  courses.forEach((c, i) => { if (c.pts.length) { ends.push({ c: i, e: 0, p: c.pts[0]!, r: c.radius }); ends.push({ c: i, e: 1, p: c.pts[c.pts.length - 1]!, r: c.radius }); } });
  const keep = courses.map((): [boolean, boolean] => [true, true]), done = new Set<number>();
  ends.forEach((a, ia) => {
    if (done.has(ia)) return;
    const group = ends.map((b, ib) => ({ b, ib })).filter(({ b }) => d3(a.p, b.p) < TOL);
    group.forEach(({ ib }) => done.add(ib));
    if (group.length < 2) return;
    let best = group[0]!;
    for (const g of group) if (g.b.r > best.b.r) best = g;
    for (const g of group) if (g !== best) keep[g.b.c]![g.b.e] = false;
  });
  return keep;
}

/** The courses whose far end meets no other course: the tips of the tree, `true` each. */
export function fanTips(courses: readonly Pick<Course, 'pts'>[]): boolean[] {
  return courses.map((c, i) => {
    const e = c.pts[c.pts.length - 1];
    return !!e && !courses.some((o, j) => j !== i && o.pts.length > 0 && (d3(o.pts[0]!, e) < TOL || d3(o.pts[o.pts.length - 1]!, e) < TOL));
  });
}
