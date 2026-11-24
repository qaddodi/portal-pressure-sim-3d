// Where the Lobule's tubes meet (pure, numbers in and out): the junctions of a set of courses (a Y where ends meet at one place, a T where an end lands on another course's side), and the
// refinement of a course's end samples. Shared by the weld planner (welds.ts) and by the one-time bend of the network (weld-bend.ts), so both see the same junctions.
import type { V3, WeldCourse } from './welds.ts';

/** Two course ends closer than this (scene units) are one place. */
export const TOUCH = 4e-4;

const hyp = Math.hypot;
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export interface Touch { c: number; end: 0 | 1; to: number; seg: number; t: number; x: number; y: number; atEnd: boolean }

/** Plan distance from (x, y) to the segment a-b, with the foot's parameter. */
function footOnSegment(x: number, y: number, a: V3, b: V3): { d: number; t: number } {
  const bx = b[0] - a[0], by = b[1] - a[1], bb = bx * bx + by * by;
  let t = bb > 0 ? ((x - a[0]) * bx + (y - a[1]) * by) / bb : 0;
  t = Math.min(1, Math.max(0, t));
  return { d: hyp(x - a[0] - t * bx, y - a[1] - t * by), t };
}

/** How many segment distances `findTouches` has worked out (a counter, so a test can hold the work to a budget without a clock: tests/boot-work-budget.test.ts). */
export const touchWork = { segments: 0 };

/** Every place one course's end touches another course of its family.
 *  Root cause of the Lobule's 235 ms (laptop, cold) in the scene's constructor, and of the weld planner's own seconds on a phone: every end was measured against EVERY segment of EVERY other course
 *  (about 12 million `hypot`s a pass, three passes), though a place can only touch what lies within `touch` of it. A segment whose box, grown by the best distance so far, does not hold the end cannot be nearer
 *  than that distance, so it is skipped before any arithmetic; a course's own box is tried first. The answer is the same (the test holds it against the plain loop). */
export function findTouches(cs: readonly WeldCourse[], touch: number): Touch[] {
  const out: Touch[] = [];
  // (each course's box in the plan, once)
  const box = cs.map((c) => { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of c.pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; } return [x0, y0, x1, y1] as const; });
  cs.forEach((c, i) => {
    for (const end of [0, 1] as const) {
      const P = end === 0 ? c.pts[0]! : c.pts[c.pts.length - 1]!;
      const px = P[0], py = P[1];
      let best: Touch | null = null, bd = touch;
      cs.forEach((o, j) => {
        if (j === i || o.family !== c.family) return;
        const b = box[j]!;
        if (px < b[0] - bd || px > b[2] + bd || py < b[1] - bd || py > b[3] + bd) return;
        const pts = o.pts;
        let ax = pts[0]![0], ay = pts[0]![1];
        for (let s = 0; s < pts.length - 1; s++) {
          const bx = pts[s + 1]![0], by = pts[s + 1]![1];
          // (the segment's own box, grown by the best so far: a end outside it is farther than `bd`, and `<` would not take it)
          if (!((ax < bx ? px < ax - bd || px > bx + bd : px < bx - bd || px > ax + bd) || (ay < by ? py < ay - bd || py > by + bd : py < by - bd || py > ay + bd))) {
            touchWork.segments++;
            const f = footOnSegment(px, py, pts[s]!, pts[s + 1]!);
            if (f.d < bd) { bd = f.d; best = { c: i, end, to: j, seg: s, t: f.t, x: lerp(ax, bx, f.t), y: lerp(ay, by, f.t), atEnd: (s === 0 && f.t < 1e-6) || (s === pts.length - 2 && f.t > 1 - 1e-6) }; }
          }
          ax = bx; ay = by;
        }
      });
      if (best) out.push(best);
    }
  });
  return out;
}

export interface Node { id: string; kind: 'Y' | 'T'; J: V3; ends: { c: number; end: 0 | 1 }[]; host?: { c: number; seg: number; t: number } }

