// THE CUT between the tubes and the ray-marched junctions (?junc=sdf, net/junc-sdf.ts): each arm's capsule ends, away from its node, at a plane across it (through its outermost capsule point, normal pointing
// away from the node). Inside a junction's bound, a tube fragment of an arm's edge on the NODE side of that arm's plane is not drawn (the ray-march draws the union there), and the ray-march draws nothing BEYOND
// any of its arms' planes (the tube draws there). At the plane both are the same capsule surface, so neither the shading, the depth nor the outline has a seam: the tube's end, its dome and its own ink never show
// inside a junction, and a junction's outline is the union's silhouette alone. Two textures hold the cut (junc-sdf.ts writes them):
//   juncGeom, one row per junction region (the region texture's rows; the geometry pass writes the marched ones every drawn frame from the live capsules): texel 0 the bound (centre, radius), texels 1..CAPS each
//            arm's plane (n, n.p), texels CAPS+1..2 CAPS each arm's edge rows (at the outer end, at the node end, 1 when the arm is there);
//   juncEdge, one texel per edge row (static): the rows of up to four marched regions the edge is an arm of (-1: none), so a tube fragment looks only at the junctions at its own ends.
import { REGION_CAPS } from './regions.ts';

export const JUNC_CUT_TEXELS = 1 + 2 * REGION_CAPS;
/** The most marched regions one edge is an arm of (its two ends, and a short edge that is an arm of merged regions). */
export const JUNC_EDGE_REGIONS = 4;

export const JUNC_CUT_GLSL = /* glsl */ `
uniform sampler2D juncGeom;   // the cut (junc-cut-glsl.ts); unbound and unread while juncOn is 0
uniform sampler2D juncEdge;   // the marched regions each edge row is an arm of
uniform float juncOn;         // 1 on a network whose junctions are ray-marched
// a tube fragment at p of edge row \`row\` lies inside a marched junction: inside its bound, on the node side of the plane of one of its arms of that edge
bool juncCut(vec3 p, float row) {
  if (juncOn < 0.5) return false;
  vec4 rs = texelFetch(juncEdge, ivec2(int(row + 0.5), 0), 0);
  for (int k = 0; k < ${JUNC_EDGE_REGIONS}; k++) {
    float rf = k == 0 ? rs.x : (k == 1 ? rs.y : (k == 2 ? rs.z : rs.w));
    if (rf < -0.5) break;
    int rr = int(rf + 0.5);
    vec4 S = texelFetch(juncGeom, ivec2(0, rr), 0);
    vec3 dp = p - S.xyz;
    if (dot(dp, dp) > S.w * S.w) continue;
    for (int c = 0; c < ${REGION_CAPS}; c++) {
      vec4 R = texelFetch(juncGeom, ivec2(1 + ${REGION_CAPS} + c, rr), 0);
      if (R.z < 0.5) break;
      if (abs(R.x - row) < 0.5 || abs(R.y - row) < 0.5) { vec4 Pl = texelFetch(juncGeom, ivec2(1 + c, rr), 0); if (dot(Pl.xyz, p) - Pl.w < 0.0) return true; }
    }
  }
  return false;
}`;
