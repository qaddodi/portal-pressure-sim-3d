// THE ONE STREAK (Mohammad, 20 Nov: "i want the streaks to be unified"): the blood's flow marks inside a lumen, the same in the Anatomy's vessels (blood/cells/shader.ts), the 3D lobule and the 3D sinusoid
// (micro3d/cel3d.ts). LANES across the stream (3, 5 or 7 by its width), many short thin streaks to a lane, each a slim rounded LOZENGE, its alpha feathered at BOTH ends, with a seeded jitter of length, width, speed (+-25 percent) and tone;
// the speed over the lanes parabolic (the outer lane at WALL_SPEED of the middle one's, the mean over the lanes 1, so the stream's own mean stands and the chevrons agree), the middle lanes fastest, so the flow
// visibly shears; a tone between the lumen's lit tone and one shade lighter (seeded per streak, a few degrees warmer or cooler), never white, never darker than the lit tone. The JS table (STREAK, lanesFor, laneSpeed) and the GLSL (STREAK_LANE_GLSL, STREAK_MARK_GLSL, STREAK_FIELD_GLSL) say
// the same numbers: the GLSL is built from the table, and tests/b3-streaks.test.ts pins that all three sites include it.
//   STREAK_LANE_GLSL    any stage: streakLaneSpeed(lane, h), streakHash(x)
//   STREAK_MARK_GLSL   any stage: streakMark(t, y, halfW, aa), the comet's coverage at t along (0 tail .. 1 head) and y across, half width halfW, edge aa (the same unit as y)
//   STREAK_FIELD_GLSL   fragment only (fwidth): streakField(across, along, flow, halfWidth, profile, dir): the whole field of lanes for a shape that carries (-1..1 across, an along coordinate in um, the flow's run in um)
/** The streak's numbers (shader.ts): LANES across a wide vessel, many short thin streaks to a lane, each a slim rounded lozenge feathered at both ends, one flat lighter tone. Lengths and thickness in CSS px, of the tube's radius where it says so. */
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
  /** both ends are feathered: the alpha ramps 0 to 1 over this share of the length at each end, whole between (a slim rounded lozenge, never a blunt head nor a point) */
  FEATHER: 0.3,
  /** each streak's own speed, seeded: +-this on top of its lane's (symmetric, so the mean stands) */
  SPEED_JITTER: 0.25,
  /** each streak's own tone, seeded: between the vessel's lit tone and the lighter one, from TONE_MIN of the way up, with a warm or cool shift of up to HUE (a share of a channel), never darker than the lit tone, never white */
  TONE_MIN: 0.2, HUE: 0.03,
  /** how far across the tube (of its radius) the outer lane sits */
  SPAN: 0.78,
  /** a streak fades out over this many tube radii at each end of its vessel, so it never crosses a junction */
  END_R: 1.5,
  /** the turbulence's weights: near a vessel's end (a fork), in a narrowed vessel, in a vessel at its design flow */
  T_END: 0.4, T_STENOSIS: 0.9, T_FLOW: 0.5,
  /** the most a streak wanders across (of the tube's half width) and tilts (radians) at full turbulence */
  WANDER: 0.3, TILT: 0.45,
  /** CONTAINED 100 percent (Mohammad, 20 Nov: "the streaks should be CONTAINED within the vessels 100%"): a streak's whole extent, across, stays within EDGE of the lumen's radius (the lane, the wander, its width and the sideways reach of its tilt all count), so it never touches the ink; SAG: how far a straight streak may stand off a bending course (of the radius) */
  EDGE: 0.8, SAG: 0.1,
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

/** The streak's fit inside the tube (the twin of streakFit in GLSL), all in CSS px: `lat` the centre's offset from the axis, `ang` its tilt, `len` and `thick` its size, `R` the tube's radius, `bendLen` the longest a streak may be on this bend. */
export function streakFit(lat: number, ang: number, len: number, thick: number, R: number, bendLen: number): { lat: number; ang: number; len: number } {
  const room = Math.max(STREAK.EDGE * R - 0.5 * thick, 0);
  const l = Math.min(len, bendLen);
  const la = Math.min(room, Math.max(-room, lat));
  const sm = Math.min(1, Math.max(0, (room - Math.abs(la)) / Math.max(0.5 * l, 1e-3)));
  const lim = Math.asin(sm);
  return { lat: la, ang: Math.min(lim, Math.max(-lim, ang)), len: l };
}
/** The longest a straight streak may be on a bend of radius of curvature `rho` (CSS px) in a tube of radius R: its ends stand off the curve by at most SAG of R. */
export const bendLength = (rho: number, R: number): number => 2 * Math.sqrt(2 * rho * STREAK.SAG * R);
/** The whole sideways extent of a streak from the axis (CSS px): its offset, half its width and the reach of its tilt. Always within EDGE of R after streakFit. */
export const streakReach = (lat: number, ang: number, len: number, thick: number): number => Math.abs(lat) + 0.5 * thick * Math.abs(Math.cos(ang)) + 0.5 * len * Math.abs(Math.sin(ang));

const F = (x: number): string => (Number.isInteger(x) ? x.toFixed(1) : String(x));

