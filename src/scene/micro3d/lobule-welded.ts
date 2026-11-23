// The Lobule's welded tubes laid into a part's mesh (lobule/welds.ts is the plan, this writes it): each kept stretch of a course as a tube on the whole course's own rings, then each junction's skin, with
// every per-vertex number the scene's shaders read (the colour place, the swelling, the flow marks' place along and across) carried through the skin so a vessel reads as one surface:
//   - colour place: the sinusoids' is a function of where the vertex lies (sinW of its distance from the centre), so a skin of sinusoids is exactly the colour the tubes round it have; an inlet's is
//     the place along it, blended by the skin's weights, and where a sinusoid leaves an inlet the skin blends toward the sinusoid's colour (`m`, the share of the alternate colour)
//   - swelling: (radius, radius times the place's share of congestion's widening), the radius the skin's own blend of its arms has there
//   - flow marks: a through host's marks run on across the skin (the place along it is the host's own, projected), a branch's end and a skin of a merge draw none
import { MeshBuilder, tube } from './cel3d.ts';
import type { WeldCourseOut, WeldSkin } from '../lobule/welds.ts';

/** The parallel arrays a part keeps beside its mesh (every vertex pushes one number to each, in the order the mesh's vertices are written). */
/** `fc`: the dust's place on each vertex (cel3d `fcourse`: the course's column of the dust's route table, its arc, its length, the true place across; 3 where none is drawn), for the blood's parts. */
export interface PartData { b: MeshBuilder; W: number[]; K: number[]; sw?: number[]; /** each vertex's own tube radius (local units): the ink's width never outgrows it (cel3d `inkR`) */ ir?: number[]; W2?: number[]; M?: number[]; fc?: number[] }

export interface EmitOpts {
  /** Radius scale: the lobule's radius in local units. */
  R: number;
  seg: number;
  /** Congestion's widening share at a distance from the centre (lobule radii): the swell attribute's second number (only for parts with a swell). */
  cong?: (rho: number) => number;
  /** Whether the flow marks are drawn at sample i of the course (false: none there, e.g. just outside the central vein). */
  marksAt?: (out: WeldCourseOut, i: number) => boolean;
  /** The marks' hush near a course's own free end and near a junction it ends in (local units): no mark within this of either. */
  endHush: number;
  /** Where the alternate colour place (a leaving sinusoid on an inlet) comes from for a vertex at a plan position (lobule radii), and which arms' keys are of the host's own colour family. */
  altW?: (rho: number) => number;
  /** The dust's route-table column of a course (by its key): only for parts that keep `fc`. */
  dustCol?: (key: string) => number;
}

const hyp = Math.hypot;

/** One course's kept stretches, as tubes. */
export function emitCourse(d: PartData, out: WeldCourseOut, o: EmitOpts): void {
  const { b } = d, phase = out.phase, last = out.pts.length - 1;
  const rho = (i: number) => hyp(out.pts[i]![0], out.pts[i]![1]) / o.R;
  const tangent = (i: number): [number, number] => {
    const a = out.pts[Math.max(0, i - 1)]!, c = out.pts[Math.min(last, i + 1)]!;
    const tx = c[0] - a[0], ty = c[1] - a[1], l = hyp(tx, ty) || 1;
    return [tx / l, ty / l];
  };
  // no mark within endHush of an end no skin took, nor of a junction this course ends in (inclusive of the stretch the skin took out), nor where the caller says none
  const hushed = (i: number): boolean => {
    const s = out.arc[i]!;
    if (o.endHush > 0 && ((out.pieces.some((p) => p.capStart) && s < o.endHush) || (out.pieces.some((p) => p.capEnd) && out.arc[last]! - s < o.endHush))) return true;
    for (const [lo, hi] of out.hush) if (s > lo - o.endHush && s < hi + o.endHush) return true;
    return o.marksAt ? !o.marksAt(out, i) : false;
  };
  for (const piece of out.pieces) {
    const before = b.count;
    tube(b, out.pts, (i) => out.rad[i]!, [1, 1, 1], o.seg, true, { i0: piece.i0, i1: piece.i1, capStart: piece.capStart, capEnd: piece.capEnd });
    const rows = piece.i1 - piece.i0 + 1, ringVerts = rows * o.seg, capVerts = 4 * o.seg;
    const total = b.count - before;
    const sampleOf = (v: number): number => {
      const r = v - before;
      if (r < ringVerts) return piece.i0 + Math.floor(r / o.seg);
      return piece.capStart && r < ringVerts + capVerts ? piece.i0 : piece.i1;
    };
    for (let v = 0; v < total; v++) {
      const i = sampleOf(before + v), ring = v < ringVerts;
      d.W.push(out.w[i]!); d.K.push(1);
      if (d.sw) { const r = out.rad[i]!; d.sw.push(r, r * (o.cong?.(rho(i)) ?? 0)); }
      d.ir?.push(out.rad[i]!);
      if (d.W2) { d.W2.push(o.altW?.(rho(i)) ?? out.w[i]!); d.M!.push(0); }
      b.aux.push(phase + out.arc[i]!);
      const g = before + v, [tx, ty] = tangent(i), acr = -ty * b.n[g * 3]! + tx * b.n[g * 3 + 1]!;
      b.aux2.push(!ring || hushed(i) ? 3 : acr);
      // (the dust is never hushed at a joint: its particles run on through it, lobule-routes.ts)
      if (d.fc) d.fc.push(o.dustCol!(out.key), out.arc[i]!, out.arc[last]!, ring ? acr : 3);
    }
  }
}

