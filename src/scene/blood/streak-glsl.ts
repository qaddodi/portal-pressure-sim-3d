// THE ONE STREAK (Mohammad, 20 Nov: "i want the streaks to be unified"): the blood's flow marks inside a lumen, the same in the Anatomy's vessels (blood/cells/shader.ts), the 3D lobule and the 3D sinusoid
// (micro3d/cel3d.ts). LANES across the stream (3, 5 or 7 by its width), many short thin streaks to a lane, each a COMET (a blunt round head, a tail tapering to a point) with a seeded jitter of length and width;
// the speed over the lanes parabolic (the outer lane at WALL_SPEED of the middle one's, the mean over the lanes 1, so the stream's own mean stands and the chevrons agree), the middle lanes fastest, so the flow
// visibly shears; ONE flat tone, one shade lighter than the lumen's lit tone, never white. The JS table (STREAK, lanesFor, laneSpeed) and the GLSL (STREAK_LANE_GLSL, STREAK_COMET_GLSL, STREAK_FIELD_GLSL) say
// the same numbers: the GLSL is built from the table, and tests/b3-streaks.test.ts pins that all three sites include it.
//   STREAK_LANE_GLSL    any stage: streakLaneSpeed(lane, h), streakHash(x)
//   STREAK_COMET_GLSL   any stage: streakComet(t, y, halfW, aa), the comet's coverage at t along (0 tail .. 1 head) and y across, half width halfW, edge aa (the same unit as y)
//   STREAK_FIELD_GLSL   fragment only (fwidth): streakField(across, along, flow, halfWidth, profile, dir): the whole field of lanes for a shape that carries (-1..1 across, an along coordinate in um, the flow's run in um)
/** The streak's numbers (shader.ts): LANES across a wide vessel, many short thin streaks to a lane, each a comet (a blunt round head, a tail tapering to a point), one flat lighter tone. Lengths and thickness in CSS px, of the tube's radius where it says so. */
export const STREAK = {
  /** the lanes across the widest tube (odd, so one runs down the middle); a thinner tube takes fewer (lanesFor), never under 3 */
  LANES: 7,
  /** a vessel of this radius (2D units) or more takes all 7 lanes, 5 from LANE_5, 3 below */
  LANE_7: 5, LANE_5: 3,
  /** the lane at the wall runs at this share of the middle lane's speed: parabolic between, so the flow visibly shears (each lane's speed is divided by the mean over the lanes, so the stream's own mean stands and the chevrons agree) */
  WALL_SPEED: 0.15,
  /** the streak's length: this many tube radii (a little varied by streak, longer with the flow), never under LEN_FLOOR nor over LEN_MAX px */
  LEN_OF_R: 2.6, LEN_FLOOR: 6, LEN_MAX: 30, LEN_JITTER: 0.3, LEN_FLOW: [0.8, 1.25],
  /** its thickness at the widest: this share of the tube's radius, between THICK_MIN and THICK_MAX px, a little varied by streak */
  THICK_OF_R: 0.16, THICK_MIN: 1.3, THICK_MAX: 3, THICK_JITTER: 0.3,
  /** the field's own numbers (a shape with an across and an along, um): a lane's pitch, a comet's period and length (base + spread), its half width in lane units, the share of the cycles left empty */
  FIELD_PITCH: 0.9, FIELD_PERIOD: [34, 26], FIELD_LEN: [12, 14], FIELD_THICK: 0.3, FIELD_GAP: 0.25,
  /** the head's share of the length: blunt and round; behind it the width tapers to a point */
  HEAD: 0.22,
  /** how far across the tube (of its radius) the outer lane sits */
  SPAN: 0.78,
  /** a streak fades out over this many tube radii at each end of its vessel, so it never crosses a junction */
  END_R: 1.5,
  /** the turbulence's weights: near a vessel's end (a fork), in a narrowed vessel, in a vessel at its design flow */
  T_END: 0.4, T_STENOSIS: 0.9, T_FLOW: 0.5,
  /** the most a streak wanders across (of the tube's half width) and tilts (radians) at full turbulence */
  WANDER: 0.3, TILT: 0.45,
  /** the vessel's lit tone lifted this far toward white (one shade lighter, never white) and the streak's alpha (whole inside the lumen band) */
  LIFT: 0.28, ALPHA: 1,
} as const;
/** The streak lanes a vessel of radius `r2d` (2D units) carries across its width: 3, 5 or 7. */
export const lanesFor = (r2d: number): number => (r2d >= STREAK.LANE_7 ? 7 : r2d >= STREAK.LANE_5 ? 5 : 3);
/** The speed of lane `k` (-h to h, of a tube with 2h+1 lanes) as a share of the stream's mean speed: parabolic, WALL_SPEED of the middle lane's at the outer lane, the mean over the lanes 1. */
export function laneSpeed(k: number, h: number): number {
  const at = (n: number) => STREAK.WALL_SPEED + (1 - STREAK.WALL_SPEED) * (1 - (n / h) * (n / h));
  let m = 0; for (let n = -h; n <= h; n++) m += at(n) / (2 * h + 1);
  return at(k) / m;
}

