// The ascites pool's shared pieces (21 Nov 2026): the numbers, 2D's fluidAt tone, the cavity polygon, the ripple/slosh sums and the GLSL chunks the hull's program (ascites-hull-glsl.ts) is built from.
// Split from ascites.ts (which re-exports all of it) so that the hull's files and the layer do not import each other: ascites.ts imports the hull, the hull imports this.
import { ABDOMEN_OUTLINES } from './copied/anatomy-b4.ts';
import { LIVER_CUT_FS } from './liver-edge.ts';
import type { LookId } from '../../looks/looks.ts';
import { overrides } from '../../editor/store.ts';
import { wallFollow } from '../editor-anchors.ts';

/** 2D paints the pool over the organ plate and the vessels (veins-gl.js fluidAt), so it is drawn after every organ and its ink (organs run to renderOrder 2 * 9 + 1) and ignores depth: the pool washes what lies in it, as in 2D. */
/** GLSL chunks only (POOL_COMMON_GLSL, POOL_BASE_GLSL): the program that uses them is the hull's (ascites-hull-glsl.ts GL_PROGRAMS). */
export const GL_ON_SCENE_GRAPH = 'chunks spliced into the ascites hull program (ascites-hull-glsl.ts)';
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
/** The belly's own curve (review a56feaf2, item 5, Mohammad 23 Nov: "Reshape to a belly curve"). 2D's wall runs from the waist (y 470) to the lower belly (y 954) as a near-straight diagonal, and with the flat
 *  surface on top the 3D water read as a straight-sided tub. Each flank point is pushed OUTWARD by a half sine of its height, so the flank leaves the waist straight down, bulges at mid height and rolls into the
 *  floor with the floor's own slope; the waist, the lower belly and the floor are 2D's own points (nothing moves inward, so no organ is left outside the wall). `BELLY` is the push as a share of the flank's inset
 *  (336 to 434 at rest): a belly already bowed by its volume (the bulge steps) needs less, and the inset is what that bow takes away. */
export const BELLY = { top: 470, foot: 954, share: 0.36 } as const;
export function bellyPolygon(poly: readonly (readonly [number, number])[]): [number, number][] {
  let inset = 0; for (const q of poly) if (q[1] >= BELLY.foot - 1e-6 && q[1] <= BELLY.foot + 1e-6 && q[0] < 712) inset = Math.max(inset, q[0] - 336);
  const a = BELLY.share * inset;
  const bowed = poly.map(([x, y]): [number, number] => {
    if (!(y > BELLY.top && y < BELLY.foot)) return [x, y];
    const push = a * Math.sin(Math.PI * (y - BELLY.top) / (BELLY.foot - BELLY.top));
    return [x < 712 ? x - push : x + push, y];
  });
  return roundedFoot(bowed);
}
/** The lower belly (Mohammad, 24 Nov, on the first litre: "the bottom of the ascites looks as if it is pointing, as if it will not include the colon; even in the beginning it should head a little outward").
 *  Root cause: 2D's wall keeps closing in all the way down (about 26 degrees from vertical at its lower belly, y 954, and then 2D's floor curve turns in at 29 degrees and flattens), so a pool standing low in it
 *  has walls that lean in 63 degrees at 0.3 L, 39 at 1 L and 27 at 1.5 L: a thin lens whose two tips point sideways, with the colon (x 416 to 424 down to y 920) left outside it. From FOOT_FROM down the wall now eases out of
 *  the bow's own slope to a vertical tangent at FOOT_Y (a little outward of 2D's own wall there) and then rounds into 2D's floor bottom (712, 1041.5) with a vertical-to-horizontal curve, so a low pool is a rounded basin
 *  with upright sides that the water climbs outward, never a wedge. Above FOOT_FROM nothing moves, so a fuller belly (waterline above y 760, from about 5 L) is exactly what it was. */