/** The skin of one junction, appended to its host's part. `byKey` finds an arm's course (for its colour place at the seam and the host's path). */
export function emitSkin(d: PartData, skin: WeldSkin, byKey: ReadonlyMap<string, WeldCourseOut>, o: EmitOpts, hostFamily: (key: string) => boolean): void {
  const { b } = d, m = skin.mesh, n = m.position.length / 3, base = b.count;
  const host = byKey.get(skin.host)!, phase = host.phase;
  const hostArms = skin.arms.map((a) => hostFamily(a.key));
  for (let v = 0; v < n; v++) {
    const x = m.position[3 * v]!, y = m.position[3 * v + 1]!, z = m.position[3 * v + 2]!;
    b.v(x, y, z, m.normal[3 * v]!, m.normal[3 * v + 1]!, m.normal[3 * v + 2]!, [1, 1, 1]);
    const rho = hyp(x, y) / o.R, wt = m.weight.subarray(4 * v, 4 * v + 4);
    let w = 0, share = 0, other = 0;
    skin.arms.forEach((a, i) => { const k = wt[i]!; if (hostArms[i]) { w += k * a.wSeam; share += k; } else other += k; });
    d.W.push(share > 1e-6 ? w / share : (o.altW?.(rho) ?? 0)); d.K.push(1);
    if (d.sw) { const r = m.restR[v]!; d.sw.push(r, r * (o.cong?.(rho) ?? 0)); }
    d.ir?.push(m.restR[v]!);
    if (d.W2) { d.W2.push(o.altW?.(rho) ?? 0); d.M!.push(Math.min(1, Math.max(0, other))); }
    // the flow marks: a through host's run on over the skin where the host owns the vertex
    let aux = 0, aux2 = 3;
    if (skin.through) {
      let hw = 0;
      skin.arms.forEach((a, i) => { if (a.key === skin.host) hw += wt[i]!; });
      if (hw > 0.5) {
        const pr = projectArc(host, x, y);
        aux = phase + pr.arc;
        const nx = m.normal[3 * v]!, ny = m.normal[3 * v + 1]!;
        aux2 = -pr.ty * nx + pr.tx * ny;
      }
    }
    b.aux.push(aux); b.aux2.push(aux2);
    // the dust over the skin: the host's own particles where the host owns the vertex (its arc and across projected on its path, as the marks), none elsewhere. One column on every vertex of the skin, so no
    // triangle interpolates between two courses' columns (that would read a third course's lanes)
    if (d.fc) {
      let hw = 0;
      skin.arms.forEach((a, i) => { if (a.key === skin.host) hw += wt[i]!; });
      const pr = projectArc(host, x, y), across = -pr.ty * m.normal[3 * v]! + pr.tx * m.normal[3 * v + 1]!;
      d.fc.push(o.dustCol!(skin.host), pr.arc, host.arc[host.arc.length - 1]!, hw > 0.5 ? across : 3);
    }
  }
  for (let i = 0; i < m.index.length; i++) b.idx.push(m.index[i]! + base);
}

/** Where a point lies along a course (the arc length of its foot on the planned path) and the direction there. */
export function projectArc(c: WeldCourseOut, x: number, y: number): { arc: number; tx: number; ty: number } {
  let best = Infinity, arc = 0, tx = 1, ty = 0;
  for (let i = 0; i < c.pts.length - 1; i++) {
    const a = c.pts[i]!, e = c.pts[i + 1]!, bx = e[0] - a[0], by = e[1] - a[1], bb = bx * bx + by * by;
    let t = bb > 0 ? ((x - a[0]) * bx + (y - a[1]) * by) / bb : 0;
    t = Math.min(1, Math.max(0, t));
    const dd = hyp(x - a[0] - t * bx, y - a[1] - t * by);
    if (dd < best) { best = dd; arc = c.arc[i]! + t * (c.arc[i + 1]! - c.arc[i]!); const l = Math.sqrt(bb) || 1; tx = bx / l; ty = by / l; }
  }
  return { arc, tx, ty };
}
