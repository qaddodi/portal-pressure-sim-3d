// THE flow head, one shape for every view (Mohammad, 20 Nov 2026: "use the same chevron shape as the anatomy; chevrons unified. also the blood chevrons black; just like anatomy"):
// the 2D app's head (chevron-glsl.js chevHead), a slim arrowhead with a notched back and a hard dark ring, word for word as the Anatomy's vessels draw it (vessels/shaders.ts chevD, chevHead).
// chevHead(u, ay, hw, px, rev): u the place along the head's axis (its tip toward +u), ay the distance from the axis, hw the head's half width, px a pixel in the same units, rev 1 for a
// reversed flow's second small head; returns (the head's coverage, its ring's). chevKeep(j, n0, lv): how much of head j of the lattice of level n0 shows at level lv (coarser heads are a
// subset of finer ones, so a zoom never makes them jump). The Lobule's 3D vessels use it (micro3d/cel3d.ts FLOW); the Anatomy's copy folds into this one when its
// thread takes it over (tests/chevron-glsl.test.ts holds the two to the same text meanwhile).
export const CHEVRON_HEAD_GLSL = /* glsl */ `
float chevD(float u, float ay, float hw) {
  float L = 1.6 * hw, tip = 0.55 * L, back = -0.45 * L, notch = 0.32 * L, k = L / hw;
  float side = (u - tip + ay * k) / sqrt(1.0 + k * k);
  float rear = back + notch * (1.0 - clamp(ay / hw, 0.0, 1.0)) - u;
  return max(max(side, rear), ay - hw);
}
vec2 chevHead(float u, float ay, float hw, float px, float rev) {
  float d = chevD(u, ay, hw);
  float c = 1.0 - smoothstep(-0.7 * px, 0.7 * px, d);
  float rw = 1.8 * px + 0.1 * hw;   // the head's ring: a hard-edged outline of this width, never a halo
  float rim = 1.0 - smoothstep(rw - 0.7 * px, rw + 0.7 * px, d);
  if (rev > 0.0) {
    float d2 = 0.6 * chevD((u + 1.088 * hw) / 0.6, ay / 0.6, hw);
    c = max(c, rev * (1.0 - smoothstep(-0.7 * px, 0.7 * px, d2)));
    float rw2 = 1.8 * px + 0.06 * hw;
    rim = max(rim, rev * (1.0 - smoothstep(rw2 - 0.7 * px, rw2 + 0.7 * px, d2)));
  }
  return vec2(c, rim * (1.0 - c));
}
// how much of head j of the lattice of level n0 shows at level lv (coarser heads are a subset of finer ones; nothing jumps)
float chevKeep(float j, float n0, float lv) {
  float m = 0.0, q = abs(j);
  for (int i = 0; i < 10; i++) { if (q < 0.5 || mod(q, 2.0) > 0.5) break; q *= 0.5; m += 1.0; }
  if (q < 0.5) m = 10.0;
  return clamp(exp2(1.0 - (lv - n0 - m)) - 1.0, 0.0, 1.0);
}
`;

