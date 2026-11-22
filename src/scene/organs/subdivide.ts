// The coarse organs get more points once, when they are built (prepare.ts, so in the BUILD's bake: no per-frame work and no load work). The organ files are 2D's outlines inflated into pillows with a point every
// 2.5 figure units on the rim and 5 to 7 inside, and the small organs (kidney, spleen, heart, atrium, duodenum, the caudate lobe) are only a thousand or two points: up close the outline shows corners and the
// shade bands, which the shader cuts by the interpolated normal, wobble from one triangle to the next (Mohammad, 22 Nov: "the shadows and outlines are jagged, same for organs").
// One round of interpolating subdivision (1 triangle -> 4): every original point stays exactly where it is (the shapes, the cirrhotic liver's outline and every nodule are untouched; only points are added), and each
// new point sits on the smooth curve through the edge's two ends and their normals (the middle of the cubic Bezier edge of a PN triangle: the chord's middle pulled back along the normals by the sag the chord has
// from the surface). That is local to the edge, so it is as true on the duodenum's long skinny triangles and the pillows' irregular valences as on a sphere, where a butterfly stencil ripples a flat strip.
// The rim, which is the silhouette, keeps contour.ts's 4-point rim rule in x and y, so the outline is the same curve `refineRim` makes for the big organs. New points are appended after the old ones, so every
// vertex index that exists stays valid.
import { BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute } from 'three';
import { rimPoint, silhouetteRing, weld } from './contour.ts';
import { smoothRestNormals } from './normal-smooth.ts';

/** Organs with fewer points than this (before the rim is refined) are subdivided; the larger ones keep `refineRim` alone. */
export const COARSE_VERTS = 4000;
/** Passes of smoothing of the normals the new points follow (the mesh's own jag a little on a coarse triangulation; the shape is not changed by it, only the way a chord is bent). */
export const NORMAL_PASSES = 1;
/** A new interior point never sits farther than this share of its edge from the edge's middle (a guard on the steep wall at the rim; the surface it follows bows by a few percent). */
const MAX_BOW = 0.35;

type V3 = [number, number, number];

/** The triangles of a welded mesh of `n` points split in four, and the edges that got a new point (new point `n + k` sits on edge `edges[k]`, found in triangle order, each edge once). Pure index work: the baked file keeps
 *  only the parent triangles of a subdivided organ and has this make the children on load (a few ms), which keeps the file small. */
export function splitIndex(idx: ArrayLike<number>): { index: Uint32Array; edges: [number, number][]; added: number } {
  let n = 0; for (let i = 0; i < idx.length; i++) if (idx[i]! >= n) n = idx[i]! + 1;
  const mid = new Map<number, number>(), edges: [number, number][] = [], out = new Uint32Array(idx.length * 4);
  const m = (a: number, b: number): number => { const k = a < b ? a * n + b : b * n + a; let v = mid.get(k); if (v === undefined) { v = n + edges.length; mid.set(k, v); edges.push(a < b ? [a, b] : [b, a]); } return v; };
  for (let t = 0, o = 0; t + 2 < idx.length; t += 3, o += 12) {
    const i0 = idx[t]!, i1 = idx[t + 1]!, i2 = idx[t + 2]!, m01 = m(i0, i1), m12 = m(i1, i2), m20 = m(i2, i0);
    out.set([i0, m01, m20, m01, i1, m12, m20, m12, i2, m01, m12, m20], o);
  }
  return { index: out, edges, added: edges.length };
}

/** One round of subdivision of `g` (a closed or open welded triangle mesh), in place: new points appended, every triangle split in four, normals recomputed. The silhouette's rim edges take the rim rule.
 *  Returns how many points were added (0 when the mesh is not welded or has no triangles: the caller keeps `refineRim`). */
export function subdivideOrgan(g: BufferGeometry): number {
  if (!g.index) return 0;
  const w = weld(g), pos = g.getAttribute('position'), ring = silhouetteRing(g, w);
  const P = (v: number): V3 => { const i = w.verts[v]![0]!; return [pos.getX(i), pos.getY(i), pos.getZ(i)]; };
  // a welded mesh only: the points and the triangles are then the same ids (a file with seams is left to refineRim)
  if (w.n !== pos.count) return 0;
  if (!g.getAttribute('normal')) g.computeVertexNormals();
  const nrm = smoothRestNormals(pos.array, g.getAttribute('normal').array, g.index.array, NORMAL_PASSES);
  const N = (v: number): V3 => { const i = w.verts[v]![0]!; return [nrm[3 * i]!, nrm[3 * i + 1]!, nrm[3 * i + 2]!]; };
  /** The middle of the cubic through a and b with the tangent plane of each end's normal: the chord's middle less an eighth of the chord's length along each normal, as much as the chord leaves the surface there. */
  const bend = (a: number, b: number): V3 => {
    const pa = P(a), pb = P(b), na = N(a), nb = N(b), d = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
    const wa = d[0]! * na[0] + d[1]! * na[1] + d[2]! * na[2], wb = -(d[0]! * nb[0] + d[1]! * nb[1] + d[2]! * nb[2]);
    return [(pa[0] + pb[0]) / 2 - (wa * na[0] + wb * nb[0]) / 8, (pa[1] + pb[1]) / 2 - (wa * na[1] + wb * nb[1]) / 8, (pa[2] + pb[2]) / 2 - (wa * na[2] + wb * nb[2]) / 8];
  };
  const parent = g.index.array, { index, edges } = splitIndex(parent), px: number[] = Array.from(pos.array);
  for (const [a, b] of edges) {
    const pa = P(a), pb = P(b);
    let q: V3;
    const ra = ring.get(a), rb = ring.get(b);
    if (ra && rb && (ra[0] === b || ra[1] === b)) {   // a rim edge: the 4-point rule along the silhouette
      const before = ra[0] === b ? ra[1] : ra[0], after = rb[0] === a ? rb[1] : rb[0];
      q = rimPoint(P(before), pa, pb, P(after));
    } else {
      q = bend(a, b);
      const m: V3 = [(pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, (pa[2] + pb[2]) / 2];
      const len = Math.hypot(pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]), dx = q[0] - m[0], dy = q[1] - m[1], dz = q[2] - m[2], d = Math.hypot(dx, dy, dz);
      if (d > MAX_BOW * len) { const s = (MAX_BOW * len) / d; q = [m[0] + dx * s, m[1] + dy * s, m[2] + dz * s]; }
    }
    px.push(q[0], q[1], q[2]);
  }
  g.userData.subParent = Uint32Array.from(parent);   // (what baked.ts keeps of the triangles: the children are made again on load)
  const added = edges.length;
  g.setAttribute('position', new Float32BufferAttribute(px, 3));
  g.deleteAttribute('normal');
  g.setIndex(new Uint32BufferAttribute(index, 1));
  g.computeVertexNormals();
  g.computeBoundingBox(); g.boundingSphere = null;
  return added;
}
