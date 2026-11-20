import { reduced, reducedMs } from '../../ui/a11y/motion.ts';
import { PerspectiveCamera, Vector3 } from 'three';
import { FIGURE_Z, PLATE_BOUNDS } from '../anatomy/placeholder.ts';
import type { Vec3 } from '../anatomy/vessels.ts';
import { type View, lerpView } from '../gesture/ease.ts';
import type { Rect } from '../gesture/view.ts';
import { type Room, effectiveDistance, viewOffset } from './room.ts';
import { PLUNGE_RATIO, dollyDistance, fovAt, fovBump } from './dive.ts';
import { Tilt } from './tilt.ts';
import { LongPath } from './arc.ts';
import { FOV, ORBIT_HOME_OMEGA, ORBIT_LIMIT, SHOTS, SHOT_MS, type Shot, type ShotName } from './shots.ts';

/** The lens swell in a plunge (dive.ts: 14 -> 35 degrees and back). OFF (20 Nov 2026, owner: the camera moves as 2D's do, 1:1; 2D has no lens): the dive is the distance and the framing alone. */
export const LENS_SWELL = false;
/** 2D's long-move pull-back (arc.ts). OFF (20 Nov 2026, owner: "zoom in and out should still be ONE shot, not zigzaggy"): a zoom out and in again inside one move reads as a zigzag. Every move is one continuous glide. */
export const LONG_ARC = false;

/** Radians of turn per pixel of drag. */
export const ORBIT_PER_PX = 0.006;
/** The most the free turn tilts up or down (radians): just short of straight over or under, where the camera's up would flip. */
export const PITCH_LIMIT = 1.45;
/** The tilt after a drag of `dy` CSS pixels (down = positive): the top of the figure comes toward the viewer. */
export const dragToPitch = (start: number, dy: number): number => start + dy * ORBIT_PER_PX;

/** The orbit angle after a drag of `dx` CSS pixels (positive = to the right) from `start`. The figure follows the finger or pointer: its front
 *  face moves the way the drag moves, which means the camera swings the other way, so yaw goes down as dx goes up. One rule for every input
 *  (touch, mouse, pen and trackpad all arrive as pointer events); Stage.tsx calls nothing else. */
export const dragToOrbit = (start: number, dx: number): number => start - dx * ORBIT_PER_PX;

/** The turn `t` ms after Fit started it home from `x0` (radians): a critically damped spring home to the shot, `(x0 (1 + ωs)) e^(-ωs)` with s in seconds. It never overshoots,
 *  is `x0` at 0 and settles (under a thousandth of a radian) in about 1.3 s at ORBIT_HOME_OMEGA. The gesture controller steps it on Fit (refit); this is the one place its shape lives. */
export const orbitHome = (x0: number, t: number, omega = ORBIT_HOME_OMEGA): number => {
  const s = Math.max(0, t) / 1000;
  return x0 * (1 + omega * s) * Math.exp(-omega * s);
};

export const easeInOutCubic =(t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** 2D's camera ease (src/ui/ease.js easeMove): the quintic smoothstep 6t⁵ − 15t⁴ + 10t³. Its speed and its acceleration both start and end at zero, so a long glide has no catch half way. */
export const easeMove = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (t * (6 * t - 15) + 10));
/** 2D's carry (ease.js carried, CARRY_MAX): a glide begun while another is still moving starts at the speed the view has, instead of from rest: p = ease(t) + c·t(1−t)², c the old speed in the new glide's own
 *  progress per glide, capped at 0.8 so the progress never passes 1 on the way. With c = 0 it is easeMove. */
