// THE CUT between the tubes and the ray-marched junctions (?junc=sdf, net/junc-sdf.ts): each arm's capsule ends, away from its node, at a plane across it (through its outermost capsule point, normal pointing
// away from the node). Inside a junction's bound, a tube fragment of an arm's edge on the NODE side of that arm's plane is not drawn (the ray-march draws the union there), and the ray-march draws nothing BEYOND
// any of its arms' planes (the tube draws there). At the plane both are the same capsule surface, so neither the shading, the depth nor the outline has a seam: the tube's end, its dome and its own ink never show
// inside a junction, and a junction's outline is the union's silhouette alone. Two textures hold the cut (junc-sdf.ts writes them):
//   juncGeom, one row per junction region (the region texture's rows; the geometry pass writes the marched ones every drawn frame from the live capsules): texel 0 the bound (centre, radius), texels 1..CAPS each
//            capsule's plane at its first end (n, n.p), CAPS+1..2 CAPS at its last end (an inner end's plane is (0, 0, 0, 1): nothing is beyond it), 2 CAPS+1..3 CAPS its edge rows (at the first end, at the
//            last, 1 when the capsule is there). A tube fragment is cut only inside both planes of a capsule of its edge AND within that capsule's reach; the march yields past a plane of its nearest capsule.
//   juncEdge, one texel per edge row (static): the rows of up to four marched regions the edge is an arm of (-1: none), so a tube fragment looks only at the junctions at its own ends.
import { REGION_CAPS, REGION_PTS } from './regions.ts';

/** How far from an arm's capsule axis, in its lumens, the cut reaches (the tube's surface at 1, its outline pad beyond): past it the tube draws, cut or not. */
export const JUNC_CUT_REACH = 3;
const F = (x: number): string => (Number.isInteger(x) ? `${x}.0` : `${x}`);

export const JUNC_CUT_TEXELS = 1 + 3 * REGION_CAPS;
/** The most marched regions one edge is an arm of (its two ends, and a short edge that is an arm of merged regions). */
export const JUNC_EDGE_REGIONS = 4;

export const JUNC_CUT_GLSL = /* glsl */ `
uniform sampler2D juncGeom;   // the cut (junc-cut-glsl.ts); unbound and unread while juncOn is 0
uniform sampler2D juncEdge;   // the marched regions each edge row is an arm of
uniform float juncOn;         // 1 on a network whose junctions are ray-marched
uniform sampler2D capTex;     // the live capsule points of every region (shaders.ts, the capsule pass): the cut reaches only as far as the arm's own capsule
// how far from an arm's capsule axis, in its lumens, a tube fragment is still cut (the tube's surface and its outline pad: the march draws both there)
const float JUNC_CUT_REACH = ${F(JUNC_CUT_REACH)};
float juncAxisK(vec3 p, int c, int rr) {
  float best = 1.0e20;
  for (int s = 0; s < ${REGION_PTS - 1}; s++) {
    vec4 A = texelFetch(capTex, ivec2(c * ${REGION_PTS} + s, rr), 0), B = texelFetch(capTex, ivec2(c * ${REGION_PTS} + s + 1, rr), 0);
    vec3 b = B.xyz - A.xyz, q = p - A.xyz;
    float bb = dot(b, b), t = bb > 1.0e-12 ? clamp(dot(q, b) / bb, 0.0, 1.0) : 0.0;
    best = min(best, length(q - t * b) / max(mix(A.w, B.w, t), 1.0e-6));
  }
  return best;
}
// a tube fragment at p of edge row \`row\` lies inside a marched junction: inside its bound, on the node side of the plane of one of its arms of that edge, and within that arm's capsule (never where the march has no surface)
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
      vec4 R = texelFetch(juncGeom, ivec2(1 + ${2 * REGION_CAPS} + c, rr), 0);
      if (R.z < 0.5) break;
      if (abs(R.x - row) < 0.5 || abs(R.y - row) < 0.5) {
        vec4 P0 = texelFetch(juncGeom, ivec2(1 + c, rr), 0), P1 = texelFetch(juncGeom, ivec2(1 + ${REGION_CAPS} + c, rr), 0);
        if (dot(P0.xyz, p) - P0.w < 0.0 && dot(P1.xyz, p) - P1.w < 0.0 && juncAxisK(p, c, rr) < JUNC_CUT_REACH) return true;
      }
    }
  }
  return false;
}`;
