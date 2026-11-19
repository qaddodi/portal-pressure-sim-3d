// Clots (thrombus): the 2D figure's lumpy plug that lies against one wall of the vein, grows from that wall as the occlusion rises, lengthens, and at full occlusion
// spans the lumen with blunt ends (clot-shape.js: clotSpan, clotRadius, clotShift, clotSide, all copied). The clot is the whole vein's: a vein the engine cuts in pieces has
// one. In 3D the vein's wall is opaque, so the clot is drawn inside the lumen's own width, as 2D draws it (never wider than the vein: 19 Nov, "oversized clots"), and lifted toward the
// viewer so it rides the wall's front: a swelling on one side that fills the vein at full occlusion.
// A clot thickens and thins with its parameter in a moment (lesion-ease.js) and never pops: a new clot grows from nothing, a lysed one shrinks to nothing.
import { Group, Vector3 } from 'three';
import { clotRadius, clotShift, clotSide, clotSpan, hashSeed } from './copied/clot-shape.js';
import { CelObject, type CelShared } from '../materials/cel.ts';
import type { Palette } from '../palette.ts';
import type { LookId } from '../../looks/looks.ts';
import { hostCourse } from './course.ts';
import { lesionStep } from './follow.ts';
import { clotColour, recolour } from './paint.ts';
import { ringTube, sampleAlong } from './tube.ts';

/** How wide the clot may be against the lumen: the whole of it, as 2D (it was 1.32, a plug a third wider than its vein). */
export const CLOT_OVER = 1;
/** How far toward the viewer the clot's centre rides the wall's front (a share of the lumen's height at the clot's place), so the opaque wall does not hide it. */
export const CLOT_LIFT = 0.55;
export const CLOT_RINGS = 28;

interface Clot { id: string; goal: number; cur: number; obj: CelObject | null; builtFor: number }

/** The clot's centres and radii for an occlusion v on a course of vessel radius R: the 2D shape, in scene units. */
export function clotShapeOf(pts: Vector3[], R: number, v: number, id: string): { centres: Vector3[]; radii: number[] } {
  const seed = hashSeed(id), side = clotSide(seed), { u0, u1 } = clotSpan(v);
  const shares = Array.from({ length: CLOT_RINGS }, (_, i) => u0 + (u1 - u0) * (i / (CLOT_RINGS - 1)));
  const on = sampleAlong(pts, shares);
  const W = 2 * R * 0.9 * CLOT_OVER;
  const centres: Vector3[] = [], radii: number[] = [];
  for (let i = 0; i < on.length; i++) {
    const a = on[Math.max(0, i - 1)]!, b = on[Math.min(on.length - 1, i + 1)]!;
    const tx = b.x - a.x, ty = b.y - a.y, l = Math.hypot(tx, ty) || 1;
    const nx = ty / l, ny = -tx / l;   // in the figure's plane, the normal the 2D figure shifts along
    const r = clotRadius(v, W, i / (on.length - 1), seed);
    const sh = clotShift(W, r, side);
    const lift = CLOT_LIFT * Math.sqrt(Math.max(0, R * R - sh * sh));
    centres.push(new Vector3(on[i]!.x + nx * sh, on[i]!.y + ny * sh, on[i]!.z + lift));
    radii.push(Math.max(1e-4, r));
  }
  return { centres, radii };
}

export class ClotLayer {
  readonly group = new Group();
  private clots = new Map<string, Clot>();
  private shared: CelShared;
  private palette: Palette | null = null;
  private look: LookId = 'light';
  constructor(shared: CelShared) { this.shared = shared; }

  applyLook(look: LookId, p: Palette): void { this.look = look; this.palette = p; for (const c of this.clots.values()) if (c.obj) recolour(c.obj, clotColour(look, p), p); }
  setPhone(phone: boolean): void { for (const c of this.clots.values()) c.obj?.setPhone(phone); }

  /** The params' thrombus map. `instant` (a new patient) takes it whole. Returns true while a clot grows or shrinks. */
  set(thrombus: Record<string, number>, dt: number, instant = false): boolean {
    for (const id of Object.keys(thrombus)) if (!this.clots.has(id) && hostCourse(id)) this.clots.set(id, { id, goal: 0, cur: 0, obj: null, builtFor: -1 });
    let moving = false;
    for (const c of this.clots.values()) {
      c.goal = thrombus[c.id] ?? 0;
      const next = instant ? c.goal : lesionStep(c.cur, c.goal, dt);
      if (next !== c.cur || c.builtFor !== next) { c.cur = next; this.rebuild(c); }
      if (c.cur !== c.goal) moving = true;
    }
    return moving;
  }

  private rebuild(c: Clot): void {
    const course = hostCourse(c.id);
    if (!course) return;
    c.builtFor = c.cur;
    if (c.cur <= 0.003) { if (c.obj) c.obj.group.visible = false; return; }
    const { centres, radii } = clotShapeOf(course.pts, course.radius, c.cur, c.id);
    const g = ringTube(centres, radii, 12, true);
    if (!c.obj) {
      c.obj = new CelObject(g, { tone: 'heart', bands: 3, spec: 0, px: 0.9 }, this.shared);
      this.group.add(c.obj.group);
      if (this.palette) { c.obj.applyPalette(this.palette); recolour(c.obj, clotColour(this.look, this.palette), this.palette); }
    } else {
      const old = new Set<import('three').BufferGeometry>();
      for (const m of c.obj.group.children) { const mesh = m as import('three').Mesh; old.add(mesh.geometry); mesh.geometry = g; }
      for (const o of old) o.dispose();
    }
    c.obj.group.visible = true;
  }

  /** The clots drawn now, by vein, with their shown occlusion. */
  shown(): Record<string, number> { const o: Record<string, number> = {}; for (const c of this.clots.values()) if (c.cur > 0.003) o[c.id] = c.cur; return o; }
  dispose(): void { for (const c of this.clots.values()) { c.obj?.dispose(); } }
}