export const CARRY_MAX = 0.8;
export const easeCarry = (t: number, c: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : Math.min(1, easeMove(t) + (c > 0 ? Math.min(c, CARRY_MAX) * t * (1 - t) * (1 - t) : 0)));
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Shortest way round between two angles, so a turn never spins the long way. */
export function lerpAngle(a: number, b: number, k: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

interface Pose { shot: Shot; room: Room }

const copyShot = (s: Shot): Shot => ({ yaw: s.yaw, pitch: s.pitch, r: s.r, target: [...s.target], half: [...s.half], ...(s.halfNarrow ? { halfNarrow: [...s.halfNarrow] as [number, number] } : {}) });
/** A blend's narrow-stage extents: only where one of the two shots has its own (a shot without one frames a phone as any other screen). */
const narrowOf = (a: Shot, b: Shot, f: (x: number, y: number) => number): { halfNarrow?: [number, number] } => {
  if (!a.halfNarrow && !b.halfNarrow) return {};
  const p = a.halfNarrow ?? a.half, q = b.halfNarrow ?? b.half;
  return { halfNarrow: [f(p[0], q[0]), f(p[1], q[1])] };
};
const copyRoom = (r: Room): Room => ({ ...r });

/** Beyond this ratio between two shots' distances the move is a dive (body to lobule is 200 to 1, lobule to sinusoid 20 to 1): see `blendPose`. */
export const DIVE_RATIO = 6;
const isDive = (a: Pose, b: Pose) => Math.max(a.shot.r, b.shot.r) / Math.max(1e-9, Math.min(a.shot.r, b.shot.r)) > DIVE_RATIO;

/** The pose halfway (k) between two: every field interpolated directly, so the camera goes straight from any view to any view with no
 *  fit-everything waypoint in between (Mohammad, 18 Nov).
 *  A dive (the two distances differ by more than DIVE_RATIO: into the liver, the lobule, the sinusoid, and back out) zooms the way the eye does: the distance and the
 *  framing change by the same ratio every moment (geometric, so the picture grows evenly instead of nothing happening and then a plunge at the end), and the aim
 *  settles on the target as the distance closes (the target's share is the distance covered), so the place dived to stays in the middle of the picture all the way. */
export function blendPose(a: Pose, b: Pose, k: number, arc = 1): Pose {
  if (isDive(a, b)) return blendDive(a, b, k, arc);
  return {
    shot: {
      yaw: lerpAngle(a.shot.yaw, b.shot.yaw, k), pitch: lerp(a.shot.pitch, b.shot.pitch, k), r: lerp(a.shot.r, b.shot.r, k),
      target: [lerp(a.shot.target[0], b.shot.target[0], k), lerp(a.shot.target[1], b.shot.target[1], k), lerp(a.shot.target[2], b.shot.target[2], k)],
      half: [lerp(a.shot.half[0], b.shot.half[0], k), lerp(a.shot.half[1], b.shot.half[1], k)],
      ...narrowOf(a.shot, b.shot, (x, y) => lerp(x, y, k)),
    },
    room: { x: lerp(a.room.x, b.room.x, k), y: lerp(a.room.y, b.room.y, k), w: lerp(a.room.w, b.room.w, k), h: lerp(a.room.h, b.room.h, k) },
  };
}

/** The cinematic arc of a dive: the camera swings a little to one side and rises as it plunges, then settles square on the place it dives to, instead of a straight push. A bell in k (zero at both ends, so a
 *  move that lands or starts leaves the shots' own yaw and pitch exactly; the same both ways, so the way out is the way in run backward). Its size grows with how deep the move goes (body to lobule 0.2 rad
 *  of yaw and 0.09 of pitch, lobule to sinusoid about half that); Reduce Motion passes `arc` 0. */
// (OFF in the rig since 20 Nov: the swing read as a zigzag; the rig passes arc 0. blendPose(…, arc = 1) still computes it for the test.)
export const ARC_YAW = 0.2, ARC_PITCH = 0.09;
export function arcBell(k: number): number { const s = Math.sin(Math.PI * Math.min(1, Math.max(0, k))); return s * s; }
export function arcSize(ra: number, rb: number): number {
  const ratio = Math.max(ra, rb) / Math.max(1e-9, Math.min(ra, rb));
  return Math.min(1, Math.log(ratio / DIVE_RATIO + 1) / Math.log(200 / DIVE_RATIO + 1));
}
const geo = (a: number, b: number, k: number) => (a > 0 && b > 0 ? a * Math.pow(b / a, k) : lerp(a, b, k));
function blendDive(a: Pose, b: Pose, k: number, arc = 1): Pose {
  const swing = arc * arcSize(a.shot.r, b.shot.r) * arcBell(k);
  const r = geo(a.shot.r, b.shot.r, k);
  // the share of the way the aim has gone: 0 at the start, 1 at the end, and most of it early when diving in (the distance is still large), so the target is centred before the close part
  const span = a.shot.r - b.shot.r;
  const q = Math.abs(span) < 1e-12 ? k : Math.min(1, Math.max(0, (a.shot.r - r) / span));
  return {
    shot: {
      yaw: lerpAngle(a.shot.yaw, b.shot.yaw, k) + ARC_YAW * swing, pitch: lerp(a.shot.pitch, b.shot.pitch, k) + ARC_PITCH * swing, r,
      target: [lerp(a.shot.target[0], b.shot.target[0], q), lerp(a.shot.target[1], b.shot.target[1], q), lerp(a.shot.target[2], b.shot.target[2], q)],
      half: [geo(a.shot.half[0], b.shot.half[0], k), geo(a.shot.half[1], b.shot.half[1], k)],
      ...narrowOf(a.shot, b.shot, (x, y) => geo(x, y, k)),
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
  /** The speed the move began with (easeCarry's slope): zero from a standstill. */
  private carry = 0;
  /** The progress the last frame was drawn at (the eased value the pose is at now). */
  private eNow = 0;
  /** 2D's long-move path (arc.ts) for this move, or null for the plain glide. */
  private long: LongPath | null = null;
  private readonly longPath = new LongPath();
  private active = false;
  private orbit = 0;
  private orbitFrom = 0;
  /** Where the turn is heading with the move in flight: 0 (a new shot starts square on), or where it stands when only the room changed (a card opened). */
  private orbitTo = 0;
  /** The viewer's tilt up or down (Settings > Tilt all around; zero otherwise), eased home with a new shot like the turn. */
  private pitchOrbit = 0;
  private pitchFrom = 0;
  private pitchTo = 0;
  /** The lens's share now (0 the long lens, 1 the widest, dive.ts), the share a move began with (a move reversed mid-plunge carries it, so the lens never jumps) and whether this move is a plunge into the figure. */
  private bump = 0;
  private bumpFrom = 0;
  private plunge = false;
  private width = 1;
  private height = 1;
  private dirty = true;
  private readonly pos = new Vector3();
  /** What the hand's pan and zoom keep on screen: the body plate, or (inside the liver) the lobule's or the sinusoid's own box. Its corners, in scene units. */
  private subject: readonly Vec3[] | null = null;
  /** The hand's view on top of the shot: zoom k (the camera's own zoom, about the projection centre) and a pan in canvas px. Identity = the shot's framing. */
  private hand: View = { k: 1, x: 0, y: 0 };
  private handFrom: View = { k: 1, x: 0, y: 0 };
  private handTween = false;
  private placedFirst = false;
  /** The plate the hand may pan the figure within (the body's plate, or the Circuit's map), as a rectangle in the plane at depth z. */
  private bounds: { x0: number; x1: number; y0: number; y1: number; z: number } = { ...PLATE_BOUNDS, z: FIGURE_Z };
  readonly reduceMotion: boolean;
  /** Whether the viewer may turn the figure without limit on both axes (Stage: the setting is on and the view is the body). */
  freeGate: (() => boolean) | null = null;
  get free(): boolean { return !!this.freeGate && this.freeGate(); }
  /** Gentle tilt (tilt.ts): a few degrees added to the shot's yaw and pitch when the camera is written, never kept in the hand's or the orbit's state. Square (zero) until Stage gives it a gate. */
  readonly tilt = new Tilt();
  /** What Stage says about the tilt: whether Settings > Figure depth has it on, and whether something other than a camera move holds it (a gesture, a view other than the body). */
  tiltGate: { on(): boolean; locked(): boolean } | null = null;
  /** True while the camera is written without the tilt (fitRect measures the shot's own framing). */
  private noTilt = false;
  /** The hand's zoom over the shot's own framing (1 as framed). */
  get handZoom(): number { return this.hand.k; }

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
  /** 2D's glide time (ease.js camMs): 480 ms up to half a screen of reach (the pan in screens wide and the zoom, a doubling counting half a screen), then in proportion, at most 900 ms; a dive (the distance changes by more than DIVE_RATIO) has the lobule's 1500 ms. */
  reachMs(shot: ShotName | Shot): number {
    const t = typeof shot === 'string' ? SHOTS[shot] : shot, a = this.cur.shot;
    const pan = Math.hypot(t.target[0] - a.target[0], t.target[1] - a.target[1]) / Math.max(1e-6, a.half[0] + t.half[0]);
    const zoom = Math.abs(Math.log(Math.max(1e-6, t.half[0]) / Math.max(1e-6, a.half[0]))) / (2 * Math.LN2);
    const dive = Math.max(a.r, t.r) / Math.max(1e-9, Math.min(a.r, t.r)) > DIVE_RATIO;
    return Math.round(Math.min(dive ? 1500 : 900, 480 * Math.max(1, Math.hypot(pan, zoom) / 0.5)));
  }
  /** The lens's field of view now (degrees): the long lens at rest, wider in the middle of a plunge. */
  get fov(): number { return fovAt(this.bump); }
  /** Whether the camera has its first real shot and room; nothing is drawn before. */
  get placed(): boolean { return this.placedFirst; }
  get pose(): Readonly<Pose> { return this.cur; }
  /** The room the camera is going to (or is in): what a layout decision reads, so it changes once as a card opens and not all along the glide. */
  get targetRoom(): Readonly<Room> { return this.to.room.w > 1 ? this.to.room : { x: 0, y: 0, w: this.width, h: this.height }; }

  /** Fly to a shot (and a room) in one straight move. Called again mid-flight, the new move starts from where the camera is now. */
  goTo(shot: ShotName | Shot, room: Room, now: number, ms = SHOT_MS, keepHand = false): void {
    const s = typeof shot === 'string' ? SHOTS[shot] : shot;
    // The first shot with a real room is where the camera starts, not somewhere it flies to: until then it has no pose worth showing (the constructor's
    // title shot filling a canvas that has no size yet), so it is put there at once and nothing is drawn before. (Mohammad, 19 Nov: the figure started at the
    // top left and zoomed in.)
    if (!this.placedFirst && room.w > 1 && room.h > 1) {
      this.placedFirst = true;
      this.cur = { shot: copyShot(s), room: copyRoom(room) };
      this.from = this.to = this.cur;
      this.orbit = this.orbitFrom = 0; this.active = false; this.handTween = false; this.dirty = true;
      return;
    }
    // retargeted in flight: carry the speed on (the old move's progress rate over what it had left, in the new move's own units), so nothing slows to a stop and starts again
    let carry = 0;
    if (this.active && this.dur > 0) {
      const k0 = Math.min(1, (now - this.t0) / this.dur), e0 = easeCarry(k0, this.carry), e1 = easeCarry(Math.min(1, k0 + 1e-3), this.carry);
      const left = 1 - e0, newDur = reducedMs(ms, this.reduceMotion || reduced());
      if (left > 1e-3 && newDur > 0) carry = Math.min(CARRY_MAX, Math.max(0, ((e1 - e0) / 1e-3 / this.dur) / left * newDur));
    }
    this.from = { shot: copyShot(this.cur.shot), room: copyRoom(this.cur.room) };
    this.to = { shot: copyShot(s), room: copyRoom(room) };
    this.carry = this.reduceMotion || reduced() ? 0 : carry;
    this.long = LONG_ARC && !isDive(this.from, this.to) && !(this.reduceMotion || reduced()) && this.longPath.fill(this.from.shot, this.to.shot, SHOTS.play.half[0] * 2).arc ? this.longPath : null;
    // a new shot takes the hand's zoom and pan back to the shot's own framing, in the same move
    this.handFrom = { ...this.hand };
    this.handTween = keepHand ? this.handTween : this.hand.k !== 1 || this.hand.x !== 0 || this.hand.y !== 0;
    // the lens: a plunge into the figure (the body to the lobule or the sinusoid, or back) widens it and narrows it again (dive.ts); Reduce Motion keeps the long lens throughout
    this.bumpFrom = this.bump;
    this.plunge = LENS_SWELL && !(this.reduceMotion || reduced()) && Math.max(this.from.shot.r, this.to.shot.r) / Math.max(1e-9, Math.min(this.from.shot.r, this.to.shot.r)) > PLUNGE_RATIO;
    this.t0 = now; this.eNow = 0;
    this.dur = reducedMs(ms * (this.long ? this.long.stretch : 1), this.reduceMotion || reduced());   // Reduce Motion: the glide keeps a short form, never a jump (a11y/motion.ts)
    this.orbitTo = keepHand ? (this.active ? this.orbitTo : this.orbit) : 0;
    this.orbitFrom = this.orbit;
    this.pitchTo = keepHand ? (this.active ? this.pitchTo : this.pitchOrbit) : 0;
    this.pitchFrom = this.pitchOrbit;
    this.active = true;
    this.dirty = true;
  }

  /** The cards changed room (a card opened, the phone turned): move the room alone, same curve; the hand's zoom and the viewer's turn stay (cards opening keep both). `homeTurn`: a guided step brings the turn home with the move. */
  setRoom(room: Room, now: number, ms?: number, homeTurn = false): void {
    // a card opening in the middle of a dive keeps the dive's own time: it lands when it was going to, in the new room (not a fresh 950 ms from a standstill)
    // a move in flight whose room alone changes (a card opening or closing): the same move, the same clock and the same curve, with only its destination room swapped, so the picture never stops or restarts
    if (this.active && ms == null && !homeTurn && this.dur > 0) {
      const e = this.eNow;
      if (e < 0.98) {
        const c = this.cur.room, r = room;
        this.from.room = { x: (c.x - e * r.x) / (1 - e), y: (c.y - e * r.y) / (1 - e), w: (c.w - e * r.w) / (1 - e), h: (c.h - e * r.h) / (1 - e) };
        this.to.room = copyRoom(room); this.dirty = true;
        return;
      }
    }
    const left = this.active ? Math.max(1, this.t0 + this.dur - now) : undefined;
    this.goTo(this.to.shot, room, now, ms ?? (left != null ? Math.max(left, 200) : undefined), true);
    // a guided step (a slide, a catheter step) that asks for the shot the camera is already on still brings the turn home: the viewer's angle is theirs only between guided poses
    if (homeTurn) this.orbitTo = 0;
  }

  /** Limited orbit by drag, ±25°, clamped. Returns true when it changed (a frame is needed). */
  setOrbit(rad: number): boolean {
    const o = this.free ? rad : Math.max(-ORBIT_LIMIT, Math.min(ORBIT_LIMIT, rad));
    if (o === this.orbit) return false;
    this.orbit = o; this.orbitFrom = o; this.orbitTo = o; this.dirty = true;
    return true;
  }
  get orbitAngle(): number { return this.orbit; }
  /** Tilt up or down by `rad` (only while the free turn is on; otherwise it stays square). Returns true when it changed. */
  setOrbitPitch(rad: number): boolean {
    const o = this.free ? Math.max(-PITCH_LIMIT, Math.min(PITCH_LIMIT, rad)) : 0;
    if (o === this.pitchOrbit) return false;
    this.pitchOrbit = o; this.pitchFrom = o; this.pitchTo = o; this.dirty = true;
    return true;
  }
  get pitchAngle(): number { return this.pitchOrbit; }
  /** The free turn was switched off: ease the turn and the tilt home (the pose and the hand stay). */
  levelOut(now: number): void {
    if (this.orbit === 0 && this.pitchOrbit === 0) return;
    this.goTo(this.to.shot, this.to.room, now, 500, true);
    this.orbitTo = 0; this.pitchTo = 0;
  }

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

  /** What the figure's edge is kept to: the body's plate, or the Circuit's map (the view calls this when it changes). */
  setBounds(b: { x0: number; x1: number; y0: number; y1: number; z: number }): void { this.bounds = { ...b }; }

  /** What the hand keeps on screen: the corners (scene units) of the view's subject, or null for the body plate (or the Circuit's map). The lobule and the sinusoid stand inside the liver, a
   *  hundred times smaller than the plate, so limits measured on the plate would drag them off (Mohammad, 19 Nov: the lobule "flings out of place" when panned or zoomed). */
  setSubject(corners: readonly Vec3[] | null): void { this.subject = corners; }

  /** The subject's rectangle on screen in the shot's own framing (hand at the fit): the bounds the hand may pan the figure within. */
  fitRect(): Rect {
    const keep = { ...this.hand };
    this.hand.k = 1; this.hand.x = 0; this.hand.y = 0;
    this.noTilt = true;   // what the fit measures never includes the tilt
    this.apply();
    this.noTilt = false;
    const b = this.bounds;
    const corners: readonly Vec3[] = this.subject ?? ([[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]] as const).map(([x, y]) => [x, y, b.z] as Vec3);
    const rect: Rect = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
    for (const [x, y, z] of corners) {
      const p = this.project(new Vector3(x, y, z));
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
      const e = easeCarry(k, this.carry);
      this.eNow = e;
      this.cur = blendPose(this.from, this.to, e, 0);
      if (this.long && e < 1) this.long.at(e, this.cur.shot);
      this.bump = fovBump(k, this.bumpFrom, this.plunge);
      // the orbit eases back to centre with the shot (a new shot always starts square on), but a change of room alone (a card opening) leaves the turn the viewer chose
      this.orbit = lerp(this.orbitFrom, this.orbitTo, e);
      this.pitchOrbit = lerp(this.pitchFrom, this.pitchTo, e);
      if (this.handTween) { lerpView(this.handFrom, { k: 1, x: 0, y: 0 }, e, this.hand); if (k >= 1) this.handTween = false; }
      if (k >= 1) this.active = false; else moving = true;
      this.dirty = true;
    }
    if (this.stepTilt(now)) moving = true;
    if (this.dirty) { this.apply(); this.dirty = false; }
    return moving;
  }

  /** One step of the gentle tilt: locked (easing to square) while a camera move runs or the gate says so; Reduce Motion or the switch off keeps it at zero with no easing. Returns true while it still eases. */
  private stepTilt(now: number): boolean {
    const t = this.tilt, g = this.tiltGate, yaw = t.yaw, pitch = t.pitch;
    const moving = g ? t.step(now, g.on(), this.reduceMotion || reduced(), this.active || g.locked()) : t.step(now, false, true, true);
    if (t.yaw !== yaw || t.pitch !== pitch) this.dirty = true;
    return moving;
  }

  private apply(): void {
    const { shot, room } = this.cur;
    const w = this.width, h = this.height;
    const fov = fovAt(this.bump);
    // (the dolly zoom: as the lens widens the camera comes in by the same ratio, so what the dive aims at keeps its size and the world opens round it)
    const r = dollyDistance(effectiveDistance(shot, room.w > 1 ? room : { x: 0, y: 0, w, h }, h, w), fov);
    this.camera.fov = fov;
    // the tilt is added here, at render time, on top of the shot and the viewer's turn; `project` and every pick use this same camera, so tags and taps agree with what is drawn
    const yaw = shot.yaw + this.orbit + (this.noTilt ? 0 : this.tilt.yaw), pitch = shot.pitch + this.pitchOrbit + (this.noTilt ? 0 : this.tilt.pitch);
    const cp = Math.cos(pitch);
    const [tx, ty, tz] = shot.target;
    this.pos.set(tx + Math.sin(yaw) * cp * r, ty + Math.sin(pitch) * r, tz + Math.cos(yaw) * cp * r);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(tx, ty, tz);
    const off = viewOffset(room.w > 1 ? room : { x: 0, y: 0, w, h }, w, h);
    // near and far follow the distance, so a dive from the body to a sinusoid (a few hundred to one) keeps its depth precision and nothing is cut early
    this.camera.near = Math.max(1e-6, r * 0.02); this.camera.far = r * 120;
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
