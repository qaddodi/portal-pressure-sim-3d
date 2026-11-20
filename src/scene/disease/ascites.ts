// Ascites: the pool in the belly. The 2D figure fills the abdominal cavity (its wall bulges with the volume, anatomy.js abdomenOutline) up to a meniscus whose height follows the
// volume (fluid-step.js fluidLevel / fluidBase, both copied): none under 150 mL, fading in over the next 150, standing higher by volume^1.1, concave, the same on both sides.
// In 3D it is a translucent straw plate between the organs (z <= 0.26) and the vessels (z >= 0.30), cut to the cavity by columns, painted as 2D's fluidAt paints it (veins-gl.js): the
// look's own ink (--ascites at --ascites-a), more see-through at the surface (.55 of the ink) than deeper down (the whole ink by 28 units under it), and a thin pale meniscus on the surface
// (the ink 45 % toward white, gone by about 5 units down). One mesh; the straw is a program of its own (POOL_VS / POOL_FS) so the surface can live:
//   - the surface ripples as 2D's does (two sines, amplitude from the volume, the phase running with the blood's eased flow rate, so Pause stills it over half a second);
//   - "Living fluid" (Settings > Figure depth, on by default; off is 2D's hard-edged pool): the pool fades out over FEATHER units before the wall instead of ending in two ruler lines,
//     the surface climbs the wall a few units like water in a glass, a pale rim lies just inside the wall, a crisp pale line rides the surface, deep water is a richer amber, and
//     the surface sloshes a little while the level moves (a damped swing driven by how fast it rises or falls, always back to calm).
// Everything is a number the clock eases (the volume's spring, the flow rate, the living switch's own 0.45 s glide, the slosh's damping): nothing pops.
import { BufferAttribute, BufferGeometry, Group, Mesh, ShaderMaterial, Vector3 } from 'three';
import { ABDOMEN_OUTLINES } from './copied/anatomy-b4.ts';
import { fluidBase, fluidLevel, poolFade } from './copied/fluid-step.js';
import { x3, y3 } from '../frame2d.ts';
import type { LookId } from '../../looks/looks.ts';

export const FLUID_Z = 0.28;
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
/** Units (2D) from the wall over which the pool fades out, and over which the surface's ripple is damped to rest against the wall. */
export const FEATHER = 16, RIPPLE_REST = 22;
/** The surface climbs the wall by CLIMB units at the wall, falling off by exp(-distance / CLIMB_FALL); only the top RIPPLE_DEPTH units of the water move with the surface. */
export const CLIMB = 4, CLIMB_FALL = 6, RIPPLE_DEPTH = 16;
/** The pale rim just inside the wall: centred RIM_AT units from it, RIM_W wide, up to RIM_K toward white. */
export const RIM_AT = 8, RIM_W = 6, RIM_K = 0.22;
/** The crisp pale line on the surface: full to LINE_FROM units under it, gone by LINE_TO, LINE_K toward white (a cel line over 2D's soft meniscus). */
export const LINE_FROM = 0.9, LINE_TO = 2.1, LINE_K = 0.35;
/** Deep water is richer: from RICH_FROM to RICH_TO units under the surface the straw turns RICH_K of the way to its saturated self (x RICH_SAT, at RICH_VAL of the value). Alpha does not grow, so labels under it stay readable. */
export const RICH_FROM = 40, RICH_TO = 190, RICH_K = 0.7, RICH_SAT = 1.45, RICH_VAL = 0.9;
/** The slosh: the swing's own frequency (rad/s) and damping ratio, the tilt per unit of level speed (2D units per 2D unit/s), and the most the surface tilts at a wall. */
export const SLOSH_W = 4.8, SLOSH_ZETA = 0.28, SLOSH_GAIN = 0.025, SLOSH_MAX = 6;
/** 2D's ripple clock: the phase advances dt / 1.1 s at the full flow rate (stage-transitions.js), over 20 pi. */
export const RIPPLE_PERIOD = 1.1, RIPPLE_WRAP = 20 * Math.PI;
/** The Living fluid switch glides over this many seconds (a smoothed exponential: it never snaps). */
export const LIVING_TAU = 0.15;