export const FOOT = { from: 760, y: 962, endSlope: 0.15, floorDown: 0.55, floorAcross: 0.5 } as const;
const AXIS = 712;
function roundedFoot(bowed: [number, number][]): [number, number][] {
  // the left flank, top to bottom: the points left of the axis (2D's outline runs top left, down the left wall and floor, up the right wall)
  let iA = -1, iM = -1, bottom = -Infinity;
  for (let i = 0; i < bowed.length; i++) {
    const [x, y] = bowed[i]!;
    if (iA < 0 && x < AXIS && y >= FOOT.from) iA = i;
    if (y > bottom) { bottom = y; iM = i; }
  }
  if (iA < 1 || iM <= iA || bottom < FOOT.y + 20) return bowed;
  const floorY = bottom;   // 2D's floor curve reaches y 1041.5 at the axis (its control points sit at 1072, the curve does not)
  const sideOf = (pts: readonly [number, number][], i0: number): { x0: number; sx: number } => {
    const a = pts[i0 - 1]!, b = pts[i0]!, t = (FOOT.from - a[1]) / (b[1] - a[1]);
    const x0 = a[0] + (b[0] - a[0]) * t, c = pts[Math.min(pts.length - 1, i0 + 1)]!, sx = (c[0] - a[0]) / (c[1] - a[1]);
    return { x0, sx };
  };
  const left = sideOf(bowed, iA);
  // the right flank is read the same way mirrored about the axis, so the two sides are built by the one routine
  const mir = bowed.map(([x, y]): [number, number] => [2 * AXIS - x, y]);
  let jA = -1; for (let i = 0; i < bowed.length; i++) { const [x, y] = bowed[i]!; if (x > AXIS && y >= FOOT.from) jA = i; }
  if (jA < 0) return bowed;
  const rev = mir.slice().reverse();   // mirrored right flank, now top to bottom
  const iR = rev.findIndex(([x, y]) => x < AXIS && y >= FOOT.from);
  const right = sideOf(rev, iR);
  const curve = (x0: number, sx: number): [number, number][] => {
    const dy = FOOT.y - FOOT.from, xB = x0 + 0.5 * (sx + FOOT.endSlope) * dy, h = 0.4 * dy, out: [number, number][] = [];
    const P = (u: number, a: readonly [number, number], b: readonly [number, number], c: readonly [number, number], d: readonly [number, number]): [number, number] => {
      const v = 1 - u; return [v * v * v * a[0] + 3 * v * v * u * b[0] + 3 * v * u * u * c[0] + u * u * u * d[0], v * v * v * a[1] + 3 * v * v * u * b[1] + 3 * v * u * u * c[1] + u * u * u * d[1]];
    };
    const A: [number, number] = [x0, FOOT.from], B: [number, number] = [xB, FOOT.y], Z: [number, number] = [AXIS, floorY];
    for (let k = 0; k < 12; k++) out.push(P(k / 12, A, [x0 + sx * h, FOOT.from + h], [xB - FOOT.endSlope * h, FOOT.y - h], B));
    const fd = (floorY - FOOT.y) * FOOT.floorDown, fa = (AXIS - xB) * FOOT.floorAcross;
    for (let k = 0; k <= 16; k++) out.push(P(k / 16, B, [xB + FOOT.endSlope * fd, FOOT.y + fd], [AXIS - fa, floorY], Z));
    return out;
  };
  const L = curve(left.x0, left.sx), Rm = curve(right.x0, right.sx);
  const out: [number, number][] = bowed.slice(0, iA);
  out.push(...L);
  for (let k = Rm.length - 2; k >= 0; k--) out.push([2 * AXIS - Rm[k]![0], Rm[k]![1]]);
  for (let i = jA + 1; i < bowed.length; i++) out.push(bowed[i]!);
  return out;
}
const POLYS = new Map<number, [number, number][]>();
/** The cavity at a bulge step: 2D's wall, bowed, and (once an organ that bounds it is edited) carried by those organs (editor-anchors.ts wallFollow). Unedited it is exactly the bowed polygon. */
let polysFor: unknown = null;
export const polyOf = (step: number) => {
  if (polysFor !== overrides()) { polysFor = overrides(); POLYS.clear(); }
  return POLYS.get(step) ?? (POLYS.set(step, bellyPolygon(outlinePolygon(ABDOMEN_OUTLINES[step]!)).map((q) => wallFollow(q) as [number, number])), POLYS.get(step)!);
};

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
export const hexTo01 = (hex: string): [number, number, number] => { const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };


// ---- Living fluid: the numbers, once (the shader below is written from them, and `poolLift` is the same sum in JS for the tests) ----
// SIZES ARE SCREEN PIXELS, not 2D units (the 3D pool's first pass set them in 2D units and nothing read on an iPhone: the figure is about 0.6 CSS px per unit there, so a 2-unit
// ripple, a 2-unit pale line and a 4-unit climb were each about a pixel, owner's phone shot of 20 Nov: "a flat muddy wash"). The vertex shader finds the pixels per 2D unit where it
// is drawn (`pxu`, from the projection and the canvas height in CSS px) and converts, so the effects are the same weight on every screen and figure size.
/** CSS px from the wall over which the pool fades out (22 until 21 Nov: a soft glow with no edge, and the water missing along the flanks where the colon lies; now just an anti-aliased edge, the ink line is the hull's: ascites-hull-glsl.ts OUTLINE_PX), and over which the surface's ripple is rested against the wall. */
export const FEATHER_PX = 2, RIPPLE_REST_PX = 30;
/** The surface climbs the wall by CLIMB_PX at the wall, falling off by exp(-distance / CLIMB_FALL_PX); only the top RIPPLE_DEPTH 2D units of the water move with the surface. */
export const CLIMB_PX = 20, CLIMB_FALL_PX = 28, RIPPLE_DEPTH = 16;
/** The surface sags a little between its two walls: SAG_PX at the middle, none at a wall, easing in over SAG_FALL_PX from it (Mohammad, 23 Nov: mock C, "soft meniscus + faint sag"; docs/approved/ascites-surface.md). */
export const SAG_PX = 5, SAG_FALL_PX = 90;
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
  const climb = (CLIMB_PX / pxu) * Math.exp(-v.aW / (CLIMB_FALL_PX / pxu)) - (SAG_PX / pxu) * ss(0, SAG_FALL_PX / pxu, v.aW);
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
/** The lift of the water, once, for the hull's program: the same sum as `poolLift` in JS. Needs `uPhase`, `uAmp`, `uSlosh`, `uLiving`, `uRes`. */
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
  float climb = ${f(CLIMB_PX)} / pxu * exp(-aW * pxu / ${f(CLIMB_FALL_PX)}) - ${f(SAG_PX)} / pxu * smoothstep(0.0, ${f(SAG_FALL_PX)} / pxu, aW);
  float tilt = clamp((wx - 712.0) / 400.0, -1.0, 1.0) * uSlosh * boost;
  return (ripple * rest + uLiving * (climb + tilt)) * (1.0 - smoothstep(0.0, ${f(RIPPLE_DEPTH)}, aD));
}
`;
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
float edge = mix(1.0, smoothstep(0.0, ${f(FEATHER_PX)}, wpx), uLiving);
  gl_FragColor = vec4(c, min(1.0, a * edge) * uOpacity);
  // 2D's liver cut (veins-gl.js fluidAt): the straw is kept off a congested liver, above its lower edge
  gl_FragColor.a *= liverKeep(vW2d, 1.0 / max(vPxu, 1e-3));
}`;
