// A sheet from the surface (sheet.ts) can come out with a small hole that is at no seam: where two arms and the trunk pinch a thin web of the field (LRV_S's shunt and collateral, which run along one another), the peeling that clears bow ties and three-face edges takes
// the triangles round it off and leaves a short loop by itself. The skin is closed except along its seams, so such a loop is closed here by a fan to its centre; the remesh pulls the centre onto the surface and evens the triangles out.
import type { Vec3 } from '../../skin/types.ts';

/** The loops no arm's seam owns: more than 2 of an arm's radii from every seam centre. */
export function strayLoops(loops: readonly number[][], pos: readonly number[], cen: readonly Vec3[], rad: readonly number[]): number[][] {
  return loops.filter((loop) => {
    const m = [0, 0, 0];
    for (const v of loop) for (let d = 0; d < 3; d++) m[d]! += pos[3 * v + d]! / loop.length;
    return cen.every((c, a) => Math.hypot(m[0]! - c[0], m[1]! - c[1], m[2]! - c[2]) > 2 * rad[a]!);
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
