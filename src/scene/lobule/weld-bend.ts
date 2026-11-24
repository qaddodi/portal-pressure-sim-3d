// The Lobule's network, bent ONCE (Mohammad, 20 Nov 2026: the lymph "does not hug"). Root cause: the weld planner (welds.ts) used to bend every shallow V of the sinusoids apart (weld-splay.ts: the
// sinusoids merge two into one at 4 to 15 degrees, so the arms lie on each other for ten radii) AFTER the network was built, and the scene drew the sinusoids along those bent paths, but the lymph, the bile
// and the plates of cells were laid along the unbent courses. The drawn sinusoid slid sideways across its own lymph by up to five radii. Now the bend is done here, once, to `net.courses` themselves, before
// anything is derived from them, so every layer reads the one centreline the vessels are drawn along and the planner (planWelds with `splay: false`) bends nothing. The same splay, the same numbers.
// Pure (numbers in, numbers out), and it imports nothing that imports geometry.ts.
import type { Course, P2 } from './geometry.ts';
import { DISC_R, RS_N, inletRadius, sinRadius, twigR } from './widths.ts';
import { LOBULE_R } from './sizes.ts';
import { findNodes, refineEnds, TOUCH } from './weld-nodes.ts';
import { splayCourses } from './weld-splay.ts';
import type { V3, WeldCourse } from './welds.ts';

/** The arteriole's and the bile duct's mouths are drawn this much wider than their tube (the scene's HA_K and BD_K). */
export const HA_K = 1.7, BD_K = 1.4;
/** The heights the scene lays its tubes at (lobule3d.ts LZ.tube and OVER_Z; tests/lobule-drawn-source.test.ts holds them equal): the splay turns arms in 3D, so the bend sees the same heights the planner does. */
export const Z_TUBE = 0.008, Z_OVER = 0.028;
const hyp = Math.hypot;

/** The discs of the vessels' mouths (lobule radii): a meeting inside one is the pool's, not a junction (the weld planner's `avoid`). `lv` are the tracts' lymphatic centres. */
export function mouthDiscs(courses: readonly Course[], lv: readonly P2[]): { x: number; y: number; r: number }[] {
  const mouthR: Partial<Record<Course['kind'], number>> = { pv: DISC_R.pv, ha: DISC_R.ha * HA_K, bd: DISC_R.bd * BD_K, cv: DISC_R.cv };
  const out = courses.filter((c) => mouthR[c.kind] !== undefined).map((c) => { const p = c.pts[Math.floor(c.pts.length / 2)]!; return { x: p[0], y: p[1], r: mouthR[c.kind]! }; });
  for (const p of lv) out.push({ x: p[0], y: p[1], r: DISC_R.lv });
  return out;
}

/** Bends the blood vessels' courses (inlets, sinusoids, cross-links, twigs) apart at their shallow junctions, in place: points, `rho` and `len` of each course that moved. */
export function bendNet(courses: Course[], lv: readonly P2[]): void { for (const _ of bendNetSteps(courses, lv)) { /* every pass */ } }
/** `bendNet` a pass per `yield`: the scene's boot builds the Lobule's network in steps so no one task holds all three (scene.ts, 24 Nov). */
export function* bendNetSteps(courses: Course[], lv: readonly P2[]): Generator<void, void, unknown> {
  // (a T's branch is bent before its host, and the host's own bend then carries the T along: a second pass settles those, a third is a no-op)
  for (let pass = 0; pass < 3; pass++) { const moved = bendOnce(courses, lv); yield; if (!moved) break; }
}

/** One pass of the bend; whether anything moved. */
function bendOnce(courses: Course[], lv: readonly P2[]): boolean {
  let any = false;
  const R = LOBULE_R, mine: { c: Course; n: number }[] = [], wc: WeldCourse[] = [];
  const at3 = (p: readonly number[], z: number): V3 => [p[0]! * R, -p[1]! * R, z];
  for (const c of courses) {
    if (c.kind === 'in') {
      wc.push({ key: `${c.kind}${c.id}`, phase: 0, family: 'blood', pts: c.pts.map((p) => at3(p, Z_TUBE)), rad: c.pts.map((p, i) => Math.max(1e-4, inletRadius(i, c.pts.length, hyp(p[0] - c.pts[0]![0], p[1] - c.pts[0]![1])) * R)), w: c.pts.map(() => 0), seg: 0 });
      mine.push({ c, n: c.pts.length });
    } else if (c.kind === 's0' || c.kind === 's1' || c.kind === 's2' || c.kind === 'an') {
      let n = c.pts.length; while (n > 2 && c.rho[n - 1]! < DISC_R.cv * 0.78) n--;   // (a sinusoid stops at the central vein's lip, as the planner's courses do)
      wc.push({ key: `${c.kind}${c.id}`, phase: 0, family: 'blood', pts: c.pts.slice(0, n).map((p) => at3(p, Z_OVER)), rad: c.pts.slice(0, n).map((_, i) => Math.max(1e-4, sinRadius(c.kind as 's0', c.rho[i]!) * R)), w: c.pts.slice(0, n).map(() => 0), seg: 0 });
      mine.push({ c, n });
    } else if (c.kind === 'tw') {
      wc.push({ key: `${c.kind}${c.id}`, phase: 0, family: 'blood', pts: c.pts.map((p) => at3(p, Z_OVER)), rad: c.pts.map((_, i) => Math.max(1e-4, twigR(i / (c.pts.length - 1), RS_N) * R)), w: c.pts.map(() => 0), seg: 0 });
      mine.push({ c, n: c.pts.length });
    }
  }
  const refined = refineEnds(wc), avoid = mouthDiscs(courses, lv).map((d) => ({ x: d.x * R, y: -d.y * R, r: d.r * R }));
  const nodes = findNodes(refined, TOUCH).filter((nd) => !avoid.some((d) => hyp(nd.J[0] - d.x, nd.J[1] - d.y) < d.r));
  const bent = splayCourses(refined, nodes);
  mine.forEach(({ c, n }, k) => {
    // (refineEnds put new samples between the first and second and between the last two: find the original samples among the refined ones, which it never moves)
    const o = wc[k]!.pts, f = refined[k]!.pts, same = (a: V3, b: V3) => a[0] === b[0] && a[1] === b[1];
    const k0 = n > 2 ? f.findIndex((p, i) => i > 0 && same(p, o[1]!)) - 1 : 0;
    let moved = false;
    for (let i = 0; i < n; i++) {
      const j = i === 0 ? 0 : i === n - 1 ? f.length - 1 : i + k0, p = bent[k]!.pts[j]!;
      if (hyp(p[0] - o[i]![0], p[1] - o[i]![1]) < 1e-12) continue;
      c.pts[i] = [p[0] / R, -p[1] / R]; c.rho[i] = hyp(c.pts[i]![0], c.pts[i]![1]); moved = true; any = true;
    }
    if (moved) { let len = 0; for (let i = 1; i < c.pts.length; i++) len += hyp(c.pts[i]![0] - c.pts[i - 1]![0], c.pts[i]![1] - c.pts[i - 1]![1]); c.len = len; }
  });
  return any;
}
