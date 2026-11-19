// Ascites: the pool in the belly. The 2D figure fills the abdominal cavity (its wall bulges with the volume, anatomy.js abdomenOutline) up to a meniscus whose height follows the
// volume (fluid-step.js fluidLevel / fluidBase, both copied): none under 150 mL, fading in over the next 150, standing higher by volume^1.1, concave, the same on both sides.
// In 3D it is a translucent amber plate between the organs (z <= 0.26) and the vessels (z >= 0.30), cut to the cavity by columns, with a lighter band on the surface.
import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial } from 'three';
import { ABDOMEN_OUTLINES } from './copied/anatomy-b4.ts';
import { fluidBase, fluidLevel, poolFade } from './copied/fluid-step.js';
import { x3, y3 } from '../frame2d.ts';

export const FLUID_Z = 0.28;
/** The pool's colour and opacity (stage.js fluidInkRGBA, the default the figure paints the fluid with). */
export const FLUID_RGBA = [0.9, 0.75, 0.28, 0.4] as const;
const X0 = 296, X1 = 1128, STEP = 8;
const COLS = Math.floor((X1 - X0) / STEP) + 1;
const BAND = 7;   // 2D units: the light band on the surface

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

export class AscitesLayer {
  readonly group = new Group();
  private fill: Mesh; private band: Mesh;
  private pf = new Float32Array(COLS * 2 * 3); private pb = new Float32Array(COLS * 2 * 3);
  private lastH = NaN; private lastStep = -1;
  /** The pool's level in 2D units at the middle of the belly (x 712), for the tests and the labels; null while there is no pool. */
  surface: number | null = null;
  constructor() {
    const mk = (pos: Float32Array, a: number) => {
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(pos, 3));
      const idx: number[] = [];
      for (let c = 0; c < COLS - 1; c++) { const p = c * 2; idx.push(p, p + 1, p + 2, p + 1, p + 3, p + 2); }
      g.setIndex(idx);
      const m = new Mesh(g, new MeshBasicMaterial({ color: 0xe6bf47, transparent: true, opacity: a, depthWrite: false }));
      m.renderOrder = 2; m.frustumCulled = false; m.visible = false;
      this.group.add(m);
      return m;
    };
    this.fill = mk(this.pf, FLUID_RGBA[3]); this.band = mk(this.pb, 0.55);
    (this.band.material as MeshBasicMaterial).color.setHex(0xf6dc86);
  }
  /** The wall's bulge in 2D units shown now (the bowel floats up with it: bowel group moves by 26/34 of it). */
  bulge = 0;
  /** `ml` is the shown (sprung) volume. Returns true when the picture changed. */
  set(ml: number): boolean {
    const fade = poolFade(ml), step = bulgeStep(ml);
    this.bulge = step / 2;
    const { h } = fluidLevel(ml);
    const show = fade > 0;
    this.fill.visible = this.band.visible = show;
    if (!show) { this.surface = null; return false; }
    const m = this.fill.material as MeshBasicMaterial, mb = this.band.material as MeshBasicMaterial;
    m.opacity = FLUID_RGBA[3] * fade; mb.opacity = 0.55 * fade;
    this.surface = fluidBase(712, h);
    if (Math.abs(h - this.lastH) < 0.25 && step === this.lastStep) return false;
    this.lastH = h; this.lastStep = step;
    const poly = polyOf(step);
    for (let c = 0; c < COLS; c++) {
      const x = X0 + c * STEP, cr = crossings(poly, x);
      let top = 0, bot = 0;
      if (cr) { top = Math.max(fluidBase(x, h), cr[0]); bot = cr[1]; if (top > bot) top = bot; } else { top = bot = 0; }
      const px = x3(x), z = FLUID_Z;
      this.pf.set([px, y3(top), z, px, y3(bot), z], c * 6);
      this.pb.set([px, y3(top), z + 0.002, px, y3(Math.min(bot, top + BAND)), z + 0.002], c * 6);
    }
    for (const m2 of [this.fill, this.band]) { (m2.geometry.getAttribute('position') as import('three').BufferAttribute).needsUpdate = true; }
    return true;
  }
  dispose(): void { for (const m of [this.fill, this.band]) { m.geometry.dispose(); (m.material as MeshBasicMaterial).dispose(); } }
}
