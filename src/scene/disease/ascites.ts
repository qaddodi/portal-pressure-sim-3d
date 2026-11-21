// Ascites: the pool in the belly. The 2D figure fills the abdominal cavity (its wall bulges with the volume, anatomy.js abdomenOutline) up to a meniscus whose height follows the
// volume (fluid-step.js fluidLevel / fluidBase, both copied): none under 150 mL, fading in over the next 150, standing higher by volume^1.1, concave, the same on both sides.
// In 3D it is a translucent straw plate between the organs (z <= 0.26) and the vessels (z >= 0.30), cut to the cavity by columns, painted as 2D's fluidAt paints it (veins-gl.js): the
// look's own ink (--ascites at --ascites-a), more see-through at the surface (.55 of the ink) than deeper down (the whole ink by 28 units under it), and a thin pale meniscus on the surface
// (the ink 45 % toward white, gone by about 5 units down). One mesh; the straw is a program of its own (POOL_VS / POOL_FS) so the surface can live:
//   - the surface ripples as 2D's does (two sines, amplitude from the volume, the phase running with the blood's eased flow rate, so Pause stills it over half a second);
//   - "Living fluid" (Settings > Figure depth, on by default; off is 2D's hard-edged pool): the pool fades out over FEATHER units before the wall instead of ending in two ruler lines,
//     the surface climbs the wall a few units like water in a glass, a crisp pale line rides the surface, deep water is a richer amber, the surface sloshes a little while the level
//     moves (a damped swing driven by how fast it rises or falls, always back to calm), the water swells gently toward the viewer like a full belly (the dome), and a tilt down shows
//     the water's top (ascites-top.ts). There is no pale rim inside the wall: with the flank line and the feather it read as a second line on both sides (21 Nov).
// ONE BELLY (21 Nov): the pool, the flank line (landmarks.ts) and the tap test all lie on the gut's own plane, `bellyZ()`. They had a depth each (pool 0.28, flank -0.4), so on a turn the pool slid off its wall.
// Everything is a number the clock eases (the volume's spring, the flow rate, the living switch's own 0.45 s glide, the slosh's damping): nothing pops.
import { BackSide, BufferAttribute, BufferGeometry, DataTexture, DoubleSide, FloatType, Group, Mesh, NearestFilter, RedFormat, ShaderMaterial, Vector2, Vector3, type Raycaster } from 'three';
import { ABDOMEN_OUTLINES } from './copied/anatomy-b4.ts';
import { fluidBase, fluidLevel, poolFade } from './copied/fluid-step.js';
import { x3, y3, x2d, y2d } from '../frame2d.ts';
import { ORGAN_Z } from '../organs/z.ts';
import { AscitesTop } from './ascites-top.ts';
import { AscitesShell } from './ascites-shell.ts';
import { EDGE_STEPS, FLUID_COLS, LIVER_CUT_FS, LIVER_CUT_VS_DECL, LIVER_CUT_VS_MAIN, NO_LIVER, liverCut, liverEdgeTable, liverScaleOf } from './liver-edge.ts';
import type { LookId } from '../../looks/looks.ts';

/** The belly's one plane (scene units): the gut's own (organs/z.ts). The pool, the flank ribbon (landmarks.ts) and the tap test all lie on it, so they agree from every camera angle. The organ depth switch (Settings > Figure
 *  depth) changes the organs' shading only, never their z, so this does not move with it: pool and bowel stay on the same plane. */
export const bellyZ = (): number => ORGAN_Z.bowel!;
/** The water's swell toward the viewer (scene units) at its deepest, and the distance from the wall (2D units) over which it grows: an elliptic dome, 0 on the wall to the whole by DOME_R in. At a 14 degree lens
 *  the swell moves the head-on surface by at most about 1.3 CSS px (0.12 moved it 2.1 px at 800 mL, the lowest surface, so it is 0.075) (tests/ascites-basin.test.ts pins 1.5), so 2D's flat look is kept at rest. */
export const DOME = 0.075, DOME_R = 140;
/** The water is a closed body, not a sheet (Mohammad, 21 Nov: "not volumetric; it looks like a curtain"): the front face is the dome above (over the organs), a back face lies SHELL_BACK scene units behind the belly's plane
 *  (the bowel's; the kidney, spleen and the flank are all in front of it), the cavity wall joins them (ascites-shell.ts) and the surface is the lid (ascites-top.ts). The back face and the far walls are drawn BEFORE the organs,
 *  at SHELL_BACK_ORDER (after the flank's -1, before the heart's fill at 0), so the organs sit in the water; the front face, the near walls and the lid are drawn after them, as the pool always was. */