/** Lane speed, comet shape and hash (any stage). */
export const STREAK_LANE_GLSL = /* glsl */ `
// lane: -1 .. 1 across the lanes (the outer lane's centre is +-1), h: half the lanes less a half (1, 2 or 3): the lane's speed over the stream's mean, parabolic, WALL_SPEED at the outer lane
float streakLaneSpeed(float lane, float h) {
  return (${F(STREAK.WALL_SPEED)} + ${F(1 - STREAK.WALL_SPEED)} * (1.0 - lane * lane)) / (${F(STREAK.WALL_SPEED)} + ${F(1 - STREAK.WALL_SPEED)} * (1.0 - (h + 1.0) / (3.0 * h)));
}
// the streak's fit inside the tube (CSS px; streak-glsl.ts streakFit): the centre's offset and tilt are pulled in so that the offset, half the width and the sideways reach of the tilt stay within EDGE of the radius R; the length is held to bendLen
vec3 streakFit(float lat, float ang, float len, float thick, float R, float bendLen) {
  float room = max(${F(STREAK.EDGE)} * R - 0.5 * thick, 0.0);
  float l = min(len, bendLen);
  float la = clamp(lat, -room, room);
  float sm = clamp((room - abs(la)) / max(0.5 * l, 1e-3), 0.0, 1.0);
  float lim = asin(sm);
  return vec3(la, clamp(ang, -lim, lim), l);
}
float streakHash(float x) { return fract(sin(x * 127.1 + 311.7) * 43758.5453); }
// a streak's own speed over its lane's: 1 +- SPEED_JITTER from its seed in 0 .. 1 (symmetric, so the mean stands)
float streakPace(float seed) { return 1.0 + ${F(STREAK.SPEED_JITTER)} * (2.0 * seed - 1.0); }
// a streak's own tone: k (0 .. 1) of the way from the lit tone to the lighter one (from TONE_MIN up), a warm or cool shift of a few degrees (s in 0 .. 1), never darker than the lit tone (never lighter than the lighter one's hue shift)
vec3 streakTone(vec3 lit, vec3 light, float k, float s) {
  vec3 t = mix(lit, light, ${F(STREAK.TONE_MIN)} + ${F(1 - STREAK.TONE_MIN)} * k);
  t *= vec3(1.0 + ${F(STREAK.HUE)} * (2.0 * s - 1.0), 1.0, 1.0 - ${F(STREAK.HUE)} * (2.0 * s - 1.0));
  return clamp(max(t, min(lit, light)), 0.0, 1.0);
}
`;

/** The mark's coverage (any stage; used in a fragment). */
export const STREAK_MARK_GLSL = /* glsl */ `
// t along the mark (0 at one end, 1 at the other), y across it from its axis, halfW its half width at the widest, aa the edge's antialiasing (y's unit): a slim rounded lozenge, its alpha feathered
// 0 to 1 over ${F(STREAK.FEATHER)} of the length at BOTH ends and whole between
float streakMark(float t, float y, float halfW, float aa) {
  float c = 2.0 * clamp(t, 0.0, 1.0) - 1.0;
  float w = halfW * sqrt(max(1.0 - c * c, 0.0));
  float fe = smoothstep(0.0, ${F(STREAK.FEATHER)}, t) * smoothstep(0.0, ${F(STREAK.FEATHER)}, 1.0 - t);
  return (1.0 - smoothstep(-aa, aa, abs(y) - w)) * fe;
}
`;

/** The whole field of lanes for a shape with an across and an along coordinate (fragment stage). */
export const STREAK_FIELD_GLSL = /* glsl */ `
${STREAK_LANE_GLSL}
${STREAK_MARK_GLSL}
// gStreakK: the seeds (k, s) of the tone of the last streak streakField found, for streakTone (a per-streak colour between the surface's and the streak colour's)
vec2 gStreakK = vec2(1.0, 0.5);
// across -1 .. 1 over the stream, along in um (fixed to the tissue), flow the um the stream has run (negative runs back), halfWidth the stream's half width (um: one lane to ${F(STREAK.FIELD_PITCH)} um, 3 to 7 of them),
// profile 1 the blood's parabolic lanes and 0 one speed (the lymph), dir +1 or -1: the way the stream runs (the mark is the same both ways). 1 inside a mark, 0 out.
float streakField(float across, float along, float flow, float halfWidth, float profile, float dir) {
  float lanes = clamp(2.0 * floor(floor(halfWidth * 2.0 / ${F(STREAK.FIELD_PITCH)}) * 0.5) + 1.0, 3.0, ${F(STREAK.LANES)});
  float u = (across * 0.5 + 0.5) * lanes, idx = clamp(floor(u), 0.0, lanes - 1.0), fu = fract(u);
  float h = (lanes - 1.0) * 0.5;
  float sp = mix(1.0, streakLaneSpeed((idx - h) / h, h), profile) * streakPace(streakHash(idx * 5.9 + 0.7));   // (the lane's own pace: a field's marks of one lane move as one pattern)
  float period = ${F(STREAK.FIELD_PERIOD[0])} + ${F(STREAK.FIELD_PERIOD[1])} * streakHash(idx * 3.1);
  float x = along - flow * sp + period * streakHash(idx * 1.7 + 9.1);
  float cyc = floor(x / period), xl = x - cyc * period;
  float seed = idx * 7.7 + cyc * 1.3;
  float len = ${F(STREAK.FIELD_LEN[0])} + ${F(STREAK.FIELD_LEN[1])} * streakHash(seed + 1.3);
  float t = xl / len;
  if (dir < 0.0) t = 1.0 - t;
  float hw = ${F(STREAK.FIELD_THICK)} * (1.0 - ${F(STREAK.THICK_JITTER)} * 0.5 + ${F(STREAK.THICK_JITTER)} * streakHash(seed + 4.1));
  float aa = max(fwidth(u), 1e-3);
  gStreakK = vec2(streakHash(seed + 8.3), streakHash(seed + 6.1));
  return streakMark(t, fu - 0.5, hw, aa) * step(${F(STREAK.FIELD_GAP)}, streakHash(seed * 1.9 + 2.0));
}
`;
