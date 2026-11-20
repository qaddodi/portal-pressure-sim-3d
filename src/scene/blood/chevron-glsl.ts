// THE ONE CHEVRON (Mohammad, 20 Nov: "use the same chevron shape as the anatomy; chevrons unified. also the blood chevrons black; just like anatomy"): the 2D app's flow head (chevron-glsl.js chevHead:
// a slim head with a notched back, its point leading the way the blood goes, a hard-edged ring round it), the same in the Anatomy's vessels (vessels/shaders.ts) and in the 3D lobule and sinusoid tubes
// (micro3d/cel3d.ts). Its tone on blood is the Anatomy's: dark ink (the look's chevron ink mixed a little with the lumen's own colour) on a light lumen, cream on a dark one, decided by a hard step on the
// lumen's luminance, and always the dark ring. The GLSL is one chunk; tests/b3-chevron-unified.test.ts pins that both sites include it.
//   chevD(u, ay, hw)                       the head's signed distance (u along, toward the point; ay across; hw its half width)
//   chevHead(u, ay, hw, px, rev)           (coverage, ring) of one head, px the pixel in the same unit
//   chevInk(base, markDark, markLight)     the head's core tone on a lumen of colour `base`
//   chevLattice(arc, across, pitch, px, dir)  heads every `pitch` along `arc`, in a tube whose face runs -1 .. 1 across: heads in the middle 0.6 of it (never near the wall), pointing toward `dir`
/** The Anatomy's, the Circuit's and the micro tubes' heads on screen (vessels/shaders.ts chevOne, micro3d/cel3d.ts flowHeads), in CSS px, whatever the zoom: the lattice's spacing is PITCH_PX at the level where a head is added and 1.33 x PITCH_PX where the finer ones
 *  have just left (chevKeep), so heads stand every 40 to 80 px along the vessel whatever its width, on every tube from MIN_R_PX of radius (under 3 px across there is none); a head's half width is half the tube's radius held between MIN_HW_PX and MAX_HW_PX
 *  (so it is 8.8 px tall and 7 px long from a tube 9 px across) and never over the radius plus OVER_PX: on a thinner tube it may stand a pixel over each wall, where the ink outline (drawn over it) clips it to the tube. */
export const CHEV = { PITCH_PX: 60, MIN_R_PX: 1.5, MIN_HW_PX: 4.4, MAX_HW_PX: 9, OVER_PX: 1 } as const;
export const CHEVRON_GLSL = /* glsl */ `
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
// the head's ring: always the dark ink, never a pale ring
const vec3 CHEV_RIM = vec3(0.2314, 0.1725, 0.1333);
// one flat tone for the head, never a grey halfway: dark ink on a light lumen, cream on a dark one, a hard step on the lit tone's luminance (0.26: cream is 3:1 or more up to it, near black above it)
// (base is the lit tone the tube is DRAWN in, celTubeBase(lens colour): the dark looks cap it brighter, so the head's tone follows what is on screen)
vec3 chevInk(vec3 base, vec3 markDark, vec3 markLight) {
  float dk = 1.0 - step(0.26, dot(pow(max(base, vec3(0.0)), vec3(2.2)), vec3(0.2126, 0.7152, 0.0722)));
  return mix(markDark * 0.5, markLight, dk);
}
vec2 chevLattice(float arc, float across, float pitch, float px, float dir) {
  float hw = pitch / 5.5;
  float x = mod(arc + 0.5 * pitch, pitch) - 0.5 * pitch;
  return chevHead(dir * x, abs(across) * hw / 0.6, hw, px, 0.0);
}
`;
/** The name the first lobule wiring used: the same chunk. */
export const CHEVRON_HEAD_GLSL = CHEVRON_GLSL;
