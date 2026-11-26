// The rows of the lens colour texture (one column per edge): kept in a module of its own so the shaders and the lens model read the same numbers without importing each other.
/** Rows 0 and 1 the ends, 2 and 3 a third and two thirds along, 4 the vessel's chevron ink (chevron-ink.ts), then PROFILE_N rows of a colour profile along
 *  the vessel (a stent: stent-lens.ts) whose first row's alpha says it carries one. */
export const INK_ROWS = 5;
/** The profile rows: the vessel's colour at PROFILE_N evenly spaced places from its upstream end to its downstream end (the shaders mix between neighbours). */
export const PROFILE_ROW0 = INK_ROWS, PROFILE_N = 25;
export const GRAD_ROWS = INK_ROWS + PROFILE_N;

/** lensProfileAt(grad, e, u): the colour of the profile of vessel e at u along it (.a 1), or vec4(0) when the vessel carries none.
 *  One rule for the tube, the junction skin and the blood cells' own lens read. */
export const LENS_PROFILE_GLSL = /* glsl */ `// a vessel's colour profile along it (a stent under the velocity or a pressure lens), mixed between the two nearest of its rows; .a 0: the vessel has none
vec4 lensProfileAt(sampler2D grad, int e, float u) {
  if (texelFetch(grad, ivec2(e, ${PROFILE_ROW0}), 0).a < 0.5) return vec4(0.0);
  float f = clamp(u, 0.0, 1.0) * float(${PROFILE_N - 1});
  int i = min(int(floor(f)), ${PROFILE_N - 2});
  vec3 a = texelFetch(grad, ivec2(e, ${PROFILE_ROW0} + i), 0).rgb, b = texelFetch(grad, ivec2(e, ${PROFILE_ROW0} + i + 1), 0).rgb;
  return vec4(mix(a, b, f - float(i)), 1.0);
}`;
