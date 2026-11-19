import { PerspectiveCamera, Vector3 } from 'three';
import { BODY_PLATE_Z, PLATE_BOUNDS } from '../anatomy/placeholder.ts';
import { type View, lerpView } from '../gesture/ease.ts';
import type { Rect } from '../gesture/view.ts';
import { type Room, effectiveDistance, viewOffset } from './room.ts';
import { FOV, ORBIT_LIMIT, SHOTS, SHOT_MS, type Shot, type ShotName } from './shots.ts';

/** Radians of turn per pixel of drag. */
export const ORBIT_PER_PX = 0.006;

/** The orbit angle after a drag of `dx` CSS pixels (positive = to the right) from `start`. The figure follows the finger or pointer: its front
 *  face moves the way the drag moves, which means the camera swings the other way, so yaw goes down as dx goes up. One rule for every input
 *  (touch, mouse, pen and trackpad all arrive as pointer events); Stage.tsx calls nothing else. */
export const dragToOrbit = (start: number, dx: number): number => start - dx * ORBIT_PER_PX;

export const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Shortest way round between two angles, so a turn never spins the long way. */
export function lerpAngle(a: number, b: number, k: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

interface Pose { shot: Shot; room: Room }

const copyShot = (s: Shot): Shot => ({ yaw: s.yaw, pitch: s.pitch, r: s.r, target: [...s.target], half: [...s.half] });
const copyRoom = (r: Room): Room => ({ ...r });

/** The pose halfway (k) between two: every field interpolated directly, so the camera goes straight from any view to any view with no
 *  fit-everything waypoint in between (Mohammad, 18 Nov). */
export function blendPose(a: Pose, b: Pose, k: number): Pose {
  return {
    shot: {
      yaw: lerpAngle(a.shot.yaw, b.shot.yaw, k), pitch: lerp(a.shot.pitch, b.shot.pitch, k), r: lerp(a.shot.r, b.shot.r, k),
      target: [lerp(a.shot.target[0], b.shot.target[0], k), lerp(a.shot.target[1], b.shot.target[1], k), lerp(a.shot.target[2], b.shot.target[2], k)],
      half: [lerp(a.shot.half[0], b.shot.half[0], k), lerp(a.shot.half[1], b.shot.half[1], k)],
    },
    room: { x: lerp(a.room.x, b.room.x, k), y: lerp(a.room.y, b.room.y, k), w: lerp(a.room.w, b.room.w, k), h: lerp(a.room.h, b.room.h, k) },
  };
}

/** One owner of the camera. The clock calls `update(now)` once per frame, in its order (engine, tweens, camera, render, tags), and keeps
 *  asking for frames while it returns true. */
export class CameraRig {
  readonly camera = new PerspectiveCamera(FOV, 1, 0.1, 100);
  private from: Pose;
  private to: Pose;
  private cur: Pose;
  private t0 = 0;
  private dur = 0;
  private active = false;
  private orbit = 0;
  private orbitFrom = 0;
  private width = 1;
  private height = 1;
  private dirty = true;
  private readonly pos = new Vector3();
  /** The hand's view on top of the shot: zoom k (the camera's own zoom, about the projection centre) and a pan in canvas px. Identity = the shot's framing. */
  private hand: View = { k: 1, x: 0, y: 0 };
  private handFrom: View = { k: 1, x: 0, y: 0 };
  private handTween = false;
  readonly reduceMotion: boolean;

  constructor(shot: ShotName | Shot = 'title', room?: Room, reduceMotion = false) {
    const s = typeof shot === 'string' ? SHOTS[shot] : shot;
    const r = room ?? { x: 0, y: 0, w: 1, h: 1 };
    this.cur = { shot: copyShot(s), room: copyRoom(r) };
    this.from = this.to = this.cur;
    this.reduceMotion = reduceMotion;
  }

  /** Canvas size in CSS pixels. */
  resize(width: number, height: number): void {
    if (width === this.width && height === this.height) return;
    // a room set before the first size was a fraction; keep it filling the canvas until the app sends a real one
    this.width = width; this.height = height; this.camera.aspect = width / height; this.dirty = true;
  }

  get isMoving(): boolean { return this.active; }
  get pose(): Readonly<Pose> { return this.cur; }

  /** Fly to a shot (and a room) in one straight move. Called again mid-flight, the new move starts from where the camera is now. */
  goTo(shot: ShotName | Shot, room: Room, now: number, ms = SHOT_MS, keepHand = false): void {
    const s = typeof shot === 'string' ? SHOTS[shot] : shot;
    this.from = { shot: copyShot(this.cur.shot), room: copyRoom(this.cur.room) };
    this.to = { shot: copyShot(s), room: copyRoom(room) };
    // a new shot takes the hand's zoom and pan back to the shot's own framing, in the same move
    this.handFrom = { ...this.hand };
    this.handTween = keepHand ? this.handTween : this.hand.k !== 1 || this.hand.x !== 0 || this.hand.y !== 0;
    this.t0 = now;
    this.dur = this.reduceMotion ? 0 : ms;
    this.orbitFrom = this.orbit;
    this.active = true;
    this.dirty = true;
  }

  /** The cards changed room (a card opened, the phone turned): move the room alone, same curve; the hand's zoom stays (cards opening keep the zoom). */
  setRoom(room: Room, now: number, ms = SHOT_MS): void { this.goTo(this.to.shot, room, now, ms, true); }

  /** Limited orbit by drag, ±25°, clamped. Returns true when it changed (a frame is needed). */
  setOrbit(rad: number): boolean {
    const o = Math.max(-ORBIT_LIMIT, Math.min(ORBIT_LIMIT, rad));
    if (o === this.orbit) return false;
    this.orbit = o; this.orbitFrom = o; this.dirty = true;
    return true;
  }
  get orbitAngle(): number { return this.orbit; }

  get handView(): Readonly<View> { return this.hand; }
  /** The hand puts the figure where its fingers are. */
  setHand(v: View): void { this.hand.k = v.k; this.hand.x = v.x; this.hand.y = v.y; this.dirty = true; }
  /** The hand takes the camera: a shot's return of the hand to its fit stops where it is. */
  holdHand(): void { this.handTween = false; }
  /** The middle of the free room, in canvas px: what the figure is zoomed about. */
  roomCentre(): { x: number; y: number } {
    const r = this.cur.room.w > 1 ? this.cur.room : { x: 0, y: 0, w: this.width, h: this.height };
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }
  get stageSize(): { w: number; h: number } { return { w: this.width, h: this.height }; }

  /** The body plate's rectangle on screen in the shot's own framing (hand at the fit): the bounds the hand may pan the figure within. */
  fitRect(): Rect {
    const keep = { ...this.hand };
    this.hand.k = 1; this.hand.x = 0; this.hand.y = 0;
    this.apply();
    const b = PLATE_BOUNDS;
    const rect: Rect = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const [x, y] of [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]] as const) {
      const p = this.project(new Vector3(x, y, BODY_PLATE_Z));
      rect.x0 = Math.min(rect.x0, p.x); rect.x1 = Math.max(rect.x1, p.x); rect.y0 = Math.min(rect.y0, p.y); rect.y1 = Math.max(rect.y1, p.y);
    }
    this.hand.k = keep.k; this.hand.x = keep.x; this.hand.y = keep.y;
    this.apply();
    return rect;
  }

  /** Steps the tween and writes the camera. Returns true while the camera is still moving (the clock needs another frame). */
  update(now: number): boolean {
    let moving = false;
    if (this.active) {
      const k = this.dur <= 0 ? 1 : Math.min(1, (now - this.t0) / this.dur);
      this.cur = blendPose(this.from, this.to, easeInOutCubic(k));
      // the orbit eases back to centre with the shot: a new shot always starts square on
      this.orbit = lerp(this.orbitFrom, 0, easeInOutCubic(k));
      if (this.handTween) { lerpView(this.handFrom, { k: 1, x: 0, y: 0 }, easeInOutCubic(k), this.hand); if (k >= 1) this.handTween = false; }
      if (k >= 1) this.active = false; else moving = true;
      this.dirty = true;
    }
    if (this.dirty) { this.apply(); this.dirty = false; }
    return moving;
  }

  private apply(): void {
    const { shot, room } = this.cur;
    const w = this.width, h = this.height;
    const r = effectiveDistance(shot, room.w > 1 ? room : { x: 0, y: 0, w, h }, h);
    const yaw = shot.yaw + this.orbit;
    const cp = Math.cos(shot.pitch);
    const [tx, ty, tz] = shot.target;
    this.pos.set(tx + Math.sin(yaw) * cp * r, ty + Math.sin(shot.pitch) * r, tz + Math.cos(yaw) * cp * r);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(tx, ty, tz);
    const off = viewOffset(room.w > 1 ? room : { x: 0, y: 0, w, h }, w, h);
    this.camera.zoom = this.hand.k;
    this.camera.setViewOffset(w, h, off.x - this.hand.x, off.y - this.hand.y, w, h);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld(); // so tags projected before the next render see this pose
  }

  /** Where a scene point lands on the canvas now, in CSS pixels (for tags). Valid after `update`. */
  project(p: Vector3, out = { x: 0, y: 0 }): { x: number; y: number } {
    const v = p.clone().project(this.camera);
    out.x = (v.x * 0.5 + 0.5) * this.width;
    out.y = (-v.y * 0.5 + 0.5) * this.height;
    return out;
  }
}