export const SHELL_BACK = 0.3, SHELL_BACK_ORDER = -0.5;
/** Each of the two layers a ray crosses through the body (back face, front face) takes this share of the alpha, so that the pair stacks to the one alpha 2D paints: (1 - h)^2 = 1 - a. */
export const shellHalf = (a: number): number => 1 - Math.sqrt(Math.max(0, 1 - a));
export const poolDome = (aW: number): number => { const w = Math.min(Math.max(aW / DOME_R, 0), 1); return Math.sqrt(Math.max(0, 1 - (1 - w) * (1 - w))); };
/** 2D paints the pool over the organ plate and the vessels (veins-gl.js fluidAt), so it is drawn after every organ and its ink (organs run to renderOrder 2 * 9 + 1) and ignores depth: the pool washes what lies in it, as in 2D. */
export const POOL_ORDER = 19;
/** The pool's ink in each look: tokens.css --ascites (the straw) and --ascites-a (its opacity at depth). Dark, Navy and Black share the dark block's; Soft has its own. */
export const ASCITES_INK: Readonly<Record<LookId, { hex: string; a: number }>> = {
  light: { hex: '#E0C677', a: 0.4 }, soft: { hex: '#DCB95E', a: 0.42 },
  dark: { hex: '#F0C67A', a: 0.24 }, navy: { hex: '#F0C67A', a: 0.24 }, black: { hex: '#F0C67A', a: 0.24 },
};
/** The ink while no look has been applied: Light's (stage.js fluidInkRGBA's default is the same straw). */
export const FLUID_RGBA = [0xE0 / 255, 0xC6 / 255, 0x77 / 255, 0.4] as const;
/** veins-gl.js fluidAt: the alpha at the surface is this share of the ink, rising to the whole of it by DEEP_AT units under; the meniscus is the ink MENISCUS toward white, with a falloff of exp(-d^2 / 10). */
export const SURFACE_SHARE = 0.55, DEEP_AT = 28, MENISCUS = 0.45, MENISCUS_FALL = 10;
/** The rows of each column, in 2D units under the surface: the meniscus's fall-off is three of them, the depth ramp the last. */
export const ROW_DEPTHS = [0, 2, 4.5, 8, 16, DEEP_AT] as const;
/** One more row than the depths: the last lies on the cavity's floor (the wall's lowest y in that column), so the pool is a basin from its surface down to the floor, as 2D's is, not a band 28 units thick. */
export const POOL_ROWS = ROW_DEPTHS.length + 1;
const ROWS = POOL_ROWS;
const X0 = 296, X1 = 1128, STEP = 8;
/** The pool's columns start at x = POOL_X0 (2D units) and are POOL_STEP apart. */
export const POOL_X0 = X0, POOL_STEP = STEP;
export const POOL_COLS = Math.floor((X1 - X0) / STEP) + 1;
const COLS = POOL_COLS;

/** The cavity's outline as a polygon in 2D units: anatomy.js writes it as M, L and C commands. */
export function outlinePolygon(d: string): [number, number][] {
  const t = d.match(/[MLCZ]|-?\d+(?:\.\d+)?/g)!;
  const out: [number, number][] = [];
  let i = 0, cur: [number, number] = [0, 0];
  while (i < t.length) {
    const c = t[i++]!;
    if (c === 'Z') break;
    if (c === 'M' || c === 'L') { cur = [+t[i]!, +t[i + 1]!]; i += 2; out.push(cur); }
    else if (c === 'C') {
      const a = [+t[i]!, +t[i + 1]!], b = [+t[i + 2]!, +t[i + 3]!], e: [number, number] = [+t[i + 4]!, +t[i + 5]!]; i += 6;
      for (let k = 1; k <= 16; k++) { const u = k / 16, v = 1 - u; out.push([v * v * v * cur[0] + 3 * v * v * u * a[0]! + 3 * v * u * u * b[0]! + u * u * u * e[0], v * v * v * cur[1] + 3 * v * v * u * a[1]! + 3 * v * u * u * b[1]! + u * u * u * e[1]]); }
      cur = e;
    }
  }
  return out;
}
const POLYS = new Map<number, [number, number][]>();
const polyOf = (step: number) => POLYS.get(step) ?? (POLYS.set(step, outlinePolygon(ABDOMEN_OUTLINES[step]!)), POLYS.get(step)!);

/** Where a vertical line at x crosses the polygon: its lowest and highest y (2D, y down), or null outside it. */
export function crossings(poly: readonly [number, number][], x: number): [number, number] | null {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xa, ya] = poly[j]!, [xb, yb] = poly[i]!;
    if ((xa <= x && x < xb) || (xb <= x && x < xa)) { const y = ya + ((x - xa) / (xb - xa)) * (yb - ya); lo = Math.min(lo, y); hi = Math.max(hi, y); }
  }
  return hi < lo ? null : [lo, hi];
}

