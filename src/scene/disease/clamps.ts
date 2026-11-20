// A narrowed vessel, as the 2D figure marks it (stage-clamps.js clampAt, stage.js waist): where a vein has a stenosis (params.stenosis: the IVC web, a dysfunctional shunt),
// the vessel pinches at its middle with a smooth waist about 2.5 widths long, and a pair of small arrowheads, one each side, point at the narrowest place from just off the
// narrowed wall (the 2D clamp: tip at half the narrowed width + 3, 8 long, 9 across, in the text's own colour). A stent's own narrowing (its waist, its end stenosis) is the
// stent's (devices/stent); this layer draws every other vessel's. The narrowing eases in and out with LESION_TAU like a clot, with the vessel it is on (never pops).
// The words ("60% narrowed") are the label layer's.
import { BufferAttribute, type BufferGeometry, CatmullRomCurve3, Group, Vector3 } from 'three';
import { EDGES, isStent } from '../../engine/hales/portal/topology.js';
import { CelObject, type CelShared } from '../materials/cel.ts';
import type { Palette } from '../palette.ts';
import { LOOKS, type LookId } from '../../looks/looks.ts';
import { UNITS_PER_SCENE } from '../frame2d.ts';
import { NETWORK_BY_ID } from '../vessels/network.ts';
import { REST, coursesOf } from '../vessels/shape.ts';
import { lesionStep } from './follow.ts';
import { recolour } from './paint.ts';
import { rgbOf } from '../organs/organ-look.ts';
import { ringTube } from './tube.ts';

const U = UNITS_PER_SCENE;
/** The arrowhead: its length and half width, and how far its tip stands off the narrowed wall (stage-clamps.js: 8, 4.5 and 3, in 2D units). */
export const CLAMP = { len: 8 / U, half: 4.5 / U, gap: 3 / U } as const;
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

interface Clamp { id: string; goal: number; cur: number; obj: CelObject | null; built: string; geo: BufferGeometry | null; arc: CatmullRomCurve3; len2d: number; width2d: number; radius: number }

export class ClampLayer {
  readonly group = new Group();
  private clamps = new Map<string, Clamp>();
  private shared: CelShared;
  private palette: Palette | null = null;
  private look: LookId = 'light';
  constructor(shared: CelShared) { this.shared = shared; }

  /** The narrowing of the vessel `id`'s drawn tube (the shader's `narrow` attribute, which any vessel geometry may carry), given its geometry. */
  bind(id: string, geometry: BufferGeometry): void { this.geos.set(id, geometry); }
  private geos = new Map<string, BufferGeometry>();
  private clamp(id: string): Clamp | null {
    let c = this.clamps.get(id) ?? null;
    if (c) return c;
    if (!isClampable(id)) return null;
    const v = NETWORK_BY_ID.get(id)!;
    // (the vessel's DRAWN course, the very curve its tube is built along, and its length: the arrowheads stand where the waist is, not where the figure's raw samples put the middle)
    const course = coursesOf(v, REST)[0]!, curve = new CatmullRomCurve3(course.pts.map((p) => new Vector3(p[0], p[1], p[2])));
    c = { id, goal: 0, cur: 0, obj: null, built: '', geo: this.geos.get(id) ?? null, arc: curve, len2d: curve.getLength() * U, width2d: 2 * v.radius * U, radius: v.radius };
    this.clamps.set(id, c);
    return c;
  }

  applyLook(look: LookId, p: Palette): void { this.look = look; this.palette = p; for (const c of this.clamps.values()) if (c.obj) this.paint(c.obj); }
  setPhone(phone: boolean): void { for (const c of this.clamps.values()) c.obj?.setPhone(phone); }
  /** The arrowheads wear the text's colour (2D .clamp: fill var(--text)). */
  private paint(o: CelObject): void { if (this.palette) { o.applyPalette(this.palette); recolour(o, rgbOf(LOOKS[this.look].text), this.palette); } }

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
    // the arrowheads
    if (c.cur <= 0.003) { if (c.obj) c.obj.group.visible = false; return; }
    const g = this.arrows(c);
    if (!c.obj) {
      c.obj = new CelObject(g, { tone: 'cath', bands: 2, spec: 0, px: 0.8 }, this.shared);
      this.group.add(c.obj.group);
      if (this.palette) this.paint(c.obj);
    } else {
      const old = new Set<BufferGeometry>();
      for (const m of c.obj.group.children) { const mesh = m as import('three').Mesh; old.add(mesh.geometry); mesh.geometry = g; }
      for (const o of old) o.dispose();
    }
    c.obj.group.visible = true;
  }

  /** The two arrowheads at the vessel's middle: cones in the figure's plane, a little toward the viewer so the vessel's wall never hides them. */
  private arrows(c: Clamp): BufferGeometry {
    const at = c.arc.getPointAt(0.5), t = c.arc.getTangentAt(0.5), l = Math.hypot(t.x, t.y) || 1, nx = -t.y / l, ny = t.x / l;
    const off = c.radius * (1 - c.cur) + CLAMP.gap, z = at.z + c.radius + CLAMP.half * 0.6;
    const parts: BufferGeometry[] = [];
    for (const sgn of [1, -1]) {
      const tip = new Vector3(at.x + nx * sgn * off, at.y + ny * sgn * off, z), base = new Vector3(at.x + nx * sgn * (off + CLAMP.len), at.y + ny * sgn * (off + CLAMP.len), z);
      parts.push(ringTube([tip, base], [1e-4, CLAMP.half], 12, true));
    }
    return merge(parts);
  }

  /** The vessels with a clamp shown now, and their narrowing (for the tests and the parity table). */
  shown(): Record<string, number> { const o: Record<string, number> = {}; for (const c of this.clamps.values()) if (c.cur > 0.003) o[c.id] = c.cur; return o; }
  setFade(f: number): void { for (const c of this.clamps.values()) if (c.obj) { c.obj.setFade(f); } this.group.visible = f > 0.001; }
  dispose(): void { for (const c of this.clamps.values()) c.obj?.dispose(); }
}

/** Two tubes in one geometry (the cel layout: position, normal, uv, tang, index). */
function merge(gs: BufferGeometry[]): BufferGeometry {
  const out = gs[0]!.clone();
  if (gs.length === 1) return out;
  const names = ['position', 'normal', 'uv', 'tang'] as const;
  const arrays: Record<string, number[]> = { position: [], normal: [], uv: [], tang: [] };
  const idx: number[] = []; let base = 0;
  for (const g of gs) {
    for (const n of names) arrays[n]!.push(...Array.from((g.getAttribute(n) as BufferAttribute).array));
    for (const i of Array.from(g.getIndex()!.array)) idx.push(i + base);
    base += g.getAttribute('position').count;
    g.dispose();
  }
  const o = new (out.constructor as new () => BufferGeometry)();
  for (const n of names) o.setAttribute(n, new BufferAttribute(new Float32Array(arrays[n]!), n === 'uv' ? 2 : 3));
  o.setIndex(idx);
  out.dispose();
  return o;
}