const F = (x: number): string => (Number.isInteger(x) ? x.toFixed(1) : String(x));

/** Lane speed, comet shape and hash (any stage). */
export const STREAK_LANE_GLSL = /* glsl */ `
// lane: -1 .. 1 across the lanes (the outer lane's centre is +-1), h: half the lanes less a half (1, 2 or 3): the lane's speed over the stream's mean, parabolic, WALL_SPEED at the outer lane
float streakLaneSpeed(float lane, float h) {
  return (${F(STREAK.WALL_SPEED)} + ${F(1 - STREAK.WALL_SPEED)} * (1.0 - lane * lane)) / (${F(STREAK.WALL_SPEED)} + ${F(1 - STREAK.WALL_SPEED)} * (1.0 - (h + 1.0) / (3.0 * h)));
}
float streakHash(float x) { return fract(sin(x * 127.1 + 311.7) * 43758.5453); }
`;

/** The comet's coverage (any stage; used in a fragment). */
export const STREAK_COMET_GLSL = /* glsl */ `
// t along the comet (0 at the tail's point, 1 at the head's front), y across it from its axis, halfW its half width at the widest, aa the edge's antialiasing (y's unit): a tail tapering to a point, a blunt round head
float streakComet(float t, float y, float halfW, float aa) {
  float hd = ${F(STREAK.HEAD)};
  float w = halfW * (t < 1.0 - hd ? pow(max(t, 0.0) / (1.0 - hd), 1.3) : sqrt(max(1.0 - ((t - (1.0 - hd)) / hd) * ((t - (1.0 - hd)) / hd), 0.0)));
  return (1.0 - smoothstep(-aa, aa, abs(y) - w)) * step(0.0, t) * step(t, 1.0);
}
`;

/** The whole field of lanes for a shape with an across and an along coordinate (fragment stage). */
export const STREAK_FIELD_GLSL = /* glsl */ `
${STREAK_LANE_GLSL}
${STREAK_COMET_GLSL}
// across -1 .. 1 over the stream, along in um (fixed to the tissue), flow the um the stream has run (negative runs back), halfWidth the stream's half width (um: one lane to ${F(STREAK.FIELD_PITCH)} um, 3 to 7 of them),
// profile 1 the blood's parabolic lanes and 0 one speed (the lymph), dir +1 the head leads toward +along, -1 toward -along. 1 inside a comet, 0 out.
float streakField(float across, float along, float flow, float halfWidth, float profile, float dir) {
  float lanes = clamp(2.0 * floor(floor(halfWidth * 2.0 / ${F(STREAK.FIELD_PITCH)}) * 0.5) + 1.0, 3.0, ${F(STREAK.LANES)});
  float u = (across * 0.5 + 0.5) * lanes, idx = clamp(floor(u), 0.0, lanes - 1.0), fu = fract(u);
  float h = (lanes - 1.0) * 0.5;
  float sp = mix(1.0, streakLaneSpeed((idx - h) / h, h), profile);
  float period = ${F(STREAK.FIELD_PERIOD[0])} + ${F(STREAK.FIELD_PERIOD[1])} * streakHash(idx * 3.1);
  float x = along - flow * sp + period * streakHash(idx * 1.7 + 9.1);
  float cyc = floor(x / period), xl = x - cyc * period;
  float seed = idx * 7.7 + cyc * 1.3;
  float len = ${F(STREAK.FIELD_LEN[0])} + ${F(STREAK.FIELD_LEN[1])} * streakHash(seed + 1.3);
  float t = xl / len;
  if (dir < 0.0) t = 1.0 - t;
  float hw = ${F(STREAK.FIELD_THICK)} * (1.0 - ${F(STREAK.THICK_JITTER)} * 0.5 + ${F(STREAK.THICK_JITTER)} * streakHash(seed + 4.1));
  float aa = max(fwidth(u), 1e-3);
  return streakComet(t, fu - 0.5, hw, aa) * step(${F(STREAK.FIELD_GAP)}, streakHash(seed * 1.9 + 2.0));
}
`;