/** The wall's bulge step (half units, 0..68) for a shown volume (stage-transitions.js drawAscites: u * 34, in halves). */
export const bulgeStep = (ml: number): number => Math.round(Math.min(1, Math.max(0, ml / 8500)) * 34 * 2);

/** The colour and alpha of the fluid `d` 2D units under its surface (veins-gl.js fluidAt, straight alpha): `ink` rgb 0..1 and its opacity `a` at depth. */
export function fluidTone(ink: readonly [number, number, number], a: number, d: number): [number, number, number, number] {
  const t = Math.min(1, Math.max(0, d / DEEP_AT)), ramp = t * t * (3 - 2 * t);
  const men = Math.exp(-(d * d) / MENISCUS_FALL), k = MENISCUS * men;
  return [ink[0] + (1 - ink[0]) * k, ink[1] + (1 - ink[1]) * k, ink[2] + (1 - ink[2]) * k, Math.min(1, a * (SURFACE_SHARE + (1 - SURFACE_SHARE) * ramp))];
}
const hexTo01 = (hex: string): [number, number, number] => { const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };


// ---- Living fluid: the numbers, once (the shader below is written from them, and `poolLift` is the same sum in JS for the tests) ----
// SIZES ARE SCREEN PIXELS, not 2D units (the 3D pool's first pass set them in 2D units and nothing read on an iPhone: the figure is about 0.6 CSS px per unit there, so a 2-unit
// ripple, a 2-unit pale line and a 4-unit climb were each about a pixel, owner's phone shot of 20 Nov: "a flat muddy wash"). The vertex shader finds the pixels per 2D unit where it
// is drawn (`pxu`, from the projection and the canvas height in CSS px) and converts, so the effects are the same weight on every screen and figure size.
/** CSS px from the wall over which the pool fades out, and over which the surface's ripple is rested against the wall. */
export const FEATHER_PX = 22, RIPPLE_REST_PX = 30;
/** The surface climbs the wall by CLIMB_PX at the wall, falling off by exp(-distance / CLIMB_FALL_PX); only the top RIPPLE_DEPTH 2D units of the water move with the surface. */
export const CLIMB_PX = 7, CLIMB_FALL_PX = 9, RIPPLE_DEPTH = 16;
/** The ripple's crest-to-mean at 2D's full amplitude (2 units): never less than 2D's own units, and at least this many CSS px (so it reads on a phone). */
export const RIPPLE_PX = 3.5, RIPPLE_AMP2D = 2;
/** The crisp pale line on the surface: full to LINE_FROM_PX under it, gone by LINE_TO_PX, LINE_K toward white (a cel line over 2D's soft meniscus); and a soft sheen, SHEEN_K toward white, fading over the top SHEEN_PX: the water's glassy top. */
export const LINE_FROM_PX = 1.4, LINE_TO_PX = 3.2, LINE_K = 0.55, SHEEN_PX = 34, SHEEN_K = 0.2;
/** Deep water is richer: from RICH_FROM to RICH_TO 2D units under the surface the straw turns RICH_K of the way to its saturated self (x RICH_SAT, at the same value: no darker, no muddier). Alpha does not grow, so labels under it stay readable. */
export const RICH_FROM = 40, RICH_TO = 190, RICH_K = 0.85, RICH_SAT = 1.8, RICH_VAL = 1;
/** The slosh: the swing's own frequency (rad/s) and damping ratio, the tilt per unit of level speed (2D units per 2D unit/s), and the most the surface tilts at a wall (2D units, scaled up on a small figure like the ripple). */
export const SLOSH_W = 4.8, SLOSH_ZETA = 0.28, SLOSH_GAIN = 0.025, SLOSH_MAX = 6;
/** 2D's ripple clock: the phase advances dt / 1.1 s at the full flow rate (stage-transitions.js), over 20 pi. */
export const RIPPLE_PERIOD = 1.1, RIPPLE_WRAP = 20 * Math.PI;
/** The Living fluid switch glides over this many seconds (a smoothed exponential: it never snaps). */
export const LIVING_TAU = 0.15;
/** One 2D unit in CSS px at the figure's own scale 1 (1400 units over ~1400 px): the floor of the boost below. */
export const PXU_FLOOR = 1;

const ss = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
/** How much the ripple and the slosh are enlarged where a 2D unit is under a pixel: RIPPLE_PX over the pixels of 2D's own full amplitude, from 1 (a big figure) to 5. */
export const rippleBoost = (pxu: number): number => Math.min(5, Math.max(1, RIPPLE_PX / (RIPPLE_AMP2D * Math.max(pxu, 1e-3))));

