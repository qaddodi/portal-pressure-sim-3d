// The focus reveal in the scene (config.ts says what it is): each frame it measures where each focus stands in the room and how close the camera is (`look`), eases each rule's strength toward
// what that gives, and, at draw time, puts the strongest rule's segment and strength in the shared uniforms. The organs draw the rest (organs/layer.ts buildFocusReveal).
import { Vector3, type Camera } from 'three';
import { FOCI, easeReveal, lookShare, type FocusRule } from './config.ts';
import { FOCUS_REVEAL_U } from './uniforms.ts';

/** What the camera says about a point: where it lands (CSS px), the room the cards leave (CSS px), and the zoom over the whole figure. */
export interface LookRig {
  project(p: Vector3, out?: { x: number; y: number }): { x: number; y: number };
  readonly pose: { readonly room: { x: number; y: number; w: number; h: number } };
  readonly stageSize: { w: number; h: number };
  readonly zoomOverWhole: number;
}

const mid = (r: FocusRule): Vector3 => new Vector3((r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2, (r.a[2] + r.b[2]) / 2);

/** Where a rule's focus stands in the room (0 the middle, 1 the room's edge, the larger of across and up and down) and the zoom; null when the stage has no size yet. */
export function lookOf(rig: LookRig, r: FocusRule): { u: number; zoom: number } | null {
  const s = rig.stageSize, rm = rig.pose.room.w > 1 ? rig.pose.room : { x: 0, y: 0, w: s.w, h: s.h };
  if (!(rm.w > 1) || !(rm.h > 1)) return null;
  const p = rig.project(mid(r));
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  const ux = (p.x - (rm.x + rm.w / 2)) / (rm.w / 2), uy = (p.y - (rm.y + rm.h / 2)) / (rm.h / 2);
  return { u: Math.max(Math.abs(ux), Math.abs(uy)), zoom: rig.zoomOverWhole };
}

const _a = new Vector3(), _b = new Vector3(), _m = new Vector3(), _r = new Vector3(), _e = new Vector3();

export class FocusReveal {
  private readonly shown = new Map<string, number>(FOCI.map((r) => [r.id, 0]));
  /** The rule drawn now (the one most revealed) and its strength, 0..1; null and 0 when none is. */
  active: FocusRule | null = null;
  strength = 0;
  private about: ReadonlySet<string> = new Set();
  /** The foci the slide on show is about (none off a talk). */
  setAbout(ids: readonly string[]): void { this.about = new Set(ids); }

  /** Each rule's strength now, by id (tests, ?perf). */
  shownOf(id: string): number { return this.shown.get(id) ?? 0; }

  /** Eases every rule toward how much its focus is looked at (`look`, null: not at all) over `dt` seconds; `instant` lands at once (the first frame). True while one still moves. */
  step(dt: number, look: (r: FocusRule) => { u: number; zoom: number } | null, instant = false): boolean {
    let moving = false, best: FocusRule | null = null, bs = 0;
    for (const r of FOCI) {
      const l = look(r), goal = l ? lookShare(r, l.u, l.zoom, this.about.has(r.id)) : 0;
      const v = instant ? goal : easeReveal(this.shown.get(r.id) ?? 0, goal, dt);
      this.shown.set(r.id, v);
      if (v !== goal) moving = true;
      if (v > bs) { bs = v; best = r; }
    }
    this.active = best; this.strength = bs;
    return moving;
  }

  /** Puts the active rule in the shared uniforms for a figure target of `tw` x `th` device px seen by `cam`, at `share` of its strength (the organs' own fade: the reveal goes with them). */
  write(cam: Camera, tw: number, th: number, share: number): void {
    const u = FOCUS_REVEAL_U, r = this.active, k = this.strength * share;
    u.frvC.value.set(1 / tw, 1 / th, tw, th);
    if (!r || !(k > 0)) { u.frvP.value.x = 0; return; }
    const px = (v: Vector3): Vector3 => { v.project(cam); v.set((v.x * 0.5 + 0.5) * tw, (v.y * 0.5 + 0.5) * th, v.z); return v; };
    _m.set((r.a[0] + r.b[0]) / 2, (r.a[1] + r.b[1]) / 2, (r.a[2] + r.b[2]) / 2);
    _r.setFromMatrixColumn(cam.matrixWorld, 0).normalize();
    const a = px(_a.set(...r.a)), b = px(_b.set(...r.b));
    const c = px(_e.copy(_m)), o = px(_m.addScaledVector(_r, r.inner));
    // (behind the camera, or a degenerate projection: nothing)
    const unit = Math.hypot(o.x - c.x, o.y - c.y) / r.inner;
    if (!(a.z < 1 && b.z < 1) || !(unit > 0) || !Number.isFinite(unit)) { u.frvP.value.x = 0; return; }
    u.frvSeg.value.set(a.x, a.y, b.x, b.y);
    u.frvP.value.set(k, r.inner * unit, r.outer * unit, r.fadeMax);
  }

  /** The target drawn into now (the organ veil's half-size map, or the figure itself, `w` x `h` device px): the shaders carry its pixels to the figure's. */
  drawingInto(w: number, h: number): void { const c = FOCUS_REVEAL_U.frvC.value; c.x = 1 / w; c.y = 1 / h; }
}
