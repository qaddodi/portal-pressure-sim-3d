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
  FIELD_PITCH: 0.9, FIELD_EDGE: 0.9, FIELD_AT_R: 5, FIELD_PERIOD: [90, 60], FIELD_LEN: [40, 40], FIELD_THICK: 0.18, FIELD_GAP: 0.12,
  /** SLEEK (Mohammad, 20 Nov: "those streaks are horrendous... more sleek", "much thinner, variable in colour, not too white"): a streak is a LONG soft lozenge, FIELD_LEN_R tube radii on average (the field's units are 5 to the radius, so 40 to 80 units are 8 to 16 radii), with a period of 150 to 250 units so
   *  a lane is mostly empty (at least 3 x a streak's length on a thin tube); its core is CORE_PX CSS px thick (CORE_WIDE_PX on a wide tube), its edge feathered EDGE_FEATHER_PX px. */
  FIELD_LEN_R: 12, CORE_PX: 1, CORE_WIDE_PX: 1, EDGE_FEATHER_PX: 0.6,
  /** THIN AT EVERY ZOOM (Mohammad, 20 Nov: "the streaks are insanely thick when zoomed out"): the core is in screen px (never a share of the radius), whatever each streak's jitter makes of it, never over CORE_MAX_PX; and the streak's LENGTH is held in screen px too:
   *  the pattern scales with the tube's radius only between LEN_R_PX[0] and LEN_R_PX[1] CSS px of radius (a streak is then 8 to 16 radii long), under it the length stays at 8 x LEN_R_PX[0] = 24 px or more, over it at 16 x LEN_R_PX[1] = 96 px at most. */
  CORE_MAX_PX: 1.1, LEN_R_PX: [3, 6],
  /** both ends are feathered: the alpha ramps 0 to 1 over this share of the length at each end, whole between (a slim rounded lozenge, never a blunt head nor a point) */
  FEATHER: 0.35,
  /** each streak's own speed, seeded: +-this on top of its lane's (symmetric, so the mean stands) */
  SPEED_JITTER: 0.25,
  /** each streak's own tone, seeded, a subtle tint of the vessel's OWN tone: from the body x TONE_LO to the body mixed TONE_HI toward white (TONE_HI x (1 + TONE_WIDE_UP) on a wide tube), x (1 +- LIGHT_VAR) in lightness, a warm or cool shift of up to HUE (a share of a channel),
   *  never darker than the body and never more than WHITE_CAP of the way to white */
  TONE_LO: 1.1, TONE_HI: 0.26, TONE_WIDE_UP: 0.15, WHITE_CAP: 0.3, DEEP_SHARE: 0.6, LIGHT_VAR: 0.08, HUE: 0.03,
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
  /** the streak's alpha (whole inside the lumen band) */
  ALPHA: 1,
  /** on screen (CSS px of the lumen's radius): none under MIN_R_PX (a tube under 3.5 px across), 1 lane under LANE_R_PX[0], 3 lanes up to LANE_R_PX[1], 5 above; the wide tube's thicker core and stronger tint come in over WIDE_R_PX */
  MIN_R_PX: 1.75, LANE_R_PX: [4, 8], WIDE_R_PX: [5.5, 7.5],
} as const;
/** Whether a streak of the field can be at `across` (-1 .. 1 over the lumen) at all: the field draws nothing past FIELD_EDGE, so a streak never reaches the ink (the twin of the clip in streakField). */
export const streakInside = (across: number): boolean => Math.abs(across) <= STREAK.FIELD_EDGE;
/** The furthest across (of the lumen's half width) any mark of a field of `lanes` lanes reaches: the outer lane's centre plus its half width, all inside FIELD_EDGE. */
export function fieldReach(lanes: number): number {
  const half = STREAK.FIELD_THICK * (1 + STREAK.THICK_JITTER / 2) * (1 / lanes);   // (lane units: the mark's half width, a lane being 1 wide, in the lane's share of the face)
  const centre = (lanes - 1) / lanes;
  return STREAK.FIELD_EDGE * Math.min(1, centre + 2 * half);
}
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

/** The twin of the field's phase (`x = along - flow * sp + ...` in streakField): where a streak of the lane's pace `sp` (always above 0) stands, along the tube, when the stream has run `flow`: a mark at phase `c` is at along = c + flow * sp, so it moves the way `flow` grows
 *  (with the blood, the way the chevron heads of the same stream move: their lattice stands at Dm + j P), forward on a forward flow, back on a reversed one. */