/** The junctions of the network: ends that meet at one place (Y), and ends that land on the side of another course (T). */
export function findNodes(cs: readonly WeldCourse[], touch: number): Node[] {
  const touches = findTouches(cs, touch), nodes: Node[] = [], used = new Set<string>();
  const endKey = (c: number, end: number) => `${c}:${end}`;
  // ends that meet another course's END: cluster the ends that lie at one place
  const endTouch = touches.filter((t) => t.atEnd);
  for (const t of endTouch) {
    if (used.has(endKey(t.c, t.end))) continue;
    const c = cs[t.c]!, P = t.end === 0 ? c.pts[0]! : c.pts[c.pts.length - 1]!;
    const ends: { c: number; end: 0 | 1 }[] = [];
    cs.forEach((o, j) => { for (const e of [0, 1] as const) { const Q = e === 0 ? o.pts[0]! : o.pts[o.pts.length - 1]!; if (hyp(Q[0] - P[0], Q[1] - P[1]) < touch && !used.has(endKey(j, e)) && o.family === c.family) ends.push({ c: j, end: e }); } });
    if (ends.length < 2) continue;
    for (const e of ends) used.add(endKey(e.c, e.end));
    const J: V3 = [0, 0, 0];
    for (const e of ends) { const o = cs[e.c]!, Q = e.end === 0 ? o.pts[0]! : o.pts[o.pts.length - 1]!; for (let d = 0; d < 3; d++) J[d] += Q[d]! / ends.length; }
    nodes.push({ id: `Y(${ends.map((e) => `${cs[e.c]!.key}.${e.end}`).join('+')})`, kind: 'Y', J, ends });
  }
  // ends that land on a side
  for (const t of touches) {
    if (t.atEnd || used.has(endKey(t.c, t.end))) continue;
    used.add(endKey(t.c, t.end));
    const h = cs[t.to]!, z = lerp(h.pts[t.seg]![2], h.pts[t.seg + 1]![2], t.t);
    nodes.push({ id: `T(${cs[t.c]!.key}.${t.end}>${h.key})`, kind: 'T', J: [t.x, t.y, z], ends: [{ c: t.c, end: t.end }], host: { c: t.to, seg: t.seg, t: t.t } });
  }
  return nodes;
}

/** The first seam candidate on a refined arm is this many radii from the end, and each further one this many times as far as the last. */
export const REFINE_FIRST_R = 1.6, REFINE_GROW = 1.45;
/** A segment at an end is refined when it is longer than this many of the end's radii. */
export const REFINE_OVER_R = 3;

/** A copy of `cs` with extra samples in the first segment at each end of a course whose radius is small beside its sample spacing (the bile canaliculi: a hair of 0.0002 on samples 0.026 apart, so the
 *  first sample is 130 radii from the junction and the seam, one of the samples, was 450 radii out and the skin a thousand vertices of nothing). The new samples lie on the segment itself, at
 *  distances growing by REFINE_GROW from REFINE_FIRST_R radii, so the seam can stand a few radii from the junction. The tube is the same line; it only has more rings there. */
export function refineEnds(cs: readonly WeldCourse[]): WeldCourse[] {
  return cs.map((c) => {
    const n = c.pts.length;
    if (n < 3) return c;
    const pts = c.pts.map((p) => [...p] as V3), rad = [...c.rad], w = [...c.w];
    const refine = (end: 0 | 1) => {
      const i0 = end === 0 ? 0 : pts.length - 1, i1 = end === 0 ? 1 : pts.length - 2, a = pts[i0]!, b = pts[i1]!, R = rad[i0]!, L = hyp(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      if (!(L > REFINE_OVER_R * R)) return;
      const add: { d: number }[] = [];
      for (let d = REFINE_FIRST_R * R; d < L * 0.97; d *= REFINE_GROW) add.push({ d });
      const made = add.map(({ d }) => { const t = d / L; return { p: [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)] as V3, r: lerp(rad[i0]!, rad[i1]!, t), w: lerp(w[i0]!, w[i1]!, t) }; });
      if (end === 0) { pts.splice(1, 0, ...made.map((m) => m.p)); rad.splice(1, 0, ...made.map((m) => m.r)); w.splice(1, 0, ...made.map((m) => m.w)); }
      else { const at = pts.length - 1; pts.splice(at, 0, ...made.reverse().map((m) => m.p)); rad.splice(at, 0, ...made.map((m) => m.r)); w.splice(at, 0, ...made.map((m) => m.w)); }
    };
    refine(0); refine(1);
    return pts.length === n ? c : { ...c, pts, rad, w };
  });
}
