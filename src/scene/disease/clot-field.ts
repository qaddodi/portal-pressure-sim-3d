// THE CLOT IS PAINTED IN ITS VEIN'S OWN FRAGMENT SHADER (plan 26). It is not a mesh: a separate mesh inside an opaque tube had to win a depth contest against that tube at every pixel and every angle, and to stay inside an outline it did not
// share; no bias satisfies both (plans 11, 19: torn, angle-dependent, faded ends). Here the clot is a shape in the lumen's own coordinates (along the vein, across the lumen), decided by the pixel of the tube it lies in, so it has the
// vein's depth, outline, fades, cava cut and junction weights by construction and is inside the wall because it is clipped to the lumen before the ink band.
//
// THE SHAPE is 2D's (copied/clot-shape.js, unchanged: clotSpan, clotRadius, clotShift, clotSide), in lumen units (the lumen's half width = 1):
//   half width  h(f) = clotRadius(v, 2 INSIDE, f, seed)     f = the share along the clot, 0..1
//   centre      c(f) = side (INSIDE - h(f))                  against the wall the seed picks, the wall side resting on the lumen's edge
//   inside      |lat - c(f)| < h(f)
// The ends are crisp rounded caps beyond f = 0 and f = 1: an ellipse of half axes (CLOT_CAP_LEN lumen radii along, h at the end across). NO alpha ramp anywhere: the edge is one device pixel of anti-aliasing (the distance in px is analytic,
// not a derivative: a fwidth after a discard is garbage on a device that drops the lane, as the rest of the vessel shader notes).
// GROWTH: the span follows 2D's clotSpan(v) and h follows v, so the clot grows from the middle out, along and across, with the eased v (the lesion ease) and recedes the same way.
//
// THE UNIFORMS, per piece of the vein (a vein cut into pieces is one vein: each piece takes its share of the whole clot):
//   clotA = (f0, df, side * v, length)   the share along the clot at the piece's own u (0..1 along the piece) is f = f0 + df u; v 0: no clot; length: the whole clot's length, figure units (the caps' length is in lumen radii)
//   clotP = (p1, p2, 0, 0)               the seed's two lump phases
import { clamp } from './copied/num.js';
import { clotRadius, clotShift, clotSide, clotSpan, hashSeed, rng } from './copied/clot-shape.js';

/** The share of the lumen's half width the clot's wall side reaches: the whole of it. The clot's wall side rests on the lumen's edge, which is where the vein's ink band begins, and the ink is painted after the clot. */
export const CLOT_INSIDE = 1;
/** The clot is painted this many device px past the lumen's edge on its wall side (hidden under the vein's ink, which is opaque a half pixel past the edge): the clot's anti-aliased edge never lets the vein's tone through between it and the wall. */
export const CLOT_WALL_SLACK_PX = 1;
/** The length of a cap, in lumen radii (the ellipse's half axis along the vein). */
export const CLOT_CAP_LEN = 0.6;
/** The clot comes in over this range of v (a clot of a hair's width does not pop in: it eases up from 0.003, the layer's own floor). */
export const CLOT_V_FROM = 0.003, CLOT_V_TO = 0.08;
/** FULL OCCLUSION FILLS THE LUMEN (Mohammad, 25 Nov: the Budd-Chiari clots read as flat slabs along one wall instead of filling the vein; 2D's own words: at full occlusion the clot "spans the lumen with blunt ends"). Over this range of v the mural cast
 *  (everything below, the approved look of 22 Nov, unchanged under CLOT_FILL_FROM) opens to span the lumen edge to edge: its half width goes to the lumen's whole, its centre to the lumen's axis, its lumps die out, and its free-edge ink leaves its sides (they are the
 *  vein's own wall line) and stays on its caps. At v = CLOT_FILL_TO it is a plug with blunt ends. */
