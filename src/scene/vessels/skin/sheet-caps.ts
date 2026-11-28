// A sheet from the surface (sheet.ts) can come out with a small hole that is at no seam: where two arms and the trunk pinch a thin web of the field (LRV_S's shunt and collateral, which run along one another), the peeling that clears bow ties and three-face edges takes
// the triangles round it off and leaves a short loop by itself. The skin is closed except along its seams, so such a loop is closed here by a fan to its centre; the remesh pulls the centre onto the surface and evens the triangles out.
import type { Vec3 } from './types.ts';

/** A hole of the sampled surface is small when its loop's vertices lie within this share of the narrowest arm's radius of their mean (a seam loop lies about one radius of its arm out: a stray web of the field, 0.2). */
export const STRAY_MAX_SPREAD = 0.6;

/**
 * The loops no arm's seam owns. Three kinds, so a small shift of a course cannot leave one uncapped:
 *  - a loop more than 2 of an arm's radii from every seam centre (as before);
 *  - a loop under a quarter of the longest when there are more loops than seams (beside a thin arm's seam, as C9's on the cava with the portacaval shunt 2 radii from it: a seam is a ring of the arm, a hole is a few cells);
 *  - a SMALL loop (its vertices within `STRAY_MAX_SPREAD` of the narrowest arm's radius of their mean) that is not the loop nearest to any arm's seam centre. It may lie within 2 radii of a seam, because the cut half-cylinder beyond a seam
 *    plane reaches a pinched web of the field beside it when the arm bends (S_MC's drawn course moved 0.3 radii and an 8-vertex hole stood 1.6 radii from its seam: "4 seam loops for 3 arms", SMV lost S_MC and REX).
 * A real seam loop is about one radius wide and is always the nearest to its own arm's seam centre, so it is never taken for a hole.
 */
export function strayLoops(loops: readonly number[][], pos: readonly number[], cen: readonly Vec3[], rad: readonly number[]): number[][] {
  const mean = (loop: readonly number[]): number[] => {
    const m = [0, 0, 0];
    for (const v of loop) for (let d = 0; d < 3; d++) m[d]! += pos[3 * v + d]! / loop.length;
    return m;
  };
  const means = loops.map(mean), Rmin = Math.min(...rad);
  const spread = (loop: readonly number[], m: readonly number[]): number => loop.reduce((s, v) => s + Math.hypot(pos[3 * v]! - m[0]!, pos[3 * v + 1]! - m[1]!, pos[3 * v + 2]! - m[2]!), 0) / loop.length;
  const owns = new Set<number>();
  cen.forEach((c, a) => {
    let best = -1, bd = Infinity;
    means.forEach((m, i) => { const d = Math.hypot(m[0]! - c[0], m[1]! - c[1], m[2]! - c[2]) / rad[a]!; if (d < bd) { bd = d; best = i; } });
    if (best >= 0) owns.add(best);
  });
  const longest = Math.max(0, ...loops.map((l) => l.length));
  return loops.filter((loop, i) => {
    if (loops.length > cen.length && loop.length * 4 < longest) return true;
    const m = means[i]!;
    if (cen.every((c, a) => Math.hypot(m[0]! - c[0], m[1]! - c[1], m[2]! - c[2]) > 2 * rad[a]!)) return true;
    return !owns.has(i) && spread(loop, m) < STRAY_MAX_SPREAD * Rmin;
  });
}

/** Closes each stray loop with a fan to a new vertex at its mean (appended to `pos`), the triangles running the other way along the loop's edges as the strip of a seam does. Returns the loops left (the seams'). */
export function capStrayLoops(loops: number[][], tris: number[], pos: number[], cen: readonly Vec3[], rad: readonly number[]): number[][] {
  const stray = new Set(strayLoops(loops, pos, cen, rad));
  for (const loop of stray) {
    const m = [0, 0, 0];
    for (const v of loop) for (let d = 0; d < 3; d++) m[d]! += pos[3 * v + d]! / loop.length;
    const c = pos.length / 3; pos.push(m[0]!, m[1]!, m[2]!);
    for (let i = 0; i < loop.length; i++) tris.push(loop[(i + 1) % loop.length]!, loop[i]!, c);
  }
  return loops.filter((l) => !stray.has(l));
}
