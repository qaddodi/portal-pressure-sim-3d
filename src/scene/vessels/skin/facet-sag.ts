// How far out a skin vertex must stand so the flat facets around it never fall inside the outline's band (Mohammad, 20 Nov: "wobbly, jagged silhouettes with ink barbs" on the PV, SMV, hepatic artery skins).
// ROOT CAUSE: a tube's ring is a 14-gon whose corners the vertex stage pushes out by TUBE_SAG, so its chords pass through the true circle. The skin's interior edges are NOT ring-sized: the remesh lets an edge
// grow to SPLIT_AT (4/3) times its target, so the chord of a long facet sagged up to twice TUBE_SAG, and at the silhouette that put the mesh edge INSIDE the ink band (the band is cut by the px outline, which only
// trims a mesh that is too wide, it cannot widen one that is too narrow): scallops with a barb at every vertex. A chord of length e on a surface of radius R sags e^2 / 8R, so each vertex is pushed out by the
// sag of its LONGEST incident edge (never less than the ring's own TUBE_SAG, which a seam ring keeps exactly: the tube's corners and the skin's meet). Pushing a vertex too far costs nothing: the fragment's
// outline trims whatever is wider than the band; a facet too narrow is the only fault.
import { TUBE_SAG } from '../shaders.ts';

/** More than the sag itself: the edge's bend along the axis and a saddle's curvature add to it. */
export const SAG_MARGIN = 1.3;
/** No vertex stands out more than this share of its radius: a sliver edge must not balloon the shape. */
export const SAG_MAX = 0.2;

/** Per vertex, the share of its (lumen + ink) radius it is pushed out along its normal for the facets' sag. `ringVerts` (every arm's seam ring) keep TUBE_SAG exactly. */
export function facetSag(position: ArrayLike<number>, index: ArrayLike<number>, restR: ArrayLike<number>, ringVerts: Iterable<number>): Float32Array {
  const V = position.length / 3, longest2 = new Float64Array(V);
  const edge = (a: number, b: number) => {
    const dx = position[3 * a]! - position[3 * b]!, dy = position[3 * a + 1]! - position[3 * b + 1]!, dz = position[3 * a + 2]! - position[3 * b + 2]!;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > longest2[a]!) longest2[a] = d2;
    if (d2 > longest2[b]!) longest2[b] = d2;
  };
  for (let i = 0; i < index.length; i += 3) { const a = index[i]!, b = index[i + 1]!, c = index[i + 2]!; edge(a, b); edge(b, c); edge(c, a); }
  const out = new Float32Array(V);
  for (let v = 0; v < V; v++) {
    const R = Math.max(restR[v]!, 1e-9);
    out[v] = Math.min(SAG_MAX, Math.max(TUBE_SAG, (SAG_MARGIN * longest2[v]!) / (8 * R * R)));
  }
  for (const v of ringVerts) out[v] = TUBE_SAG;
  return out;
}