export const CLOT_FILL_FROM = 0.82, CLOT_FILL_TO = 1.0;
/** The plug is painted this much (never more, in lumen units) past the lumen's edge on BOTH walls, under the vein's ink, as the mural cast's wall side is: no pale rim between the plug and the wall. */
export const CLOT_FILL_SLACK_MAX = 0.25;
/** The cap's ink eases in over this much of the cap's own length (the ink is on the free edge and the caps, never along the wall side). */
export const CLOT_CAP_INK_FROM = 0.0, CLOT_CAP_INK_TO = 0.35;
/** The free edge's ink: full on the face toward the lumen (side * q at or under FREE_FROM), none against the wall (at or over FREE_TO). */
export const CLOT_FREE_FROM = 0.1, CLOT_FREE_TO = 0.7;

const smooth = (a: number, b: number, x: number): number => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export interface ClotUniform { f0: number; df: number; /** side * v (0: no clot) */ sv: number; /** figure units */ length: number; p1: number; p2: number }

/** The two lump phases of a vein's seed (2D's clotRadius draws them from the seed). */
export function clotPhases(id: string): { p1: number; p2: number; seed: number; side: number } {
  const seed = hashSeed(id), r = rng(seed ^ 0x9E3779B9), p1 = r() * 6.283, p2 = r() * 6.283;
  return { p1, p2, seed, side: clotSide(seed) };
}

/** The clot's half width and centre at share `f` along it, in lumen units: 2D's clotRadius and clotShift on a lumen of width 2 * CLOT_INSIDE. */
export function clotShapeAt(v: number, f: number, id: string): { h: number; c: number } {
  const { seed, side } = clotPhases(id), h = clotRadius(v, 2 * CLOT_INSIDE, f, seed);
  return { h, c: clotShift(2 * CLOT_INSIDE, h, side) };
}

/** The shader's clot function (GLSL clotAt) as pure JS: coverage 0..1 at the pixel, how far inside the edge it is (device px), and the ink's free weight. `u` the share along the piece, `lat` the signed lateral in lumen units, `lenFig` the piece's
 *  vessel length is not needed: `vRf` the lumen radius in figure units, `rDev` the lumen radius in device px. */
/** The clot's half width and centre as the shader draws them at the share `fc` (0..1) along it, in lumen units, on a lumen `rDev` device px in radius (the wall side is pushed CLOT_WALL_SLACK_PX past the edge, under the ink): the one place the twin and the tests read them. */
export function clotDrawnShape(a: ClotUniform, fc: number, rDev: number): { h: number; c: number; side: number } {
  const v = Math.abs(a.sv), side = a.sv < 0 ? -1 : 1, k = smooth(CLOT_FILL_FROM, CLOT_FILL_TO, v);
  const fl = 0.3 + 0.5 * v * v * v;
  const body = fl + (1 - fl) * Math.sqrt(Math.max(Math.sin(Math.PI * fc), 0));
  const lump = 1 + (1 - k) * (0.08 * Math.sin(fc * 18.85 + a.p1) + 0.05 * Math.sin(fc * 43.98 + a.p2));
  const h0 = Math.min(CLOT_INSIDE, CLOT_INSIDE * clamp(0.1 + 0.9 * v, 0, 1) * body * lump);
  // (the slack is never more than the clot's own half width: on a vein a few px wide (the placed caudate vein is under 2.5 px in radius on a phone) a whole px is more than the lumen's share the clot takes, and the push carried the whole clot past the
  //  edge, under the ink: no clot was drawn at the ostium. Capped, at least half of it stays in the lumen.)
  const c0 = side * (CLOT_INSIDE - h0) + side * Math.min(CLOT_WALL_SLACK_PX / Math.max(rDev, 1), h0);
  const h = h0 + (CLOT_INSIDE + Math.min(CLOT_WALL_SLACK_PX / Math.max(rDev, 1), CLOT_FILL_SLACK_MAX) - h0) * k;
  return { h, c: c0 * (1 - k), side };
}

