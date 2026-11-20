// Ascites: the pool in the belly. The 2D figure fills the abdominal cavity (its wall bulges with the volume, anatomy.js abdomenOutline) up to a meniscus whose height follows the
// volume (fluid-step.js fluidLevel / fluidBase, both copied): none under 150 mL, fading in over the next 150, standing higher by volume^1.1, concave, the same on both sides.
// In 3D it is a translucent straw plate between the organs (z <= 0.26) and the vessels (z >= 0.30), cut to the cavity by columns, painted as 2D's fluidAt paints it (veins-gl.js): the
// look's own ink (--ascites at --ascites-a), more see-through at the surface (.55 of the ink) than deeper down (the whole ink by 28 units under it), and a thin pale meniscus on the surface
// (the ink 45 % toward white, gone by about 5 units down). One mesh, the colour and the alpha at each vertex, so nothing is a flat slab and no second band lies over the first.
import { BufferAttribute, BufferGeometry, Group, Mesh, MeshBasicMaterial } from 'three';
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
export const ROW_DEPTHS = [0, 2, 4.5, 8, DEEP_AT] as const;
/** One more row than the depths: the last lies on the cavity's floor (the wall's lowest y in that column), so the pool is a basin from its surface down to the floor, as 2D's is, not a band 28 units thick. */
const ROWS = ROW_DEPTHS.length + 1;
const X0 = 296, X1 = 1128, STEP = 8;
const COLS = Math.floor((X1 - X0) / STEP) + 1;

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

export class AscitesLayer {
  readonly group = new Group();
  private fill: Mesh;
  private pf = new Float32Array(COLS * ROWS * 3); private cf = new Float32Array(COLS * ROWS * 4);
  private lastH = NaN; private lastStep = -1;
  private body = 1; private poolA = 0;
  private ink: [number, number, number] = [FLUID_RGBA[0], FLUID_RGBA[1], FLUID_RGBA[2]]; private inkA: number = FLUID_RGBA[3];
  /** The pool's level in 2D units at the middle of the belly (x 712), for the tests and the labels; null while there is no pool. */
  surface: number | null = null;
  constructor() {
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(this.pf, 3));   // (BufferAttribute keeps the array: Float32BufferAttribute copies it, and the columns written to `pf` never reached the geometry, which stayed at zeros: the pool was never drawn)
    g.setAttribute('color', new BufferAttribute(this.cf, 4));
    const idx: number[] = [];
    for (let c = 0; c < COLS - 1; c++) for (let r = 0; r < ROWS - 1; r++) { const a = c * ROWS + r, b = a + ROWS; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    g.setIndex(idx);
    // (the colours are written as the figure's own numbers, the way materials/cel.ts rawColor does: the picture goes through the anti-aliasing pass as it is)
    const m = new Mesh(g, new MeshBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, depthWrite: false, depthTest: false }));
    m.renderOrder = POOL_ORDER; m.frustumCulled = false; m.visible = false;
    this.group.add(m);
    this.fill = m;
  }
  /** The look's straw (tokens.css --ascites, --ascites-a); the colours are written again at the next step. */
  applyLook(look: LookId): void {
    const k = ASCITES_INK[look];
    this.ink = hexTo01(k.hex); this.inkA = k.a;
    this.lastH = NaN;   // (the vertex colours are laid again with the shape)
    if (this.poolA > 0) this.set(this.lastMl);
  }
  /** The body's dissolve (disease/index.ts setFade): the pool lies in the belly, so it fades with the anatomy. */
  setFade(f: number): void { this.body = f; this.apply(); }
  private apply(): void {
    this.fill.visible = this.poolA > 0 && this.body > 0.001;
    (this.fill.material as MeshBasicMaterial).opacity = this.poolA * this.body;
  }
  /** The wall's bulge in 2D units shown now (the bowel floats up with it: bowel group moves by 26/34 of it). */
  bulge = 0;
  private lastMl = 0;
  /** `ml` is the shown (sprung) volume. Returns true when the picture changed. */
  set(ml: number): boolean {
    this.lastMl = ml;
    const fade = poolFade(ml), step = bulgeStep(ml);
    this.bulge = step / 2;
    const { h } = fluidLevel(ml);
    const show = fade > 0;
    this.poolA = fade; this.apply();
    if (!show) { this.surface = null; return false; }
    this.surface = fluidBase(712, h);
    if (Math.abs(h - this.lastH) < 0.25 && step === this.lastStep) return false;
    this.lastH = h; this.lastStep = step;
    const poly = polyOf(step);
    for (let c = 0; c < COLS; c++) {
      const x = X0 + c * STEP, cr = crossings(poly, x);
      let top = 0, bot = 0;
      if (cr) { top = Math.max(fluidBase(x, h), cr[0]); bot = cr[1]; if (top > bot) top = bot; } else { top = bot = 0; }
      const px = x3(x), z = FLUID_Z;
      for (let r = 0; r < ROWS; r++) {
        const d = r < ROW_DEPTHS.length ? Math.min(ROW_DEPTHS[r]!, bot - top) : bot - top, v = c * ROWS + r;
        this.pf.set([px, y3(top + d), z], v * 3);
        // (a column outside the cavity has no depth: its rows meet, and nothing is drawn between them)
        this.cf.set(fluidTone(this.ink, this.inkA, d), v * 4);
      }
    }
    for (const n of ['position', 'color']) (this.fill.geometry.getAttribute(n) as BufferAttribute).needsUpdate = true;
    return true;
  }
  /** Whether a 2D point is in the pool: inside the belly's wall and below the surface (2D stage-hover.js organAt: `wy > fluidSurf(wx)` inside the abdomen). False while there is none. */
  holds(x: number, y: number): boolean {
    if (this.poolA <= 0 || this.body < 0.5 || !Number.isFinite(this.lastH)) return false;
    const cr = crossings(polyOf(this.lastStep), x);
    return !!cr && y <= cr[1] && y > Math.max(fluidBase(x, this.lastH), cr[0]);
  }
  dispose(): void { this.fill.geometry.dispose(); (this.fill.material as MeshBasicMaterial).dispose(); }
}
