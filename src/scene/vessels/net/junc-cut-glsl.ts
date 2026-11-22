// THE CUT between the tubes and a ray-marched junction (?junc=sdf, net/junc-sdf.ts): each arm's capsule ends, away from the node, at a plane across it (through its outermost capsule point, normal pointing
// away from the node). Inside the junction's bound, a tube fragment of an arm's edge on the NODE side of that arm's plane is not drawn (the ray-march draws the union there), and the ray-march draws nothing BEYOND
// any arm's plane (the tube draws there). At the plane both are the same capsule surface, so neither the shading, the depth nor the outline has a seam: the tube's end, its dome and its own ink never show
// inside the junction, and the junction's outline is the union's silhouette alone. One texture holds the cut (the geometry pass of junc-sdf.ts writes it every drawn frame from the live capsules):
// texel 0 the bound (centre, radius), texels 1..CAPS each arm's plane (n, n.p), texels CAPS+1..2 CAPS each arm's edge rows (at the outer end, at the node end, 1 when the arm is there).
import { REGION_CAPS } from './regions.ts';

export const JUNC_CUT_TEXELS = 1 + 2 * REGION_CAPS;

export const JUNC_CUT_GLSL = /* glsl */ `
uniform sampler2D juncGeom;   // the cut (junc-cut-glsl.ts); unbound and unread while juncOn is 0
uniform float juncOn;         // 1 on the network that holds a ray-marched junction
// a tube fragment at p of edge row \`row\` lies inside the junction: on the node side of the plane of an arm of that edge, inside the bound
bool juncCut(vec3 p, float row) {
  if (juncOn < 0.5) return false;
  vec4 S = texelFetch(juncGeom, ivec2(0, 0), 0);
  vec3 dp = p - S.xyz;
  if (dot(dp, dp) > S.w * S.w) return false;
  for (int c = 0; c < ${REGION_CAPS}; c++) {
    vec4 R = texelFetch(juncGeom, ivec2(1 + ${REGION_CAPS} + c, 0), 0);
    if (R.z < 0.5) break;
    if (abs(R.x - row) < 0.5 || abs(R.y - row) < 0.5) { vec4 Pl = texelFetch(juncGeom, ivec2(1 + c, 0), 0); if (dot(Pl.xyz, p) - Pl.w < 0.0) return true; }
  }
  return false;
}`;