/** How far the water at a vertex is lifted (2D units, up is positive): 2D's two-sine ripple (rested near a wall when living, and enlarged on a small figure), the climb up the wall and the slosh's tilt, on the top RIPPLE_DEPTH units only. `pxu` is CSS px per 2D unit where it is drawn. The vertex shader sums the same terms. */
export function poolLift(v: { wx: number; aW: number; aD: number; phase: number; amp: number; slosh: number; living: number; pxu?: number }): number {
  const pxu = v.pxu ?? 1, boost = 1 + (rippleBoost(pxu) - 1) * v.living;
  const ripple = (Math.sin(v.wx / 38 + v.phase) * 0.7 + Math.sin(v.wx / 23 - v.phase * 1.3) * 0.3) * v.amp * boost;
  const rest = 1 + (ss(0, RIPPLE_REST_PX / pxu, v.aW) - 1) * v.living;
  const climb = (CLIMB_PX / pxu) * Math.exp(-v.aW / (CLIMB_FALL_PX / pxu));
  const tilt = Math.min(1, Math.max(-1, (v.wx - 712) / 400)) * v.slosh * rippleBoost(pxu);
  return (ripple * rest + v.living * (climb + tilt)) * (1 - ss(0, RIPPLE_DEPTH, v.aD));
}

/** The slosh's swing: a damped spring on the tilt, driven by the level's speed. `s.x` is the tilt at the walls (2D units), `s.v` its rate; `rate` is the level's speed (2D units/s, up positive). Semi-implicit steps of at most 20 ms keep it stable. */
export interface Slosh { x: number; v: number }
export function sloshStep(s: Slosh, rate: number, dt: number, scale = 1): Slosh {
  let left = Math.min(0.1, Math.max(0, dt));
  while (left > 1e-9) {
    const h = Math.min(0.02, left); left -= h;
    s.v += (-SLOSH_W * SLOSH_W * (s.x - SLOSH_GAIN * rate * scale) - 2 * SLOSH_ZETA * SLOSH_W * s.v) * h;
    s.x += s.v * h;
  }
  s.x = Math.min(SLOSH_MAX, Math.max(-SLOSH_MAX, s.x));
  if (Math.abs(s.x) < 0.004 && Math.abs(s.v) < 0.004 && Math.abs(rate) < 1e-3) { s.x = 0; s.v = 0; }
  return s;
}

/** The distance (2D units) from a point to the cavity's wall: the outline's open polyline (its two sides and its floor, not the open top). */
export function wallDistance(poly: readonly [number, number][], x: number, y: number): number {
  let best = Infinity;
  for (let i = 1; i < poly.length; i++) {
    const [xa, ya] = poly[i - 1]!, [xb, yb] = poly[i]!;
    const dx = xb - xa, dy = yb - ya, l2 = dx * dx + dy * dy;
    const t = l2 > 0 ? Math.min(1, Math.max(0, ((x - xa) * dx + (y - ya) * dy) / l2)) : 0;
    best = Math.min(best, Math.hypot(x - (xa + t * dx), y - (ya + t * dy)));
  }
  return best;
}

