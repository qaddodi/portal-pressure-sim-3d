// A narrowed vessel, as the 2D figure marks it (stage-clamps.js clampAt, stage.js waist): where a vein has a stenosis (params.stenosis: the IVC web, a dysfunctional shunt),
// the vessel pinches at its middle with a smooth waist about 2.5 widths long, and a pair of small arrowheads, one each side, point at the narrowest place from just off the
// narrowed wall (the 2D clamp: tip at half the narrowed width + 3, in the text's own colour). A stent's own narrowing (its waist, its end stenosis) is the stent's (devices/stent);
// this layer narrows every other vessel's. The narrowing eases in and out with LESION_TAU like a clot, with the vessel it is on (never pops).
// The arrowheads are NOT in the 3D scene (Mohammad, 20 Nov: "the arrows that show the stenosis should be more elegant, and should be 2D not 3D laid on"): this layer only says where
// they stand (marks(): the waist's middle, the vessel's width there, how narrowed it is, how much of it shows) and labels/clamp-marks.ts draws them flat, on the screen, like the
// label callouts. The words ("60% narrowed") are the label layer's.
import { BufferAttribute, type BufferGeometry, CatmullRomCurve3, Vector3 } from 'three';
import { EDGES, isStent } from '../../engine/hales/portal/topology.js';
import { UNITS_PER_SCENE } from '../frame2d.ts';
import { NETWORK_BY_ID } from '../vessels/network.ts';
import { REST, coursesOf } from '../vessels/shape.ts';
import { lesionStep } from './follow.ts';

const U = UNITS_PER_SCENE;
/** The waist's length scale: sig = max(9, w * 1.25) / length, w the vessel's drawn width and length its drawn length, both in 2D units (stage.js waist), but never more than the vessel can hold (WAIST_REACH): a short piece of a vein
 *  (the portal vein is cut in pieces where a collateral joins it) gets a shorter, sharper waist, not one that is still narrowed where its neighbour begins. */
export const waistSigma = (widthUnits: number, lengthUnits: number): number => Math.min(Math.max(9, widthUnits * 1.25) / Math.max(1, lengthUnits), WAIST_MAX_SIG);
/** The waist is a Gaussian bell, ended in a smooth window: it is exactly nothing, with no slope, WAIST_REACH sigmas from the middle, and never farther than the vessel's own ends. A bare Gaussian is never nothing: on a short piece it still took
 *  half the lumen at the end, a step against the next piece (Mohammad, 20 Nov: "the stenosis should be smooth and local, with a smooth calibre on either side"). */
export const WAIST_REACH = 2.4;
/** The widest the bell may be so that its window ends inside the vessel (half the vessel's length is WAIST_REACH sigmas). */
export const WAIST_MAX_SIG = 0.5 / WAIST_REACH;
/** The share of the vessel's radius taken off at the share u of its length, for a stenosis v at the middle (stage.js waist: 1 - v exp(-((u - 0.5) / sig)^2), here ended smoothly at the bell's reach). */
export const waistNarrow = (v: number, u: number, sig: number): number => {
  const d = Math.abs(u - 0.5) / Math.max(1e-6, Math.min(sig, WAIST_MAX_SIG)), t = d / WAIST_REACH;
  if (t >= 1) return 0;
  const w = t <= 0.5 ? 1 : 1 - (3 - 2 * ((t - 0.5) / 0.5)) * (((t - 0.5) / 0.5) ** 2);   // (1 - smoothstep(0.5, 1, t))
  return v * Math.exp(-d * d) * w;
};

/** The vessels a stenosis can pinch here: any drawn vessel that is not a stent (a stent's narrowing is its own geometry). */
export function isClampable(id: string): boolean {
  const e = (EDGES as { id: string }[]).find((x) => x.id === id);
  return !!e && NETWORK_BY_ID.has(id) && !isStent(e);
}

interface Clamp { id: string; goal: number; cur: number; built: string; geo: BufferGeometry | null; len2d: number; width2d: number; radius: number; at: Vector3; nx: number; ny: number }

/** Where a stenosis's arrowheads stand: the waist's middle on the vessel's drawn course (scene units), the unit normal in the figure's plane, the vessel's radius, how narrowed it is (0..1) and how much of the mark shows (0..1). */
export interface ClampMark { id: string; at: Vector3; nx: number; ny: number; radius: number; cur: number; shown: number }