export function clotAtTwin(a: ClotUniform, u: number, lat: number, vRf: number, rDev: number): { cover: number; distIn: number; free: number } {
  const v = Math.abs(a.sv);
  const f = a.f0 + a.df * u, fc = clamp(f, 0, 1);
  const { h, c, side } = clotDrawnShape(a, fc, rDev);
  const along = f < 0 ? -f : f > 1 ? f - 1 : 0;
  const dn = along * a.length / Math.max(CLOT_CAP_LEN * vRf, 1e-6);
  const q = (lat - c) / h;
  const len = Math.max(Math.hypot(dn, q), 1e-4), F = len - 1;
  const gF = Math.hypot(dn / (CLOT_CAP_LEN * Math.max(rDev, 1e-3)), q / (h * Math.max(rDev, 1e-3))) / len;   // (the exact gradient of F per device px: one px of anti-aliasing on every part of the edge)
  const distIn = -F / gF;
  const on = smooth(CLOT_V_FROM, CLOT_V_TO, v), kf = smooth(CLOT_FILL_FROM, CLOT_FILL_TO, v);
  return { cover: clamp(0.5 + distIn, 0, 1) * on, distIn, free: Math.max((1 - smooth(CLOT_FREE_FROM, CLOT_FREE_TO, side * q)) * (1 - kf), smooth(CLOT_CAP_INK_FROM, CLOT_CAP_INK_TO, dn)) };
}

/** The geometry of the shape on the wall: the wall side of a clot of occlusion `v` at share `f` is on the lumen's edge, never past it (the gate: |c| + h <= CLOT_INSIDE). */
export function clotWallReach(v: number, f: number, id: string): number { const { h, c } = clotShapeAt(v, f, id); return Math.abs(c) + h; }

/** THE CLOT IS CUT AT THE TRUNK'S WALL (plan 34e): a clot is never outside its own vein's wall, and a vein that opens into the cava ends at the cava's wall. `px`: how far OUTSIDE the trunk's lumen the pixel is, in device px (negative inside); the clot's share is 0 from half a pixel inside, whole from half a pixel
 *  outside: the one-pixel edge the tube's own cava cut has (vessels/shaders.ts cavA). The tube multiplies its clot by cavA; the junction skin, whose union lumen includes the cava, by this (skin/shaders.ts skinOutsideTrunk), so neither paints a clot pixel inside the cava. */
export const trunkCutTwin = (px: number): number => smooth(-0.5, 0.5, px);

/** How long an OSTIAL clot is, in vein widths (plan 34d): (1 + 2 v) widths, so about one width as it starts and three at full occlusion, never more than this share of the drawn vein (a short vein's clot stays in its proximal half). */
export const OSTIAL_MAX_SHARE = 0.45;
export const ostialLength = (v: number, D: number, length: number): number => Math.min((1 + 2 * v) * D, OSTIAL_MAX_SHARE * length);

/** The share of the vein's length a clot of occlusion `v` covers. A vein that opens into the cava (Budd-Chiari: hepatic vein thrombosis) is clotted at its OSTIUM and upstream (plan 34d): `limit` is the proximal end b, the IVC's drawn wall less the cap's length, so the cap's tip touches the wall and never enters the IVC; `len` is the clot's length as a share of the vein
 *  (ostialLength: vein widths, not a share of the vein). b stays put as v rises and the distal end `a` falls, the clot growing upstream. Any other vein (limit null) keeps clotSpan, growing from the middle. */
export function clotRange(v: number, limit: number | null, len = 0): { a: number; b: number } {
  if (limit == null) { const span = clotSpan(v); return { a: span.u0, b: span.u1 }; }
  const b = Math.max(limit, 0);
  return { a: Math.max(0, b - len), b };
}

/** What each piece of a vein is given: for a vein of pieces whose arcs (scene units) run `starts[k]` to `ends[k]` along a whole vein of `length`, the clot [a, b] (shares) as the piece's uniform. */
export function clotPiece(a: number, b: number, length: number, start: number, end: number, sv: number, id: string, units = 300): ClotUniform {
  const span = Math.max((b - a) * length, 1e-9), { p1, p2 } = clotPhases(id);
  return { f0: (start - a * length) / span, df: (end - start) / span, sv, length: span * units, p1, p2 };
}