export const f = (n: number): string => { const t = String(Number(n.toFixed(4))); return /[.e]/.test(t) ? t : `${t}.0`; };
/** The lift of the water and the dome, once, for the pool and the water's top (ascites-top.ts): the same sums as `poolLift` and `poolDome` in JS. Needs `uPhase`, `uAmp`, `uSlosh`, `uLiving`, `uRes`. */
export const POOL_COMMON_GLSL = /* glsl */ `
uniform float uPhase;
uniform float uAmp;
uniform float uSlosh;
uniform float uLiving;
uniform vec2 uRes;
// CSS px per 2D unit where p is drawn (the projection's scale, the canvas height in CSS px, the depth, 300 units to a scene unit)
float poolPxu(vec3 p) {
  vec4 c0 = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  return projectionMatrix[1][1] * uRes.y * 0.5 / max(c0.w, 1e-3) / 300.0;
}
// how far the water at world x (2D units) is lifted (2D units, up positive): the ripple, the climb up the wall and the slosh's tilt, on the top ${RIPPLE_DEPTH} units only
float poolLift(float wx, float aW, float aD, float pxu) {
  float boost = clamp(${f(RIPPLE_PX)} / (${f(RIPPLE_AMP2D)} * max(pxu, 1e-3)), 1.0, 5.0);
  float ripple = (sin(wx / 38.0 + uPhase) * 0.7 + sin(wx / 23.0 - uPhase * 1.3) * 0.3) * uAmp * mix(1.0, boost, uLiving);
  float rest = mix(1.0, smoothstep(0.0, ${f(RIPPLE_REST_PX)} / pxu, aW), uLiving);
  float climb = ${f(CLIMB_PX)} / pxu * exp(-aW * pxu / ${f(CLIMB_FALL_PX)});
  float tilt = clamp((wx - 712.0) / 400.0, -1.0, 1.0) * uSlosh * boost;
  return (ripple * rest + uLiving * (climb + tilt)) * (1.0 - smoothstep(0.0, ${f(RIPPLE_DEPTH)}, aD));
}
// the swell toward the viewer, in scene units: 0 on the wall, ${DOME} by ${DOME_R} units in (elliptic); the Living switch glides it
float poolSwell(float aW) {
  float w = min(aW / ${f(DOME_R)}, 1.0);
  return uLiving * ${f(DOME)} * sqrt(max(1.0 - (1.0 - w) * (1.0 - w), 0.0));
}
`;
/** The pool's program: one mesh, the depth under its own surface (aD) and the distance to the wall (aW) per vertex; the straw, its opacity, the ripple's phase and amplitude, the slosh and the living share are uniforms. */
export const POOL_VS = /* glsl */ `
attribute float aD;
attribute float aW;
${POOL_COMMON_GLSL}
varying float vD;
varying float vW;
varying float vPxu;
${LIVER_CUT_VS_DECL}
void main() {
  float pxu = poolPxu(position);
  float wx = position.x * 300.0 + 700.0;
  vec3 p = position;
  p.y += poolLift(wx, aW, aD, pxu) / 300.0;
#if defined(POOL_BACK) || defined(POOL_WALL)
  // the body's back face and its walls: no swell (the walls carry their own depth), and the back face lies SHELL_BACK behind the belly's plane
#ifdef POOL_BACK
  p.z -= ${f(SHELL_BACK)};
#endif
#else
  p.z += poolSwell(aW);   // (the vertex lies on the belly's plane, bellyZ; the swell is from the wall distance, so the wall stays exactly on the wall line)
#endif
  vD = aD;
  vW = aW;
  vPxu = pxu;
  ${LIVER_CUT_VS_MAIN}
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
/** The pool's colour and alpha at a point, as a chunk the hull's program (ascites-hull-glsl.ts) shares: `poolBase(d, lineD, lineW)` writes gl_FragColor as 2D's fluidAt with the Living sheen, the crisp line, the rich amber, the wall feather and the liver cut.
 *  `d` is the depth under the surface (2D units: tone, alpha, richness), `lineD` the distance the sheen and the line fall off over (2D units: the same as `d` on the pool), `lineW` how much of the sheen and line shows (1 on the pool). */
export const POOL_BASE_GLSL = /* glsl */ `
${LIVER_CUT_FS}
uniform vec3 uInk;
uniform float uInkA;
uniform float uOpacity;
uniform float uLiving;
varying float vD;
varying float vW;
varying float vPxu;
void poolBase(float d, float lineD, float lineW) {
  float px = lineD * vPxu;   // distance from the line's edge in CSS px
  // 2D's fluidAt: ${SURFACE_SHARE} of the ink at the surface, the whole of it by ${DEEP_AT} units under, a soft pale meniscus
  float a = uInkA * (${f(SURFACE_SHARE)} + ${f(1 - SURFACE_SHARE)} * smoothstep(0.0, ${f(DEEP_AT)}, d));
  vec3 c = mix(uInk, mix(uInk, vec3(1.0), ${f(MENISCUS)}), exp(-d * d / ${f(MENISCUS_FALL)}));
  // Living fluid: a glassy sheen over the top of the water and a crisp pale line on the surface (both in px), richer amber far under it, and the edge fading out over the last ${FEATHER_PX} px
  c = mix(c, vec3(1.0), ${f(SHEEN_K)} * (1.0 - smoothstep(0.0, ${f(SHEEN_PX)}, px)) * uLiving * lineW);
  c = mix(c, vec3(1.0), ${f(LINE_K)} * (1.0 - smoothstep(${f(LINE_FROM_PX)}, ${f(LINE_TO_PX)}, px)) * uLiving * lineW);
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  vec3 rich = clamp(vec3(lum) + (c - vec3(lum)) * ${f(RICH_SAT)}, 0.0, 1.0) * ${f(RICH_VAL)};
  c = mix(c, rich, ${f(RICH_K)} * smoothstep(${f(RICH_FROM)}, ${f(RICH_TO)}, d) * uLiving);
  float wpx = vW * vPxu;
#ifdef POOL_WALL
  float edge = 1.0;   // (the cavity wall is the body's side: it does not fade out at itself)
#else
  float edge = mix(1.0, smoothstep(0.0, ${f(FEATHER_PX)}, wpx), uLiving);
#endif
  gl_FragColor = vec4(c, min(1.0, a * edge) * uOpacity);
  // 2D's liver cut (veins-gl.js fluidAt): the straw is kept off a congested liver, above its lower edge
  gl_FragColor.a *= liverKeep(vW2d, 1.0 / max(vPxu, 1e-3));
}`;
export const POOL_FS = /* glsl */ `
precision highp float;
${POOL_BASE_GLSL}
void main() {
  float d = max(vD, 0.0);
  poolBase(d, d, 1.0);
  // the body: a ray crosses two layers (back, front), each takes the half of the alpha that stacks to 2D's one (shellHalf); the front glides from the whole to the half with the living switch, the back parts glide in from nothing
  float halfA = 1.0 - sqrt(max(1.0 - gl_FragColor.a, 0.0));
#if defined(POOL_BACK) || defined(POOL_WALL)
  gl_FragColor.a = halfA * uLiving;
#else
  gl_FragColor.a = mix(gl_FragColor.a, halfA, uLiving);
#endif
}`;

export class AscitesLayer {
  readonly group = new Group();
  private fill: Mesh;
  private readonly top: AscitesTop;
  private readonly shell: AscitesShell;
  private pf = new Float32Array(COLS * ROWS * 3); private aD = new Float32Array(COLS * ROWS); private aW = new Float32Array(COLS * ROWS);
  private lastH = NaN; private lastStep = -1;
  private body = 1; private poolA = 0;
  private ink = new Vector3(FLUID_RGBA[0], FLUID_RGBA[1], FLUID_RGBA[2]);
  private readonly uniforms = {
    uInk: { value: this.ink }, uInkA: { value: FLUID_RGBA[3] as number }, uOpacity: { value: 0 },
    uPhase: { value: 0 }, uAmp: { value: 0 }, uSlosh: { value: 0 }, uLiving: { value: 1 },
    uRes: { value: new Vector2(1, 1) } as { value: Vector2 },
    // the liver's lower edge (one number per column across 2D's fluid rectangle), how far the straw is kept off it, and the liver's drawn scale: set by `setLiver`
    uLiverEdge: { value: null as unknown as DataTexture }, uLiverCut: { value: 0 }, uLiverScale: { value: 1 },
  };
  private readonly edge = new Float32Array(FLUID_COLS).fill(NO_LIVER);
  private edgeKey = '';
  /** What the organs are dimmed to apart from the lens's grey (2D: the selection's and a slide spotlight's dim; the Circuit's change is `body`): the organs' own eased value, handed over each frame. */
  private dim = 1;
  /** The pool's level in 2D units at the middle of the belly (x 712), for the tests and the labels; null while there is no pool. */
  surface: number | null = null;
  /** Reduce Motion: the surface holds still (no ripple, no slosh); the soft edges are still. */
  still = false;
  private livingGoal = 1; private phase = 0;
  private readonly swing: Slosh = { x: 0, v: 0 };
  private levelNow = 0; private levelWas = NaN; private amp = 0;
  constructor() {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pf, 3));   // (BufferAttribute keeps the array: Float32BufferAttribute copies it, and the columns written to `pf` never reached the geometry, which stayed at zeros: the pool was never drawn)
    g.setAttribute('aD', new BufferAttribute(this.aD, 1));
    g.setAttribute('aW', new BufferAttribute(this.aW, 1));
    const idx: number[] = [];
    for (let c = 0; c < COLS - 1; c++) for (let r = 0; r < ROWS - 1; r++) { const a = c * ROWS + r, b = a + ROWS; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    g.setIndex(idx);
    // (the colours are written as the figure's own numbers, the way materials/cel.ts rawColor does: the picture goes through the anti-aliasing pass as it is)
    const tex = new DataTexture(this.edge, FLUID_COLS, 1, RedFormat, FloatType);
    tex.minFilter = tex.magFilter = NearestFilter; tex.needsUpdate = true;
    this.uniforms.uLiverEdge.value = tex;
    const mat = new ShaderMaterial({ name: 'pool', vertexShader: POOL_VS, fragmentShader: POOL_FS, uniforms: this.uniforms, transparent: true, depthWrite: false, depthTest: false });
    const m = new Mesh(g, mat);
    m.renderOrder = POOL_ORDER; m.frustumCulled = false; m.visible = false;
    this.group.add(m);
    this.fill = m;
    this.top = new AscitesTop(this.uniforms);   // (the water's top: its own mesh, the same uniforms, so the ripple, the living switch, the fade and the ink are the pool's)
    this.group.add(this.top.mesh);
    this.shell = new AscitesShell(this.uniforms, g);   // (the body's back face and walls: the pool's own geometry again, and a ribbon along the wall; the same uniforms)
    for (const sm of this.shell.meshes) this.group.add(sm);
  }
  /** The canvas size in CSS px (the scene's shared `res`): the pool's sizes are pixels, so its program needs the screen's. */
  bindRes(res: { value: Vector2 }): void { this.uniforms.uRes = res; }
  /** The look's straw (tokens.css --ascites, --ascites-a): two uniforms, nothing is laid again. */
  applyLook(look: LookId): void {
    const k = ASCITES_INK[look], c = hexTo01(k.hex);
    this.ink.set(c[0], c[1], c[2]); this.uniforms.uInkA.value = k.a;
  }
  /** Settings > Figure depth > Living fluid. It glides (step), unless `instant` (the first read at boot). */
  setLiving(on: boolean, instant = false): void { this.livingGoal = on ? 1 : 0; if (instant) this.uniforms.uLiving.value = this.livingGoal; }
  get living(): number { return this.uniforms.uLiving.value; }
  /** The body's dissolve (disease/index.ts setFade): the pool lies in the belly, so it fades with the anatomy. */
  setFade(f: number): void { this.body = f; this.apply(); }
  /** The organs' dim (their selection and spotlight dim, already eased by the organs' own clock: no second timer here): the pool is never brighter than the belly it lies in (2D stage-transitions.js stepFluid). */
  setDim(k: number): void { if (k !== this.dim) { this.dim = k; this.apply(); } }
  /** The liver's shown cirrhosis and congestion (the organs' eased values): the straw is kept off the liver by 2D's cut, smooth01(congestion / 0.5), above the liver's lower edge in its drawn frame. True when the edge changed. */
  setLiver(cirrhosis: number, congestion: number): boolean {
    const u = this.uniforms, cut = liverCut(congestion);
    u.uLiverCut.value = cut; u.uLiverScale.value = liverScaleOf(cirrhosis, congestion);
    if (!(cut > 0)) return false;
    const key = `${Math.round(Math.min(1, Math.max(0, cirrhosis)) * EDGE_STEPS)},${Math.round(Math.min(1, Math.max(0, congestion)) * EDGE_STEPS)}`;
    if (key === this.edgeKey) return false;
    this.edgeKey = key;
    liverEdgeTable(cirrhosis, congestion, this.edge); u.uLiverEdge.value.needsUpdate = true;
    return true;
  }
  private apply(): void {
    this.fill.visible = this.poolA > 0 && this.body > 0.001 && this.dim > 0.001;
    this.top.mesh.visible = this.fill.visible;
    this.syncShell();
    this.uniforms.uOpacity.value = this.poolA * this.body * this.dim;
  }
  /** The back face and the walls are drawn while there is water and the living switch is not fully off (off is 2D's flat pool: nothing behind it). */
  private syncShell(): void { this.shell.show(this.fill.visible && this.uniforms.uLiving.value > 0.002); }
  /** One frame on the clock: the ripple's phase runs with the eased flow rate (0 paused .. 1), the slosh swings with the level's speed, the living switch glides. True while any of it still moves (the clock draws another frame). */
  step(dt: number, flowRate: number): boolean {
    const u = this.uniforms, shown = this.fill.visible;
    const gl = this.livingGoal - u.uLiving.value;
    if (gl !== 0) { u.uLiving.value = Math.abs(gl) < 0.002 ? this.livingGoal : u.uLiving.value + gl * -Math.expm1(-dt / LIVING_TAU); }
    let moving = gl !== 0;
    if (gl !== 0) this.syncShell();
    if (!shown) { this.levelWas = NaN; return moving; }
    const calm = this.still;
    // the ripple: 2D's phase, advanced by the eased flow rate (a pause settles it over the flow's own half second)
    if (!calm && flowRate > 0.001) { this.phase = (this.phase + (dt / RIPPLE_PERIOD) * flowRate) % RIPPLE_WRAP; moving = true; }
    u.uPhase.value = this.phase;
    u.uAmp.value = calm ? 0 : this.amp;
    // the slosh: the level's speed (2D units/s) swings the surface; scaled by the pool's depth so a first film does not tilt
    const rise = Number.isFinite(this.levelWas) && dt > 0 ? (this.levelWas - this.levelNow) / dt : 0;
    this.levelWas = this.levelNow;
    if (calm) { this.swing.x = this.swing.v = 0; }
    else { sloshStep(this.swing, rise, dt, Math.min(1, this.levelH / 60)); if (this.swing.x !== 0 || this.swing.v !== 0) moving = true; }
    u.uSlosh.value = this.swing.x;
    return moving;
  }
  private levelH = 0;
  /** The wall's bulge in 2D units shown now (the bowel floats up with it: bowel group moves by 26/34 of it). */
  bulge = 0;
  private lastMl = 0;
  /** `ml` is the shown (sprung) volume. Returns true when the picture changed. */
  set(ml: number): boolean {
    this.lastMl = ml;
    const fade = poolFade(ml), step = bulgeStep(ml);
    this.bulge = step / 2;
    const { h, amp } = fluidLevel(ml);
    this.amp = amp; this.levelH = h;
    const show = fade > 0;
    this.poolA = fade; this.apply();
    if (!show) { this.surface = null; return false; }
    this.surface = fluidBase(712, h);
    this.levelNow = this.surface;
    if (Math.abs(h - this.lastH) < 0.25 && step === this.lastStep) return false;
    this.lastH = h; this.lastStep = step;
    const poly = polyOf(step);
    // the surface and floor of each column; a column outside the cavity takes its nearest neighbour's surface and has no depth (its rows meet: nothing is drawn, and no sliver runs up to the top of the figure)
    const tops = new Float64Array(COLS), bots = new Float64Array(COLS), inside = new Uint8Array(COLS);
    for (let c = 0; c < COLS; c++) {
      const x = X0 + c * STEP, cr = crossings(poly, x);
      if (cr) { let top = Math.max(fluidBase(x, h), cr[0]); const bot = cr[1]; if (top > bot) top = bot; tops[c] = top; bots[c] = bot; inside[c] = 1; }
    }
    for (let c = 0; c < COLS; c++) {
      if (inside[c]) continue;
      let n = -1;
      for (let k = 1; k < COLS && n < 0; k++) { if (c - k >= 0 && inside[c - k]) n = c - k; else if (c + k < COLS && inside[c + k]) n = c + k; }
      tops[c] = bots[c] = n < 0 ? 0 : tops[n]!;
    }
    const topW = new Float32Array(COLS), depthH = new Float32Array(COLS);
    for (let c = 0; c < COLS; c++) {
      const x = X0 + c * STEP, px = x3(x), z = bellyZ(), top = tops[c]!, bot = bots[c]!;
      for (let r = 0; r < ROWS; r++) {
        const d = r < ROW_DEPTHS.length ? Math.min(ROW_DEPTHS[r]!, bot - top) : bot - top, v = c * ROWS + r;
        this.pf[v * 3] = px; this.pf[v * 3 + 1] = y3(top + d); this.pf[v * 3 + 2] = z;
        this.aD[v] = d;
        // (a column outside the cavity has no wall to be near: its water is none)
        this.aW[v] = inside[c] ? wallDistance(poly, x, top + d) : 0;
      }
      topW[c] = this.aW[c * ROWS]!; depthH[c] = bot - top;
    }
    this.top.lay(tops, topW, depthH);
    this.fill.geometry.boundingSphere = null;
    { let ymin = Infinity; for (const q of poly) ymin = Math.min(ymin, q[1]); this.shell.lay(poly, (x) => Math.max(fluidBase(x, h), ymin)); }   // (the walls, from the cavity's outline under the same surface)
    for (const n of ['position', 'aD', 'aW']) (this.fill.geometry.getAttribute(n) as BufferAttribute).needsUpdate = true;
    return true;
  }
  /** Whether a 2D point is in the pool: inside the belly's wall and below the surface (2D stage-hover.js organAt: `wy > fluidSurf(wx)` inside the abdomen). False while there is none. */
  holds(x: number, y: number): boolean {
    if (this.poolA <= 0 || this.body < 0.5 || !Number.isFinite(this.lastH)) return false;
    const cr = crossings(polyOf(this.lastStep), x);
    return !!cr && y <= cr[1] && y > Math.max(fluidBase(x, this.lastH), cr[0]);
  }
  /** What a tap hits: the drawn pool or its top, by a ray (the tap test used its own flat plane, at a depth of its own). The shader adds the swell on the GPU, so the CPU copy is lifted by the same numbers
   *  (the living share shown now) for the cast and put back; the ripple's lift is ignored. Returns the hit's 2D x when it lies in the water (`holds`), else null. */
  pick(raycaster: Raycaster): { x: number; y: number } | null {
    if (!this.fill.visible) return null;
    const live = this.uniforms.uLiving.value, z0 = bellyZ();
    const pz = (this.fill.geometry.getAttribute('position') as BufferAttribute).array as Float32Array;
    for (let v = 0; v < this.aW.length; v++) pz[v * 3 + 2] = z0 + live * DOME * poolDome(this.aW[v]!);
    this.fill.geometry.boundingSphere = null;
    this.top.swell(live);
    const hit = raycaster.intersectObjects([this.fill, this.top.mesh], false)[0];
    for (let v = 0; v < this.aW.length; v++) pz[v * 3 + 2] = z0;
    this.fill.geometry.boundingSphere = null;
    this.top.swell(0);
    if (!hit) return null;
    const x = x2d(hit.point.x), y = y2d(hit.point.y) + (hit.object === this.top.mesh ? 0.5 : 0);   // (the top lies on the surface: a hair into the water)
    return this.holds(x, y) ? { x, y } : null;
  }
  dispose(): void { this.fill.geometry.dispose(); (this.fill.material as ShaderMaterial).dispose(); this.top.dispose(); this.shell.dispose(); }
}