const ss = (a: number, b: number, x: number): number => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** How far the water at a vertex is lifted (2D units, up is positive): 2D's two-sine ripple (rested near a wall when living), the climb up the wall and the slosh's tilt, on the top RIPPLE_DEPTH units only. The vertex shader sums the same terms. */
export function poolLift(v: { wx: number; aW: number; aD: number; phase: number; amp: number; slosh: number; living: number }): number {
  const ripple = (Math.sin(v.wx / 38 + v.phase) * 0.7 + Math.sin(v.wx / 23 - v.phase * 1.3) * 0.3) * v.amp;
  const rest = 1 + (ss(0, RIPPLE_REST, v.aW) - 1) * v.living;
  const climb = CLIMB * Math.exp(-v.aW / CLIMB_FALL);
  const tilt = Math.min(1, Math.max(-1, (v.wx - 712) / 400)) * v.slosh;
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

const f = (n: number): string => { const t = String(Number(n.toFixed(4))); return /[.e]/.test(t) ? t : `${t}.0`; };
/** The pool's program: one mesh, the depth under its own surface (aD) and the distance to the wall (aW) per vertex; the straw, its opacity, the ripple's phase and amplitude, the slosh and the living share are uniforms. */
export const POOL_VS = /* glsl */ `
attribute float aD;
attribute float aW;
uniform float uPhase;
uniform float uAmp;
uniform float uSlosh;
uniform float uLiving;
varying float vD;
varying float vW;
void main() {
  float wx = position.x * 300.0 + 700.0;
  float ripple = (sin(wx / 38.0 + uPhase) * 0.7 + sin(wx / 23.0 - uPhase * 1.3) * 0.3) * uAmp;
  float rest = mix(1.0, smoothstep(0.0, ${f(RIPPLE_REST)}, aW), uLiving);
  float climb = ${f(CLIMB)} * exp(-aW / ${f(CLIMB_FALL)});
  float tilt = clamp((wx - 712.0) / 400.0, -1.0, 1.0) * uSlosh;
  float lift = (ripple * rest + uLiving * (climb + tilt)) * (1.0 - smoothstep(0.0, ${f(RIPPLE_DEPTH)}, aD));
  vec3 p = position;
  p.y += lift / 300.0;
  vD = aD;
  vW = aW;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}`;
export const POOL_FS = /* glsl */ `
precision highp float;
uniform vec3 uInk;
uniform float uInkA;
uniform float uOpacity;
uniform float uLiving;
varying float vD;
varying float vW;
void main() {
  float d = max(vD, 0.0);
  // 2D's fluidAt: ${SURFACE_SHARE} of the ink at the surface, the whole of it by ${DEEP_AT} units under, a soft pale meniscus
  float a = uInkA * (${f(SURFACE_SHARE)} + ${f(1 - SURFACE_SHARE)} * smoothstep(0.0, ${f(DEEP_AT)}, d));
  vec3 c = mix(uInk, mix(uInk, vec3(1.0), ${f(MENISCUS)}), exp(-d * d / ${f(MENISCUS_FALL)}));
  // Living fluid: a crisp pale line on the surface, richer amber far under it, a pale rim just inside the wall, and the edge fading out over the last ${FEATHER} units
  c = mix(c, vec3(1.0), ${f(LINE_K)} * (1.0 - smoothstep(${f(LINE_FROM)}, ${f(LINE_TO)}, d)) * uLiving);
  float lum = dot(c, vec3(0.299, 0.587, 0.114));
  vec3 rich = clamp(vec3(lum) + (c - vec3(lum)) * ${f(RICH_SAT)}, 0.0, 1.0) * ${f(RICH_VAL)};
  c = mix(c, rich, ${f(RICH_K)} * smoothstep(${f(RICH_FROM)}, ${f(RICH_TO)}, d) * uLiving);
  float rq = (vW - ${f(RIM_AT)}) / ${f(RIM_W)};
  float rim = exp(-rq * rq) * ${f(RIM_K)} * uLiving;
  c = mix(c, vec3(1.0), rim);
  float edge = mix(1.0, smoothstep(0.0, ${f(FEATHER)}, vW), uLiving);
  gl_FragColor = vec4(c, min(1.0, a * edge * (1.0 + rim)) * uOpacity);
}`;

export class AscitesLayer {
  readonly group = new Group();
  private fill: Mesh;
  private pf = new Float32Array(COLS * ROWS * 3); private aD = new Float32Array(COLS * ROWS); private aW = new Float32Array(COLS * ROWS);
  private lastH = NaN; private lastStep = -1;
  private body = 1; private poolA = 0;
  private ink = new Vector3(FLUID_RGBA[0], FLUID_RGBA[1], FLUID_RGBA[2]);
  private readonly uniforms = {
    uInk: { value: this.ink }, uInkA: { value: FLUID_RGBA[3] as number }, uOpacity: { value: 0 },
    uPhase: { value: 0 }, uAmp: { value: 0 }, uSlosh: { value: 0 }, uLiving: { value: 1 },
  };
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
    const mat = new ShaderMaterial({ name: 'pool', vertexShader: POOL_VS, fragmentShader: POOL_FS, uniforms: this.uniforms, transparent: true, depthWrite: false, depthTest: false });
    const m = new Mesh(g, mat);
    m.renderOrder = POOL_ORDER; m.frustumCulled = false; m.visible = false;
    this.group.add(m);
    this.fill = m;
  }
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
  private apply(): void {
    this.fill.visible = this.poolA > 0 && this.body > 0.001;
    this.uniforms.uOpacity.value = this.poolA * this.body;
  }
  /** One frame on the clock: the ripple's phase runs with the eased flow rate (0 paused .. 1), the slosh swings with the level's speed, the living switch glides. True while any of it still moves (the clock draws another frame). */
  step(dt: number, flowRate: number): boolean {
    const u = this.uniforms, shown = this.fill.visible;
    const gl = this.livingGoal - u.uLiving.value;
    if (gl !== 0) { u.uLiving.value = Math.abs(gl) < 0.002 ? this.livingGoal : u.uLiving.value + gl * -Math.expm1(-dt / LIVING_TAU); }
    let moving = gl !== 0;
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
    for (let c = 0; c < COLS; c++) {
      const x = X0 + c * STEP, px = x3(x), z = FLUID_Z, top = tops[c]!, bot = bots[c]!;
      for (let r = 0; r < ROWS; r++) {
        const d = r < ROW_DEPTHS.length ? Math.min(ROW_DEPTHS[r]!, bot - top) : bot - top, v = c * ROWS + r;
        this.pf[v * 3] = px; this.pf[v * 3 + 1] = y3(top + d); this.pf[v * 3 + 2] = z;
        this.aD[v] = d;
        // (a column outside the cavity has no wall to be near: its water is none)
        this.aW[v] = inside[c] ? wallDistance(poly, x, top + d) : 0;
      }
    }
    for (const n of ['position', 'aD', 'aW']) (this.fill.geometry.getAttribute(n) as BufferAttribute).needsUpdate = true;
    return true;
  }
  /** Whether a 2D point is in the pool: inside the belly's wall and below the surface (2D stage-hover.js organAt: `wy > fluidSurf(wx)` inside the abdomen). False while there is none. */
  holds(x: number, y: number): boolean {
    if (this.poolA <= 0 || this.body < 0.5 || !Number.isFinite(this.lastH)) return false;
    const cr = crossings(polyOf(this.lastStep), x);
    return !!cr && y <= cr[1] && y > Math.max(fluidBase(x, this.lastH), cr[0]);
  }
  dispose(): void { this.fill.geometry.dispose(); (this.fill.material as ShaderMaterial).dispose(); }
}