/** How much of the mark shows at a narrowing: it comes in over the first few percent, so a mark never pops and never lags the waist it points at. */
export const markShown = (cur: number): number => { const t = Math.min(1, Math.max(0, (cur - 0.003) / 0.08)); return t * t * (3 - 2 * t); };

export class ClampLayer {
  private clamps = new Map<string, Clamp>();
  private fade = 1;

  /** The narrowing of the vessel `id`'s drawn tube (the shader's `narrow` attribute, which any vessel geometry may carry), given its geometry. */
  bind(id: string, geometry: BufferGeometry): void { this.geos.set(id, geometry); }
  private geos = new Map<string, BufferGeometry>();
  private clamp(id: string): Clamp | null {
    let c = this.clamps.get(id) ?? null;
    if (c) return c;
    if (!isClampable(id)) return null;
    const v = NETWORK_BY_ID.get(id)!;
    // (the vessel's DRAWN course, the very curve its tube is built along, and its length: the waist and its marks stand where the tube is pinched, not where the figure's raw samples put the middle)
    const course = coursesOf(v, REST)[0]!, curve = new CatmullRomCurve3(course.pts.map((p) => new Vector3(p[0], p[1], p[2])));
    const at = curve.getPointAt(0.5), t = curve.getTangentAt(0.5), l = Math.hypot(t.x, t.y) || 1;
    c = { id, goal: 0, cur: 0, built: '', geo: this.geos.get(id) ?? null, len2d: curve.getLength() * U, width2d: 2 * v.radius * U, radius: v.radius, at, nx: -t.y / l, ny: t.x / l };
    this.clamps.set(id, c);
    return c;
  }

  /** `stenosis`: the params' narrowing map; `presence(id)` the vessel's 0/1 (a vessel that is not drawn has no clamp). True while a clamp comes or goes. */
  set(stenosis: Record<string, number>, presence: (id: string) => number, dt: number, instant = false): boolean {
    for (const id of Object.keys(stenosis)) if (!this.clamps.has(id)) this.clamp(id);
    let moving = false;
    for (const c of this.clamps.values()) {
      c.goal = Math.min(0.95, Math.max(0, stenosis[c.id] ?? 0)) * (presence(c.id) > 0.5 ? 1 : 0);
      const next = instant ? c.goal : lesionStep(c.cur, c.goal, dt);
      if (next !== c.cur || c.built === '') { c.cur = next; this.rebuild(c); }
      if (c.cur !== c.goal) moving = true;
    }
    return moving;
  }

  private rebuild(c: Clamp): void {
    const key = c.cur.toFixed(3);
    if (key === c.built) return;
    c.built = key;
    // the waist in the vessel's tube
    c.geo ??= this.geos.get(c.id) ?? null;
    if (c.geo) {
      if (!c.geo.getAttribute('narrow')) c.geo.setAttribute('narrow', new BufferAttribute(new Float32Array(c.geo.getAttribute('position').count), 1));
      const nar = c.geo.getAttribute('narrow') as BufferAttribute, uv = c.geo.getAttribute('uv') as BufferAttribute, sig = waistSigma(c.width2d, c.len2d);
      for (let i = 0; i < nar.count; i++) nar.setX(i, c.cur > 0.003 ? waistNarrow(c.cur, uv.getX(i), sig) : 0);
      nar.needsUpdate = true;
    }
  }

  /** The arrowheads to draw now (labels/clamp-marks.ts): every narrowed vessel with any of its mark showing. The body's dissolve takes them with it. */
  marks(): ClampMark[] {
    const out: ClampMark[] = [];
    for (const c of this.clamps.values()) {
      const shown = markShown(c.cur) * this.fade;
      if (shown > 0.001) out.push({ id: c.id, at: c.at, nx: c.nx, ny: c.ny, radius: c.radius, cur: c.cur, shown });
    }
    return out;
  }

  /** The waist the vessel's tube has now, for the network figure's edge row (?geom=net): [how narrowed 0..1, the bell's sigma in u, its centre in u], or null for a vessel with no clamp narrowed. */
  waistOf(id: string): readonly [number, number, number] | null {
    const c = this.clamps.get(id);
    return c && c.cur > 0.003 ? [c.cur, waistSigma(c.width2d, c.len2d), 0.5] : null;
  }

  /** The vessels with a clamp shown now, and their narrowing (for the tests and the parity table). */
  shown(): Record<string, number> { const o: Record<string, number> = {}; for (const c of this.clamps.values()) if (c.cur > 0.003) o[c.id] = c.cur; return o; }
  setFade(f: number): void { this.fade = f; }
  dispose(): void { this.clamps.clear(); }
}