export const streakAlong = (c: number, flow: number, sp: number): number => c + flow * sp;
const sstep = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** How wide a tube is on screen, 0 to 1 (the shader's gStreakWide): from WIDE_R_PX[0] to WIDE_R_PX[1] CSS px of radius. */
export const streakWide = (rCss: number): number => sstep(STREAK.WIDE_R_PX[0], STREAK.WIDE_R_PX[1], rCss);
/** The lanes a lumen of radius `rCss` CSS px takes on screen: 1 under LANE_R_PX[0], 3 under LANE_R_PX[1], else 5 (the shader's gStreakLanes); none (0) under MIN_R_PX. */
export const lanesForPx = (rCss: number): number => (rCss < STREAK.MIN_R_PX ? 0 : rCss < STREAK.LANE_R_PX[0] ? 1 : rCss < STREAK.LANE_R_PX[1] ? 3 : 5);
/** The core width in CSS px of the thinnest (`thin`) or thickest streak in a lumen of radius `rCss` CSS px (the twin of the field's hw): CORE_PX to CORE_WIDE_PX by the tube's width, x (1 -+ THICK_JITTER / 2). */
export function streakCorePx(rCss: number, _lanes = 0, thin = true): number {
  return Math.min(STREAK.CORE_MAX_PX, (STREAK.CORE_PX + (STREAK.CORE_WIDE_PX - STREAK.CORE_PX) * streakWide(rCss)) * (1 + (thin ? -0.5 : 0.5) * STREAK.THICK_JITTER));
}
/** The pattern's scale factor on a lumen of radius `rCss` CSS px (the twin of `rCss / clamp(rCss, LEN_R_PX)` in the shaders): the field's along coordinate is multiplied by it, so a streak is `fieldLen / FIELD_AT_R x clamp(rCss, LEN_R_PX)` CSS px long. */
export const streakLenK = (rCss: number): number => rCss / Math.min(STREAK.LEN_R_PX[1], Math.max(STREAK.LEN_R_PX[0], rCss));
/** A streak of `fieldLen` field units (FIELD_LEN: 40 to 80), its length on screen in CSS px on a lumen of radius `rCss` CSS px: 24 to 96 px whatever the zoom. */
export const streakLenPx = (rCss: number, fieldLen: number): number => fieldLen / STREAK.FIELD_AT_R * Math.min(STREAK.LEN_R_PX[1], Math.max(STREAK.LEN_R_PX[0], rCss));
/** The share of a lumen's face the streaks cover, on average (the field's lanes, marks, gaps and feathered ends). */
export function streakCoverage(rCss: number, lanes: number): number {
  const lanePx = (rCss * 2 * STREAK.FIELD_EDGE) / lanes, widthShare = Math.min(0.5, streakCorePx(rCss, lanes, true) * 1.15 / 0.85 / 2 / lanePx) * 2;
  const len = STREAK.FIELD_LEN[0] + STREAK.FIELD_LEN[1] * 0.5, period = STREAK.FIELD_PERIOD[0] + STREAK.FIELD_PERIOD[1] * 0.5;
  const lozenge = Math.PI / 4, feather = 1 - STREAK.FEATHER * 0.5;
  return STREAK.FIELD_EDGE * widthShare * Math.min(1, len / period) * lozenge * feather * (1 - STREAK.FIELD_GAP);
}
const hashJs = (x: number): number => { const v = Math.sin(x * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };
/** The twin of streakTone: k (0 .. 1) between the body x TONE_LO and the body mixed TONE_HI (more on a wide tube, `wide` 0 to 1) toward `light`, lightness x (1 +- LIGHT_VAR) and a hue shift from s (0 .. 1), never darker than the body, never over WHITE_CAP toward `light`. */
export function streakToneJs(lit: readonly number[], light: readonly number[], k: number, s: number, wide = 0): number[] {
  const lum = 0.299 * lit[0]! + 0.587 * lit[1]! + 0.114 * lit[2]!, deep = STREAK.DEEP_SHARE + (1 - STREAK.DEEP_SHARE) * sstep(0.1, 0.45, lum);
  const hiK = Math.min(STREAK.WHITE_CAP, STREAK.TONE_HI * (1 + STREAK.TONE_WIDE_UP * wide) * deep), lv = 1 + STREAK.LIGHT_VAR * (2 * hashJs(s * 17.3 + 1.1) - 1), h = STREAK.HUE * (2 * s - 1);
  return lit.map((v, i) => {
    const lo = v * STREAK.TONE_LO, hi = v + (light[i]! - v) * hiK;
    const t = (lo + (hi - lo) * k) * lv * (i === 0 ? 1 + h : i === 2 ? 1 - h : 1);
    const cap = v + (light[i]! - v) * STREAK.WHITE_CAP;
    return Math.min(1, Math.max(0, Math.min(Math.max(t, v), cap)));
  });
}

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
// gStreakWide: 0 on a thin tube to 1 on a wide one (the caller knows its width on screen, else 0): the wide tube's tint is a little stronger
float gStreakWide = 0.0;
// a streak's own tone, a subtle tint of the tube's own: k (0 .. 1) between the lit tone x TONE_LO and the lit tone mixed TONE_HI toward light (white), lightness +-LIGHT_VAR from s, a warm or cool shift of a few degrees,
// never darker than the lit tone and never over WHITE_CAP of the way to light
vec3 streakTone(vec3 lit, vec3 light, float k, float s) {
  // (a deep body takes less of the white: one mix is a bigger step on a dark tone, so the step stays gentle on every tube)
  float hiK = min(${F(STREAK.WHITE_CAP)}, ${F(STREAK.TONE_HI)} * (1.0 + ${F(STREAK.TONE_WIDE_UP)} * gStreakWide) * mix(${F(STREAK.DEEP_SHARE)}, 1.0, smoothstep(0.1, 0.45, dot(lit, vec3(0.299, 0.587, 0.114)))));
  vec3 t = mix(lit * ${F(STREAK.TONE_LO)}, mix(lit, light, hiK), k);
  t *= 1.0 + ${F(STREAK.LIGHT_VAR)} * (2.0 * streakHash(s * 17.3 + 1.1) - 1.0);
  t *= vec3(1.0 + ${F(STREAK.HUE)} * (2.0 * s - 1.0), 1.0, 1.0 - ${F(STREAK.HUE)} * (2.0 * s - 1.0));
  return clamp(min(max(t, lit), mix(lit, light, ${F(STREAK.WHITE_CAP)})), 0.0, 1.0);
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
// gStreakPx: CSS px to one unit of across (the lumen's radius) where the caller knows it, else 0: the mark's core is CORE_PX thick on screen
float gStreakPx = 0.0;
// gStreakLanes: the lane count (1, 3, 5, 7) when the caller cuts the lanes by the width on screen, else 0 (from the half width, 3 to 7)
float gStreakLanes = 0.0;
// across -1 .. 1 over the stream, along in um (fixed to the tissue), flow the um the stream has run (negative runs back), halfWidth the stream's half width (um: one lane to ${F(STREAK.FIELD_PITCH)} um, 3 to 7 of them),
// profile 1 the blood's parabolic lanes and 0 one speed (the lymph), dir +1 or -1: the way the stream runs (the mark is the same both ways). 1 inside a mark, 0 out.
float streakField(float across, float along, float flow, float halfWidth, float profile, float dir) {
  float lanes = gStreakLanes > 0.5 ? gStreakLanes : clamp(2.0 * floor(floor(halfWidth * 2.0 / ${F(STREAK.FIELD_PITCH)}) * 0.5) + 1.0, 3.0, ${F(STREAK.LANES)});
  // CONTAINED BY CONSTRUCTION: the lanes fill the lumen out to FIELD_EDGE of its half width and nothing at all is drawn past it, so no streak ever reaches the ink, whatever feeds this function
  float ca = across / ${F(STREAK.FIELD_EDGE)};
  float inLumen = step(abs(ca), 1.0);
  float u = (clamp(ca, -1.0, 1.0) * 0.5 + 0.5) * lanes, idx = clamp(floor(u), 0.0, lanes - 1.0), fu = fract(u);
  float h = (lanes - 1.0) * 0.5;
  float sp = (lanes > 1.5 ? mix(1.0, streakLaneSpeed((idx - h) / h, h), profile) : 1.0) * streakPace(streakHash(idx * 5.9 + 0.7));   // (the lane's own pace: a field's marks of one lane move as one pattern)
  float period = ${F(STREAK.FIELD_PERIOD[0])} + ${F(STREAK.FIELD_PERIOD[1])} * streakHash(idx * 3.1);
  float x = along - flow * sp + period * streakHash(idx * 1.7 + 9.1);
  float cyc = floor(x / period), xl = x - cyc * period;
  float seed = idx * 7.7 + cyc * 1.3;
  float len = ${F(STREAK.FIELD_LEN[0])} + ${F(STREAK.FIELD_LEN[1])} * streakHash(seed + 1.3);
  float t = xl / len;
  if (dir < 0.0) t = 1.0 - t;
  float jit = 1.0 - ${F(STREAK.THICK_JITTER)} * 0.5 + ${F(STREAK.THICK_JITTER)} * streakHash(seed + 4.1);
  float hw = ${F(STREAK.FIELD_THICK)} * jit;
  float lanePx = gStreakPx * 2.0 * ${F(STREAK.FIELD_EDGE)} / lanes;
  float aa = max(fwidth(u), 1e-3);
  // on screen (the caller knows the lumen's radius in CSS px): the core is CORE_PX thick, CORE_WIDE_PX on a wide tube, its edge feathered EDGE_FEATHER_PX
  if (lanePx > 0.0) { hw = min(0.5, min(${F(STREAK.CORE_MAX_PX)}, mix(${F(STREAK.CORE_PX)}, ${F(STREAK.CORE_WIDE_PX)}, gStreakWide) * jit) * 0.5 / lanePx); aa = max(${F(STREAK.EDGE_FEATHER_PX)} * 0.5 / lanePx, 1e-3); }
  gStreakK = vec2(streakHash(seed + 8.3), streakHash(seed + 6.1));
  return inLumen * streakMark(t, fu - 0.5, hw, aa) * step(${F(STREAK.FIELD_GAP)}, streakHash(seed * 1.9 + 2.0));
}
`;