/** The GLSL the vessel's and the skin's fragment stages share. Declarations first (a program with no clot has them at 0: the branch is never taken, so every pixel is the old program's), the function after. */
export const CLOT_FN_GLSL = /* glsl */ `
// THE CLOT (disease/clot-field.ts, plan 26): coverage, distance inside the edge in device px, and the ink's free weight at a pixel. u: the share along the piece; lat: the signed lateral in lumen units (-1..1 across the lumen);
// vRf: the lumen's half width, figure units; rDev: in device px. a = (f0, df, side * v, the clot's length in figure units), p = the seed's lump phases. Pure: no derivative (they are garbage after a discard on some devices).
vec3 clotAt(vec4 a, vec2 p, float u, float lat, float vRf, float rDev) {
  float v = abs(a.z);
  float side = a.z < 0.0 ? -1.0 : 1.0;
  float f = a.x + a.y * u;
  float fc = clamp(f, 0.0, 1.0);
  float kf = smoothstep(CLOT_FILL_FROM, CLOT_FILL_TO, v);
  float fl = 0.3 + 0.5 * v * v * v;
  float body = fl + (1.0 - fl) * sqrt(max(sin(3.14159265 * fc), 0.0));
  float lump = 1.0 + (1.0 - kf) * (0.08 * sin(fc * 18.85 + p.x) + 0.05 * sin(fc * 43.98 + p.y));
  float h0 = min(CLOT_INSIDE, CLOT_INSIDE * clamp(0.1 + 0.9 * v, 0.0, 1.0) * body * lump);
  float c0 = side * (CLOT_INSIDE - h0) + side * min(CLOT_WALL_SLACK_PX / max(rDev, 1.0), h0);
  float h = h0 + (CLOT_INSIDE + min(CLOT_WALL_SLACK_PX / max(rDev, 1.0), CLOT_FILL_SLACK_MAX) - h0) * kf;
  float c = c0 * (1.0 - kf);
  float along = f < 0.0 ? -f : (f > 1.0 ? f - 1.0 : 0.0);
  float dn = along * a.w / max(CLOT_CAP_LEN * vRf, 1e-6);
  float q = (lat - c) / h;
  float len = max(length(vec2(dn, q)), 1e-4);
  float F = len - 1.0;
  float gF = length(vec2(dn / (CLOT_CAP_LEN * max(rDev, 1e-3)), q / (h * max(rDev, 1e-3)))) / len;
  float distIn = -F / gF;
  float on = smoothstep(CLOT_V_FROM, CLOT_V_TO, v);
  float free = max((1.0 - smoothstep(CLOT_FREE_FROM, CLOT_FREE_TO, side * q)) * (1.0 - kf), smoothstep(CLOT_CAP_INK_FROM, CLOT_CAP_INK_TO, dn));
  return vec3(clamp(0.5 + distIn, 0.0, 1.0) * on, distIn, free);
}`;

const N = (x: number): string => (Number.isInteger(x) ? x.toFixed(1) : String(x));
/** The constants of the function as GLSL defines. */
export const CLOT_CONST_GLSL = /* glsl */ `
#define CLOT_INSIDE ${N(CLOT_INSIDE)}
#define CLOT_WALL_SLACK_PX ${N(CLOT_WALL_SLACK_PX)}
#define CLOT_CAP_LEN ${N(CLOT_CAP_LEN)}
#define CLOT_V_FROM ${N(CLOT_V_FROM)}
#define CLOT_V_TO ${N(CLOT_V_TO)}
#define CLOT_FILL_FROM ${N(CLOT_FILL_FROM)}
#define CLOT_FILL_TO ${N(CLOT_FILL_TO)}
#define CLOT_FILL_SLACK_MAX ${N(CLOT_FILL_SLACK_MAX)}
#define CLOT_CAP_INK_FROM ${N(CLOT_CAP_INK_FROM)}
#define CLOT_CAP_INK_TO ${N(CLOT_CAP_INK_TO)}
#define CLOT_FREE_FROM ${N(CLOT_FREE_FROM)}
#define CLOT_FREE_TO ${N(CLOT_FREE_TO)}`;

/** The clot's tones, ink and light bands, in GLSL: the three flat tones by the pixel's own n.L (`sT`, with the edge `fw`), the ink colour a deep tone of the shade. Reads: clotShade, clotBase, clotLift, inkColor, tubeDark. */
export const CLOT_LIFT_AT = 0.3;
export const CLOT_SHADE_AT = -0.2;
/** The clot's line is the vein's own weight (the same `inkPx` rule); never more than this share of the lumen's radius on a hairline vein (so a thin vein's two lines never close up into one thick one). */
export const CLOT_INK_MAX_R = 0.5;
