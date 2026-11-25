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
import { slideSpanOf, stepOf, wholeViewOf, zoomShare } from './slide-time.ts';
import type { ChasePose } from './chase.ts';
import { FOV, ORBIT_HOME_OMEGA, ORBIT_LIMIT, TILT_LIMIT, TURN_LIMIT_DEG, SHOTS, SHOT_MS, type Shot, type ShotName } from './shots.ts';

/** The lens swell in a plunge (dive.ts: 14 -> 35 degrees and back). OFF (20 Nov 2026, owner: the camera moves as 2D's do, 1:1; 2D has no lens): the dive is the distance and the framing alone. */
export const LENS_SWELL = false;
/** 2D's long-move pull-back (arc.ts). OFF (20 Nov 2026, owner: "zoom in and out should still be ONE shot, not zigzaggy"): a zoom out and in again inside one move reads as a zigzag. Every move is one continuous glide. */
export const LONG_ARC = false;
/** How quickly the aim eases after a followed point (ms): about a third of a second, so a moving tip is followed as one smooth glide, never in steps. */
export const FOLLOW_TAU_MS = 350;
/** The chase camera (chase.ts) comes in and goes out over this long (ms), eased; its pose follows the catheter with a short lag (CHASE_TAU_MS) so a bend never jerks it. */
export const CHASE_MS = 900, CHASE_TAU_MS = 180;

/** Radians of turn per pixel of drag. */
export const ORBIT_PER_PX = 0.006;
/** The most the free turn tilts up or down (radians): just short of straight over or under, where the camera's up would flip. */
export { TILT_LIMIT as PITCH_LIMIT } from './shots.ts';
/** The inspector's tilt stops here (88 degrees): straight up or down the camera has no up vector. */
export const INSPECT_PITCH = (88 * Math.PI) / 180;
/** A soft stop at ±lim: follows the hand exactly up to 70% of the limit, then eases into it (never a hard wall). Exact in the middle, so taking hold again never jumps there. */
export const softLimit = (x: number, lim: number): number => {
  const a = Math.abs(x), k = 0.7 * lim;
  return a <= k ? x : Math.sign(x) * (k + (lim - k) * Math.tanh((a - k) / (lim - k)));
};
/** A turn kept in (-π, π]: the same direction, the short way round. */
export const wrapTurn = (x: number): number => (Math.abs(x) <= Math.PI ? x : x - 2 * Math.PI * Math.round(x / (2 * Math.PI)));
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
/** The carry of a glide begun while another is moving (2D's idea, ease.js carried: start at the speed the view has, not from rest). 2D adds c·t(1−t)² to the ease and caps c at 0.8 so the progress never passes 1; that cap cannot hold a
 *  fast move's speed across a retarget (the camera following a catheter tip, a slide changed mid-move), so the speed dipped at every retarget and the picture pulsed. Here the progress is the cubic Hermite from 0 to 1 that starts with slope c and ends at
 *  rest (never reverses for c up to 3), blended into easeMove so a carry of 0 is exactly 2D's curve and a small one is 2D's too. */
export const CARRY_MAX = 3;
export const easeCarry = (t: number, c: number): number => {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  if (!(c > 0)) return easeMove(t);
  const m = Math.min(c, CARRY_MAX), t2 = t * t, t3 = t2 * t;
  const hermite = (t3 - 2 * t2 + t) * m + (3 * t2 - 2 * t3);
  const w = Math.min(1, m / 0.8);   // (a carry of 0.8 or more is all Hermite; a smaller one eases in from the quintic)
  return Math.min(1, Math.max(0, easeMove(t) * (1 - w) + hermite * w));
};
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

/** Shortest way round between two angles, so a turn never spins the long way. */
export function lerpAngle(a: number, b: number, k: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

interface Pose { shot: Shot; room: Room }

const copyShot = (s: Shot): Shot => ({ yaw: s.yaw, pitch: s.pitch, r: s.r, target: [...s.target], half: [...s.half], ...(s.roll ? { roll: s.roll } : {}), ...(s.halfNarrow ? { halfNarrow: [...s.halfNarrow] as [number, number] } : {}) });
/** A blend's narrow-stage extents: only where one of the two shots has its own (a shot without one frames a phone as any other screen). */
/** The points a move keeps inside the room: the ones of the end it is nearer (the in-flight distance is the even glide between the two ends' own, so only the rest pose reads them). */
const keepOf = (a: Shot, b: Shot, k: number): { keep?: Shot['keep'] } => { const s = k >= 0.5 ? b : a; return s.keep ? { keep: s.keep } : {}; };
const narrowOf = (a: Shot, b: Shot, f: (x: number, y: number) => number): { halfNarrow?: [number, number] } => {
  if (!a.halfNarrow && !b.halfNarrow) return {};
  const p = a.halfNarrow ?? a.half, q = b.halfNarrow ?? b.half;
  return { halfNarrow: [f(p[0], q[0]), f(p[1], q[1])] };
};
const copyRoom = (r: Room): Room => ({ ...r });
/** A blend's roll: the two shots' rolls on the move's own eased share, so the picture turns in the same move that zooms and pans it (the lobule and the sinusoid turn together, Mohammad 20 Nov 2026). Left out when
 *  both are square (exact at both ends: a move lands on its shot's own roll to the last digit). */
const rollOf = (a: Shot, b: Shot, k: number): { roll?: number } => {
  const p = a.roll ?? 0, q = b.roll ?? 0;
  if (p === 0 && q === 0) return {};
  return { roll: k <= 0 ? p : k >= 1 ? q : lerp(p, q, k) };
};

/** Beyond this ratio between two shots' distances the move is a dive (body to lobule is 200 to 1, lobule to sinusoid 20 to 1): see `blendPose`. */
export const DIVE_RATIO = 6;
/** A shot at least this far (scene units) is a body shot: a dive in from it keeps the view (plan 30). */
const BODY_R_MIN = 0.5;
const sameShot = (a: Shot, b: Shot): boolean => Math.abs(a.r - b.r) < 1e-9 && a.target.every((v, i) => Math.abs(v - b.target[i]!) < 1e-9) && Math.abs(a.half[0] - b.half[0]) < 1e-9 && Math.abs(a.half[1] - b.half[1]) < 1e-9;
const isDive = (a: Pose, b: Pose) => Math.max(a.shot.r, b.shot.r) / Math.max(1e-9, Math.min(a.shot.r, b.shot.r)) > DIVE_RATIO;

/** The pose halfway (k) between two: every field interpolated directly, so the camera goes straight from any view to any view with no
 *  fit-everything waypoint in between (Mohammad, 18 Nov).
 *  A dive (the two distances differ by more than DIVE_RATIO: into the liver, the lobule, the sinusoid, and back out) zooms the way the eye does: the distance and the
 *  framing change by the same ratio every moment (geometric, so the picture grows evenly instead of nothing happening and then a plunge at the end), and the aim
 *  settles on the target as the distance closes (the target's share is the distance covered), so the place dived to stays in the middle of the picture all the way. */
/** A shot may fit one side only (half 0 on the other: the sinusoid fits its short side, 2D's rule). For blending, the free side takes the extent the room's shape gives the fitted one,
 *  which frames the shot exactly the same at the end. Blending a 0 straight (geo falls back to a line to 0) made the fit distance sag and then collapse near the end of the move: the camera
 *  ran 2.2x closer in one frame as the Lobule -> Sinusoid zoom landed (and the same going out). */
function fillHalf(p: Pose): Pose {
  const h = p.shot.half, w = p.room.w > 1 ? p.room.w : 1, ht = p.room.h > 1 ? p.room.h : 1;
  if ((h[0] > 0) === (h[1] > 0)) return p;
  const half: [number, number] = h[0] > 0 ? [h[0], (h[0] * ht) / w] : [(h[1] * w) / ht, h[1]];
  return { shot: { ...p.shot, half }, room: p.room };
}
/** What the even glide needs to know about a move's zoom: the camera's distance at its two ends (as the room fits them) and the pixels one scene unit spans at distance 1 (the lens). */
export interface ZoomEnds { da: number; db: number; px?: number }
/** The even glide (2D cam-arc.js lerpInto, STG-4): the zoom runs on a log scale, so it neither rushes at one end nor crawls at the other, and the aim and the room go with the ZOOM's share (not the clock's)
 *  so that every point of the figure travels a straight line on the screen: a point's place is `o + p·s`, the zoom `s` is linear in the share q by its definition, and the offset `o` (the room's middle
 *  less the aim times the zoom) is made linear in q too, which gives the aim as 2D's pan: it is derived from the offsets, not interpolated itself (interpolated, it bows every point's path).
 *  Linear in the distance (what this did until 20 Nov) zoomed in with a rush at its end, out with a rush at its start, and curved the paths. `z`: the move's zoom ends (rig.zoomEnds); without it the shots' own
 *  `r`, and the aim goes with the share q directly. Angles stay linear (a turn is not a zoom). */
export function blendPose(a0: Pose, b0: Pose, k: number, arc = 1, z?: ZoomEnds): Pose {
  const a = fillHalf(a0), b = fillHalf(b0);
  if (isDive(a, b)) return blendDive(a, b, k, arc, z);
  const da = z?.da ?? a.shot.r, db = z?.db ?? b.shot.r, q = zoomShare(da, db, k);
  const room = { x: lerp(a.room.x, b.room.x, q), y: lerp(a.room.y, b.room.y, q), w: lerp(a.room.w, b.room.w, q), h: lerp(a.room.h, b.room.h, q) };
  const ta = a.shot.target, tb = b.shot.target;
  let tx = lerp(ta[0], tb[0], q), ty = lerp(ta[1], tb[1], q);
  if (z?.px && z.px > 0 && da > 0 && db > 0 && a.room.w > 1 && b.room.w > 1) {
    // the aim that keeps each point's screen offset linear in q: o = Rc ∓ T·s (x: room middle less aim·s; y is flipped), then T back from the offset at this q
    const sa = z.px / da, sb = z.px / db, s = sa + (sb - sa) * q;
    const cx = (r: Room) => r.x + r.w / 2, cy = (r: Room) => r.y + r.h / 2;
    const oxa = cx(a.room) - ta[0] * sa, oxb = cx(b.room) - tb[0] * sb, oya = cy(a.room) + ta[1] * sa, oyb = cy(b.room) + tb[1] * sb;
    tx = (cx(room) - lerp(oxa, oxb, q)) / s; ty = (lerp(oya, oyb, q) - cy(room)) / s;
  }
  return {
    shot: {
      yaw: lerpAngle(a.shot.yaw, b.shot.yaw, k), pitch: lerp(a.shot.pitch, b.shot.pitch, k), r: geo(a.shot.r, b.shot.r, k),
      target: [tx, ty, lerp(ta[2], tb[2], q)],
      half: [geo(a.shot.half[0], b.shot.half[0], k), geo(a.shot.half[1], b.shot.half[1], k)],
      ...rollOf(a.shot, b.shot, k),
      ...narrowOf(a.shot, b.shot, (x, y) => geo(x, y, k)),
      ...keepOf(a.shot, b.shot, k),
    },
    // (a move that is not a dive: the room goes with the zoom's share q, as blendDive's does)
    room,
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
const geo = (a: number, b: number, k: number) => (k <= 0 ? a : k >= 1 ? b : a > 0 && b > 0 ? a * Math.pow(b / a, k) : lerp(a, b, k));   // (exact at both ends: a move lands on its shot to the last digit)
/** The room's share in a dive (blendDive's q) at the pose `c` between `a` and `b`. */
function roomShareOf(a: Pose, b: Pose, c: Pose): number { return diveRoomShare(a.shot.r, b.shot.r, c.shot.r); }
/** The room's share in a dive with the camera at distance r (a.r to b.r): the zoom's own share, log(a/r) / log(a/b), the same both ways. Tied to the aim's share q (21539e4) the room and the aim
 *  ran on different profiles and pulled the place dived to one way and back on screen (the zoom out of the sinusoid zigzagged); on the zoom's share it moves one way. tests/camera-one-shot.test.ts traces it. */
export function diveRoomShare(ra: number, rb: number, r: number): number {
  const span = ra - rb;
  if (Math.abs(span) < 1e-12 || !(r > 0)) return 1;
  return Math.min(1, Math.max(0, Math.log(ra / r) / Math.log(ra / rb)));
}
function blendDive(a: Pose, b: Pose, k: number, arc = 1, z?: ZoomEnds): Pose {
  const swing = arc * arcSize(a.shot.r, b.shot.r) * arcBell(k);
  const r = geo(a.shot.r, b.shot.r, k);
  // the share of the way the aim has gone: 0 at the start, 1 at the end, and most of it early when diving in (the distance is still large), so the target is centred before the close part
  const span = a.shot.r - b.shot.r;
  const q = Math.abs(span) < 1e-12 ? k : Math.min(1, Math.max(0, (a.shot.r - r) / span));
  // The camera's roll turns the picture about the AIM (the room's middle). The aim is still some way from the place dived to for most of the dive (it settles as the distance closes), so a roll
  // run on top swings that place round the middle in an arc: on a portrait screen the lobule to sinusoid dive sent the sinusoid up and out and back (24 Nov: "crazy places before landing"). The
  // offset between the aim and the place is turned the other way by the roll (about the view axis, the plane's x and y at the dive's square view), so on screen the place keeps the straight
  // line it has without a roll and the picture turns about it. Exact at both ends (the offset is nil at the landing, the roll nil at the start of a move that is not rolled).
  const rl = rollOf(a.shot, b.shot, k).roll ?? 0;
  // the place dived to (going in) or from (coming out) is the closer end's aim, `c`; the other end's aim, `far`, is where the camera starts looking (or ends)
  const inNow = a.shot.r >= b.shot.r, c = inNow ? b.shot : a.shot, far = inNow ? a.shot : b.shot;
  // (inside the liver, lobule <-> sinusoid, the offset is let go as ONE glide on the move's own eased share, not on the distance's share q: q keeps the place nearly where it stood for most of the zoom and then sends it across the
  //  screen in the last third, a lurch. The place's screen offset is the world offset over the camera's distance, so the world offset is the far end's, times the share left and r / far.r.)
  const inside = Math.max(a.shot.r, b.shot.r) < BODY_R_MIN, kc = inNow ? k : 1 - k, sk = kc;   // (k is already the move's eased share, and the room's centre goes with it (diveRoomShare is k here), so the place's screen offset is linear in it: one straight line)
  // (the distance the camera is REALLY at is the room's fit of the shot's extents, not the shot's own r: the offset on screen is over that, so the ends' fitted distances (z) stand in for r)
  const dEnd = z && z.da > 0 && z.db > 0 ? (inNow ? z.da : z.db) : far.r, dNow = z && z.da > 0 && z.db > 0 ? geo(z.da, z.db, k) : r;
  const w = inside ? ((1 - sk) * dNow) / dEnd : inNow ? 1 - q : q;
  let dx = w * (far.target[0] - c.target[0]), dy = w * (far.target[1] - c.target[1]);
  if (rl !== 0) { const cs = Math.cos(rl), sn = Math.sin(rl); [dx, dy] = [dx * cs - dy * sn, dx * sn + dy * cs]; }
  return {
    shot: {
      yaw: lerpAngle(a.shot.yaw, b.shot.yaw, k) + ARC_YAW * swing, pitch: lerp(a.shot.pitch, b.shot.pitch, k) + ARC_PITCH * swing, r,
      target: [c.target[0] + dx, c.target[1] + dy, lerp(a.shot.target[2], b.shot.target[2], q)],
      half: [geo(a.shot.half[0], b.shot.half[0], k), geo(a.shot.half[1], b.shot.half[1], k)],
      ...rollOf(a.shot, b.shot, k),
      ...narrowOf(a.shot, b.shot, (x, y) => geo(x, y, k)),
      ...keepOf(a.shot, b.shot, k),
    },
    room: (() => { const m = diveRoomShare(a.shot.r, b.shot.r, r); return { x: lerp(a.room.x, b.room.x, m), y: lerp(a.room.y, b.room.y, m), w: lerp(a.room.w, b.room.w, m), h: lerp(a.room.h, b.room.h, m) }; })(),
  };
}

/** One owner of the camera. The clock calls `update(now)` once per frame, in its order (engine, tweens, camera, render, tags), and keeps
 *  asking for frames while it returns true. */
export class CameraRig {
  readonly camera = new PerspectiveCamera(FOV, 1, 0.1, 100);
  private from: Pose;
  private to: Pose;
  private cur: Pose;
  /** The move's own clock (2D createSlideClock): ms into the move, advanced each frame by what the frame took but never by more than STEP_MAX, so a stalled frame pauses the move where it stood instead of landing the next part of it in one jump. -1 `lastT`: the first frame draws the start. */
  private at = 0;
  private lastT = -1;
  private dur = 0;
  /** The camera's distance at the move's two ends as the room fits them: what the even glide's zoom share is measured on (blendPose). */
  private zoomEnds: ZoomEnds | null = null;
  /** The camera's distance now while a plain (not a dive) move is in flight: the move's zoom as ONE geometric glide between the two ends' distances (2D's even glide, `geo(da, db, share)`), or 0 (the pose's own `effectiveDistance`:
   *  at rest, in a dive, and at the move's landing, where the two are the same number). The pose's own is the farther of `r` and what its two half extents need, each blended on its own, so it is not monotone: when the
   *  fitting axis changes between two shots (one frames the height, the next the width) the distance dipped between them, a zoom in and back out inside one move: the zigzag (22 Nov). tests/camera-slide-paths.test.ts. */
  private distNow = 0;
  /** The speed the move began with (easeCarry's slope): zero from a standstill. */
  private carry = 0;
  /** The progress the last frame was drawn at (the eased value the pose is at now). */
  private eNow = 0;
  /** A point the aim follows (the catheter's tip on the way in), or null. Smoothed, never a restart: while a move is on its way its destination drifts to the point, and once it lands the aim eases after it. */
  private followAt: [number, number, number] | null = null;
  private followT = 0;
  /** A move retargeted in flight starts with the velocity it had (a Hermite curve for the aim and the width: the curve bends toward the new target instead of stopping at a corner); null from a standstill. */
  private hv: { x: number; y: number; lh: number } | null = null;
  /** The aim's speed per ms (x, y in world units, lh the log of the framing's width), sampled each frame of a move: what a retarget carries on. */
  private readonly vel = { on: false, t: 0, x: 0, y: 0, lh: 0 };
  private velLast = { t: 0, x: 0, y: 0, lh: 0, ok: false };
  /** 2D's long-move path (arc.ts) for this move, or null for the plain glide. */
  private long: LongPath | null = null;
  private readonly longPath = new LongPath();
  /** What the last frame advanced the move's clock by, ms. */
  private step = 0;
  private active = false;
  /** The curve of a move that brings its own (a time-lapse's slow push: 2D's driftEase); null for the plain glide's easeCarry. */
  private easeFn: ((k: number) => number) | null = null;
  private orbit = 0;
  private orbitFrom = 0;
  /** Where the turn is heading with the move in flight: 0 (a new shot starts square on), or where it stands when only the room changed (a card opened). */
  private orbitTo = 0;
  /** The viewer's tilt up or down (within TILT_LIMIT, where the gate allows; zero otherwise), eased home with a new shot like the turn. */
  private pitchOrbit = 0;
  private pitchFrom = 0;
  private pitchTo = 0;
  /** The lens's share now (0 the long lens, 1 the widest, dive.ts), the share a move began with (a move reversed mid-plunge carries it, so the lens never jumps) and whether this move is a plunge into the figure. */
  private bump = 0;
  private bumpFrom = 0;
  private plunge = false;
  /** The share of the way the room has gone in the move now (see update). */
  private roomP = 0;
  /** The room size the camera's distance is fitted to (owner, 20 Nov: opening a card or a sheet never zooms the figure out, it only pans it into the free room). Only an explicit fit, a
   *  goTo (a view, a slide, a test's own shot, Fit), sets it; a change of room alone (setRoom) moves the picture's centre into the new room and keeps this, so the zoom stays. */
  private scaleFrom = { w: 0, h: 0 };
  private scaleTo = { w: 0, h: 0 };
  private scaleNow = { w: 0, h: 0 };
  private keepScale = false;
  /** The room size the distance is fitted to now (debug: pps.rig). */
  get fitSize(): { w: number; h: number } { return { ...this.scaleNow }; }
  private lateRoom: { from: Room; e0: number } | null = null;
  private width = 1;
  private height = 1;
  private dirty = true;
  private readonly pos = new Vector3();
  /** Where the eye would be with the shot's own yaw and pitch only (no orbit, tilt or inspector turn): it follows every shot change and dolly on the camera's own easing; the hand's zoom and pan are projection changes and do not move it. */
  readonly restEye = new Vector3();
  /** How far the eye is turned off `restEye` about the target, 0 (at rest) to 1 (TURN_LIMIT_DEG or more). */
  offRest = 0;
  private readonly offA = new Vector3();
  private readonly offB = new Vector3();
  /** What the hand's pan and zoom keep on screen: the body plate, or (inside the liver) the lobule's or the sinusoid's own box. Its corners, in scene units. */
  private subject: readonly Vec3[] | null = null;
  /** The hand's view on top of the shot: zoom k (the camera's own zoom, about the projection centre) and a pan in canvas px. Identity = the shot's framing. */
  private hand: View = { k: 1, x: 0, y: 0 };
  private handFrom: View = { k: 1, x: 0, y: 0 };
  private handTween = false;
  /** A dive that starts with the hand's zoom or pan off the fit (the viewer is zoomed in on another part of the figure): the place dived to (a world point), where it stands on screen now against where the
   *  camera alone would put it (px), and the hand's zoom. The hand's way home is then not on the clock but follows the dive (`stepDiveHand`), so the place dived to only ever goes one way. */
  private diveHand: { p: Vector3; sx: number; sy: number; lx: number; ly: number; k0: number; k1: number } | null = null;
  /** Where the hand ends this move: home, or (a dive back out to the view he left) the hand view he had when he went in. */
  private handEnd: View = { k: 1, x: 0, y: 0 };
  /** The body view he dived from (plan 30): the shot, the hand's zoom and pan and his turn and tilt. A dive back out to the same shot lands on it, not on the fit. */
  private kept: { shot: Shot; hand: View; orbit: number; pitch: number } | null = null;
  /** Forget the kept body view (a reset, a slide to another camera or a preset change). */
  dropKept(): void { this.kept = null; }
  private placedFirst = false;
  /** The plate the hand may pan the figure within (the body's plate, or the Circuit's map), as a rectangle in the plane at depth z. */
  private bounds: { x0: number; x1: number; y0: number; y1: number; z: number } = { ...PLATE_BOUNDS, z: FIGURE_Z };
  readonly reduceMotion: boolean;
  /** The chase camera's pose to be at (null: none). Engaged, the picture is the chase's, eased in from the shot the camera is on; the room's centring and the hand's zoom stay. */
  private chaseGoal: ChasePose | null = null;
  private chaseCur: ChasePose | null = null;
  private chaseK = 0;
  private chaseT = 0;
  private chaseMoving = false;
  setChase(p: ChasePose | null): void {
    this.chaseGoal = p;
    if (p && !this.chaseCur) this.chaseCur = { yaw: p.yaw, pitch: p.pitch, dist: p.dist, fov: p.fov, target: [p.target[0], p.target[1], p.target[2]] };
    this.dirty = true;
  }
  /** One frame of the chase: its share eases to 1 (or 0) over CHASE_MS, and its pose follows the goal with a short lag. True while either is still going. */
  private stepChase(now: number): boolean {
    const g = this.chaseGoal, c = this.chaseCur;
    if (!c) { this.chaseT = 0; this.chaseMoving = false; return false; }
    const dt = this.chaseT > 0 ? Math.min(100, Math.max(0, now - this.chaseT)) : 16;
    this.chaseT = now;
    const instant = this.reduceMotion || reduced();
    const goal = g ? 1 : 0, kStep = instant ? 1 : dt / CHASE_MS;
    this.chaseK = goal > this.chaseK ? Math.min(goal, this.chaseK + kStep) : Math.max(goal, this.chaseK - kStep);
    let busy = this.chaseK !== goal;
    if (g) {
      const k = instant ? 1 : 1 - Math.exp(-dt / CHASE_TAU_MS);
      const dy = g.yaw - c.yaw, dp = g.pitch - c.pitch, dd = Math.log(g.dist / c.dist), df = g.fov - c.fov;
      const dx = g.target[0] - c.target[0], dyy = g.target[1] - c.target[1], dz = g.target[2] - c.target[2];
      if (Math.abs(dy) + Math.abs(dp) + Math.abs(dd) + Math.abs(df) + Math.hypot(dx, dyy, dz) > 1e-4) {
        c.yaw += dy * k; c.pitch += dp * k; c.dist *= Math.exp(dd * k); c.fov += df * k; c.target[0] += dx * k; c.target[1] += dyy * k; c.target[2] += dz * k;
        busy = true;
      } else { c.yaw = g.yaw; c.pitch = g.pitch; c.dist = g.dist; c.fov = g.fov; c.target[0] = g.target[0]; c.target[1] = g.target[1]; c.target[2] = g.target[2]; }
    }
    if (this.chaseK <= 0 && !g) { this.chaseCur = null; this.chaseT = 0; }
    this.chaseMoving = busy;
    if (busy || this.chaseK > 0) this.dirty = true;
    return busy;
  }
  /** Follow a world point with the aim (null stops following). */
  follow(p: readonly [number, number, number] | null): void {
    this.followAt = p ? [p[0], p[1], p[2]] : null;
    if (p) this.dirty = true;
  }
  /** Whether the viewer may turn the figure without limit on both axes (Stage: the setting is on and the view is the body). */
  freeGate: (() => boolean) | null = null;
  get free(): boolean { return this.inspectOn || (!!this.freeGate && this.freeGate()); }

  // ── THE INSPECTOR'S TURN (`?inspect`, src/ui/debug/inspect): the figure turned round without limit, on top of the shot's own turn and tilt, never kept in the hand's or the shot's state. While it is on, the gestures' turn and tilt
  //    land HERE (setOrbit, setOrbitPitch, orbitAngle and pitchAngle answer for it), nothing springs home by itself (the gesture controller's `holdTurn`), and a view button or Reset eases to its angle on the clock. Off: nothing of this runs. ──
  private inspectOn_ = false;
  private inspectYaw = 0;
  private inspectPitch = 0;
  private inspectGoal: { yaw: number; pitch: number } | null = null;
  private inspectT = 0;
  get inspectOn(): boolean { return this.inspectOn_; }
  /** Turns the inspector's turn on or off. Off, it eases back to square on the clock (the angles are kept until then, so nothing jumps). */
  setInspect(on: boolean): void {
    if (this.inspectOn_ === on) return;
    this.inspectOn_ = on;
    if (!on) this.inspectGoal = { yaw: 0, pitch: 0 };
    this.inspectT = 0; this.dirty = true;
  }
  /** The inspector's turn and tilt now (radians). */
  get inspectAngles(): { yaw: number; pitch: number } { return { yaw: this.inspectYaw, pitch: this.inspectPitch }; }
  /** Eases the inspector's turn to (yaw, pitch) (radians; the tilt stops short of straight up and down, where the camera has no up). The turn takes the short way round. */
  inspectTo(yaw: number, pitch: number): void {
    const d = yaw - this.inspectYaw, wrapped = this.inspectYaw + Math.atan2(Math.sin(d), Math.cos(d));
    this.inspectGoal = { yaw: wrapped, pitch: Math.max(-INSPECT_PITCH, Math.min(INSPECT_PITCH, pitch)) };
    this.inspectT = 0; this.dirty = true;
  }
  /** One step of the inspector's ease toward its goal (a smoothed approach, never a snap); true while it still goes. */
  private stepInspect(now: number): boolean {
    const g = this.inspectGoal;
    if (!g) { this.inspectT = 0; return false; }
    const dt = this.inspectT > 0 ? Math.min(100, Math.max(0, now - this.inspectT)) : 16, k = this.reduceMotion || reduced() ? 1 : 1 - Math.exp(-dt / 120);
    this.inspectT = now;
    this.inspectYaw += (g.yaw - this.inspectYaw) * k; this.inspectPitch += (g.pitch - this.inspectPitch) * k;
    this.dirty = true;
    if (Math.abs(g.yaw - this.inspectYaw) < 1e-4 && Math.abs(g.pitch - this.inspectPitch) < 1e-4) { this.inspectYaw = g.yaw; this.inspectPitch = g.pitch; this.inspectGoal = null; this.inspectT = 0; return false; }
    return true;
  }
  /** Gentle tilt (tilt.ts): a few degrees added to the shot's yaw and pitch when the camera is written, never kept in the hand's or the orbit's state. Square (zero) until Stage gives it a gate. */
  readonly tilt = new Tilt();
  /** What Stage says about the tilt: whether Settings > Figure depth has it on, and whether something other than a camera move holds it (a gesture, a view other than the body). */
  tiltGate: { on(): boolean; locked(): boolean } | null = null;
  /** True while the camera is written without the tilt (fitRect measures the shot's own framing). */
  private noTilt = false;
  /** The hand's zoom over the shot's own framing (1 as framed). */
  get handZoom(): number { return this.hand.k; }
  /** How much closer the camera is than the whole-figure framing in the room it is fitted to (1: the whole figure is framed, 2: twice as close), the hand's zoom included: what the organ veil's curves are in (organ-veil/config.ts). */
  get zoomOverWhole(): number { return this.zoomW; }
  private zoomW = 1;

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

  get isMoving(): boolean { return this.active || this.chaseMoving; }
  /** 2D's glide time (ease.js camMs): 480 ms up to half a screen of reach (the pan in screens wide and the zoom, a doubling counting half a screen), then in proportion, at most 900 ms; a dive (the distance changes by more than DIVE_RATIO) has the lobule's 1500 ms. */
  reachMs(shot: ShotName | Shot): number {
    const { d, dive } = this.reach(shot);
    return Math.round(Math.min(dive ? 1500 : 900, 480 * Math.max(1, d / 0.5)));
  }
  /** A deck slide's glide time (2D planSlide: slideMs clamped to 800 to 1400 ms, where `reachMs` is a hand's glide at 480 to 900): the move is longer, "a third of a screen in 480 ms read as a swoop". A dive keeps its own
   *  length (reachMs's 1500; the dive times are the owner's call, 20 Nov: kept as 3D has them). */
  slideMs(shot: ShotName | Shot): number {
    const { d, dive } = this.reach(shot);
    return dive ? this.reachMs(shot) : slideSpanOf(d);
  }
  /** How far a move to `shot` goes on screen, in 2D's units (the pan in screens wide, the zoom with a doubling counting half a screen, combined), and whether it is a dive. */
  private reach(shot: ShotName | Shot): { d: number; dive: boolean } {
    const t = typeof shot === 'string' ? SHOTS[shot] : shot, a = this.cur.shot;
    const pan = Math.hypot(t.target[0] - a.target[0], t.target[1] - a.target[1]) / Math.max(1e-6, a.half[0] + t.half[0]);
    const zoom = Math.abs(Math.log(Math.max(1e-6, t.half[0]) / Math.max(1e-6, a.half[0]))) / (2 * Math.LN2);
    return { d: Math.hypot(pan, zoom), dive: Math.max(a.r, t.r) / Math.max(1e-9, Math.min(a.r, t.r)) > DIVE_RATIO };
  }
  /** The move's zoom ends: the camera's distance at its start and end as the room fits them, and the lens's pixels per unit (blendPose's even glide). */
  private measureZoom(live = false): ZoomEnds {
    return { da: live && this.distNow > 0 ? this.distNow : effectiveDistance(this.from.shot, this.scaleFrom, this.height, this.width), db: effectiveDistance(this.to.shot, this.scaleTo, this.height, this.width), px: this.height / (2 * Math.tan((FOV * Math.PI) / 360)) };
  }
  /** The hand view that frames the whole figure (`whole`: the body's play shot, the Circuit's whole map) in the room the camera is fitted to, seen from the shot it is going to; null when that shot already is it.
   *  What the hand's zoom limits and its zoomed-out resting place are measured on (2D measures them on the whole plate: scene/gesture/view.ts zoomLimits). */
  wholeView(whole: Shot): View | null {
    const sc = this.scaleTo.w > 1 ? this.scaleTo : this.targetRoom;
    return wholeViewOf(this.to.shot, whole, sc, this.height, this.width);
  }
  /** The lens's field of view now (degrees): the long lens at rest, wider in the middle of a plunge. */
  get fov(): number { return fovAt(this.bump); }
  /** Whether the camera has its first real shot and room; nothing is drawn before. */
  get placed(): boolean { return this.placedFirst; }
  get pose(): Readonly<Pose> { return this.cur; }
  /** The room the camera's distance is fitted to (the scale room), which is not always the room the picture is centred in: a room change alone keeps the zoom (setRoom). Anything that judges "where the camera is framed" (the dive's blur and fades) reads this, never targetRoom. */
  get fitRoom(): Readonly<Room> { return this.scaleTo.w > 1 ? { x: 0, y: 0, w: this.scaleTo.w, h: this.scaleTo.h } : this.targetRoom; }
  /** The room the camera is going to (or is in): what a layout decision reads, so it changes once as a card opens and not all along the glide. */
  get targetRoom(): Readonly<Room> { return this.to.room.w > 1 ? this.to.room : { x: 0, y: 0, w: this.width, h: this.height }; }

  /** Fly to a shot (and a room) in one straight move. Called again mid-flight, the new move starts from where the camera is now. */
  goTo(shot: ShotName | Shot, room: Room, now: number, ms = SHOT_MS, keepHand = false, ease: ((k: number) => number) | null = null): void {
    const s = typeof shot === 'string' ? SHOTS[shot] : shot;
    if (!keepHand) this.followAt = null;   // a new shot ends a follow (the caller that wants one asks again after it)
    // The first shot with a real room is where the camera starts, not somewhere it flies to: until then it has no pose worth showing (the constructor's
    // title shot filling a canvas that has no size yet), so it is put there at once and nothing is drawn before. (Mohammad, 19 Nov: the figure started at the
    // top left and zoomed in.)
    if (!this.placedFirst && room.w > 1 && room.h > 1) {
      this.placedFirst = true;
      this.cur = { shot: copyShot(s), room: copyRoom(room) };
      this.from = this.to = this.cur;
      this.scaleFrom = { w: room.w, h: room.h }; this.scaleTo = { w: room.w, h: room.h }; this.scaleNow = { w: room.w, h: room.h };
      this.orbit = this.orbitFrom = 0; this.active = false; this.distNow = 0; this.handTween = false; this.dirty = true;
      return;
    }
    // retargeted in flight: carry the speed on, 2D's carryRate: the view's speed (the aim in screens a second, the zoom with a doubling counting half a screen) projected on the way to the new framing,
    // in the new glide's own progress per glide, so nothing slows to a stop and starts again whatever the new target is
    let carry = 0;
    const newDur = reducedMs(ms, this.reduceMotion || reduced());
    if (this.active && this.vel.on && now - this.vel.t < 80 && newDur > 0) {
      const a = this.cur.shot, w = Math.max(1e-6, a.half[0] + s.half[0]);
      const T0 = Math.log(Math.max(1e-6, s.half[0]) / Math.max(1e-6, a.half[0])) / (2 * Math.LN2), T1 = (s.target[0] - a.target[0]) / w, T2 = (s.target[1] - a.target[1]) / w;
      const tt = T0 * T0 + T1 * T1 + T2 * T2;
      if (tt > 1e-12) carry = Math.min(CARRY_MAX, Math.max(0, ((this.vel.lh / (2 * Math.LN2)) * T0 + (this.vel.x / w) * T1 + (this.vel.y / w) * T2) / tt * newDur));
    }
    let hv: { x: number; y: number; lh: number } | null = null;
    if (this.active && this.vel.on && now - this.vel.t < 80 && newDur > 0 && !(this.reduceMotion || reduced())) {
      const a = this.cur.shot, dx = s.target[0] - a.target[0], dy = s.target[1] - a.target[1], dl = Math.log(Math.max(1e-6, s.half[0]) / Math.max(1e-6, a.half[0]));
      let vx = this.vel.x * newDur, vy = this.vel.y * newDur, vl = this.vel.lh * newDur;
      const w = a.half[0] + s.half[0], mv = Math.hypot(vx / w, vy / w, vl / (2 * Math.LN2)), md = Math.hypot(dx / w, dy / w, dl / (2 * Math.LN2));
      if (mv > 1e-9 && md > 1e-9) {
        // only the part of the speed that already heads to the new framing is carried, along the straight way there: the path stays one straight shot. Carrying the whole
        // velocity (sideways or backwards parts too) bent the path out and back, the zigzag of a slide that retargets while the camera still moves (outline -> first slide).
        const along = ((vx / w) * (dx / w) + (vy / w) * (dy / w) + (vl / (2 * Math.LN2)) * (dl / (2 * Math.LN2))) / (md * md);
        if (along > 1e-6) {
          const f = Math.min(along, 2.5);   // (never carry so much that the curve overshoots its target)
          hv = { x: dx * f, y: dy * f, lh: dl * f };
        } else {
          // the new framing is behind or beside the way it was going: a straight line would stop dead (a jolt), so the old speed runs out over one short bulge (half the speed it had,
          // never more than the old cap) and the camera turns back once, smoothly: one bend, never a zig and a zag
          const f = Math.min(0.5, (2.5 * md) / mv);
          hv = { x: vx * f, y: vy * f, lh: vl * f };
        }
      }
    }
    // a move with a curve of its own (a slow push) is one straight, even glide from where the camera stands: no carried speed, no long arc, no stretch
    if (ease) { carry = 0; hv = null; }
    this.hv = hv;
    this.easeFn = ease;
    // a dive between the lobule and the sinusoid from a standstill takes the gentler cubic ease: the quintic packs its middle (where the sinusoid crossfades over the lobule, share 0.42 to
    // 0.86) into a quarter of the move, which read as a cut; the cubic spends a third of it there (with DIVE_SINUSOID_MS, about 0.6 s)
    if (!ease && carry === 0 && !hv && isDive(this.from, this.to) && Math.max(this.from.shot.r, this.to.shot.r) / Math.max(1e-12, Math.min(this.from.shot.r, this.to.shot.r)) < PLUNGE_RATIO) this.easeFn = (k: number) => k * k * (3 - 2 * k);
    this.from = { shot: copyShot(this.cur.shot), room: copyRoom(this.cur.room) };
    this.to = { shot: copyShot(s), room: copyRoom(room) };
    this.scaleFrom = { ...this.scaleNow };
    if (!this.keepScale || !(this.scaleTo.w > 1)) this.scaleTo = { w: room.w, h: room.h };
    if (!(this.scaleFrom.w > 1)) this.scaleFrom = { ...this.scaleTo };
    this.carry = this.reduceMotion || reduced() ? 0 : carry;
    this.long = LONG_ARC && !ease && !isDive(this.from, this.to) && !(this.reduceMotion || reduced()) && this.longPath.fill(this.from.shot, this.to.shot, SHOTS.play.half[0] * 2).arc ? this.longPath : null;
    // a new shot takes the hand's zoom and pan back to the shot's own framing, in the same move
    this.handFrom = { ...this.hand };
    const diving = isDive(this.from, this.to), still = !(this.reduceMotion || reduced());
    // plan 30: a dive in from the body keeps the body view (hand, turn, tilt); the dive back out to that same shot lands on it
    if (diving && !keepHand && this.from.shot.r > this.to.shot.r && this.from.shot.r > BODY_R_MIN) this.kept = { shot: copyShot(this.from.shot), hand: { ...this.hand }, orbit: this.orbit, pitch: this.pitchOrbit };
    const back = diving && !keepHand && this.from.shot.r < this.to.shot.r && this.kept && sameShot(this.kept.shot, this.to.shot) ? this.kept : null;
    this.handEnd = back ? { ...back.hand } : { k: 1, x: 0, y: 0 };
    const endHome = this.handEnd.k === 1 && this.handEnd.x === 0 && this.handEnd.y === 0;
    this.handTween = keepHand ? this.handTween : this.hand.k !== 1 || this.hand.x !== 0 || this.hand.y !== 0 || !endHome;
    // the lens: a plunge into the figure (the body to the lobule or the sinusoid, or back) widens it and narrows it again (dive.ts); Reduce Motion keeps the long lens throughout
    this.bumpFrom = this.bump;
    this.plunge = LENS_SWELL && !(this.reduceMotion || reduced()) && Math.max(this.from.shot.r, this.to.shot.r) / Math.max(1e-9, Math.min(this.from.shot.r, this.to.shot.r)) > PLUNGE_RATIO;
    this.zoomEnds = this.measureZoom(this.active);   // (a move retargeted in flight starts from the distance the camera is really at: distNow)
    this.at = carry > 0 || hv || (this.active && this.vel.on) ? 16 : 0; this.lastT = -1; this.eNow = 0; this.roomP = 0; this.lateRoom = null;   // (carrying speed: the first frame is one frame in, so the retarget frame is not a stand-still)
    this.dur = reducedMs(ms * (this.long ? this.long.stretch : 1), this.reduceMotion || reduced());   // Reduce Motion: the glide keeps a short form, never a jump (a11y/motion.ts)
    this.orbitTo = keepHand ? (this.active ? this.orbitTo : this.orbit) : 0;
    this.orbitFrom = this.orbit;
    this.pitchTo = keepHand ? (this.active ? this.pitchTo : this.pitchOrbit) : 0;
    this.pitchFrom = this.pitchOrbit;
    if (back) { this.orbitTo = back.orbit; this.pitchTo = back.pitch; }
    this.diveHand = this.handTween && diving && still ? this.startDiveHand() : null;
    this.active = true;
    this.dirty = true;
  }

  /** The cards changed room (a card opened, the phone turned): move the room alone, same curve; the hand's zoom and the viewer's turn stay (cards opening keep both). `homeTurn`: a guided step brings the turn home with the move. */
  setRoom(room: Room, now: number, ms?: number, homeTurn = false, refit = false, ease: ((k: number) => number) | null = null): void {
    // a card opening in the middle of a dive keeps the dive's own time: it lands when it was going to, in the new room (not a fresh 950 ms from a standstill)
    // a move in flight whose room alone changes (a card opening or closing): the same move, the same clock and the same curve, with only its destination room swapped, so the picture never stops or restarts
    if (refit) { this.scaleTo = { w: room.w, h: room.h }; this.zoomEnds = this.measureZoom(); }
    if (this.active && ms == null && !homeTurn && this.dur > 0) {
      // (the room's own share, not the clock's: in a dive the room follows the aim (q). Rebuilding it with the clock's share made the picture jump each time a card arrived mid-dive,
      //  a zoom-out and a shift right per card: the Lobule -> Sinusoid staircase)
      const e = this.roomP;
      if (e >= 0.98 && this.eNow < 0.98) {
        // (in a dive diving in, the room's share runs ahead of the clock: it can be home while the move still has a while to go. Rebuilding from a share that near 1 would throw
        //  the room far off; instead the rest of the room's way runs on the move's own clock from where it is, so it lands with the move, and nothing jumps)
        this.lateRoom = { from: copyRoom(this.cur.room), e0: this.eNow };
        this.to.room = copyRoom(room); this.dirty = true;
        return;
      }
      if (e < 0.98) {
        const c = this.cur.room, r = room;
        this.from.room = { x: (c.x - e * r.x) / (1 - e), y: (c.y - e * r.y) / (1 - e), w: (c.w - e * r.w) / (1 - e), h: (c.h - e * r.h) / (1 - e) };
        this.to.room = copyRoom(room); this.dirty = true;
        return;
      }
    }
    const left = this.active ? Math.max(1, this.dur - this.at) : undefined;
    // (a room change alone keeps the zoom: the camera only pans into the new room. A guided step (homeTurn: a slide on the same shot) is an explicit fit and may refit)
    this.keepScale = !homeTurn && !refit;
    this.goTo(this.to.shot, room, now, ms ?? (left != null ? Math.max(left, 200) : undefined), true, ease);
    this.keepScale = false;
    // a guided step (a slide, a catheter step) that asks for the shot the camera is already on still brings the turn home: the viewer's angle is theirs only between guided poses
    if (homeTurn) this.orbitTo = 0;
  }

  /** Orbit by drag: ±25° clamped, or all the way round in free exploration. Returns true when it changed (a frame is needed). */
  setOrbit(rad: number): boolean {
    if (this.inspectOn_) { if (rad === this.inspectYaw && !this.inspectGoal) return false; this.inspectYaw = rad; this.inspectGoal = null; this.dirty = true; return true; }   // (the inspector's turn has no limit)
    // free exploration (the body and the lobule, not in a talk): a full turn all the way round the vertical axis, no stop (owner, 25 Nov: "allow me to tilt more, 360 in horizontal axis"); the angle is kept in (-180°, 180°] so Fit's spring takes the short way home. Elsewhere ±25° with the soft stop.
    const o = this.free ? wrapTurn(rad) : softLimit(rad, ORBIT_LIMIT);
    if (o === this.orbit) return false;
    this.orbit = o; this.orbitFrom = o; this.orbitTo = o; this.dirty = true;
    return true;
  }
  get orbitAngle(): number { return this.inspectOn_ ? this.inspectYaw : this.orbit; }
  /** Tilt up or down by `rad` (only while the free turn is on; otherwise it stays square). Returns true when it changed. */
  setOrbitPitch(rad: number): boolean {
    if (this.inspectOn_) { const p = Math.max(-INSPECT_PITCH, Math.min(INSPECT_PITCH, rad)); if (p === this.inspectPitch && !this.inspectGoal) return false; this.inspectPitch = p; this.inspectGoal = null; this.dirty = true; return true; }
    const o = this.free ? softLimit(rad, TILT_LIMIT) : 0;
    if (o === this.pitchOrbit) return false;
    this.pitchOrbit = o; this.pitchFrom = o; this.pitchTo = o; this.dirty = true;
    return true;
  }
  get pitchAngle(): number { return this.inspectOn_ ? this.inspectPitch : this.pitchOrbit; }
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
  // ── THE BOOT REVEAL (splash plan A2, 22 Nov): the figure settles in from a camera a little closer than rest, by the rig's own glide, so every frame is drawn crisp at full resolution (the CSS scale of the canvas it
  //    replaces stretched a finished bitmap) and the labels follow by projection. `primeSettle` puts the closer view in under the splash; `settle` (the lift) glides it home on the hand's own return. ──
  private settleK = 0;
  /** Under the splash: the camera `k` times closer than rest (a hand zoom), unseen behind the cover. Not with Reduce Motion, and not over a move or a hand already in play. */
  primeSettle(k: number): boolean {
    if (this.reduceMotion || reduced() || !this.placedFirst || this.active || this.handTween || this.hand.k !== 1 || this.hand.x !== 0 || this.hand.y !== 0) return false;
    this.hand.k = k; this.settleK = k; this.dirty = true;
    return true;
  }
  /** The lift: the primed zoom glides home over `ms`. Does nothing when nothing was primed or the camera was moved since (a start that never primed, a resize that refitted under the cover): no jump to the closer view. */
  settle(now: number, ms: number, ease: (k: number) => number): boolean {
    const k = this.settleK; this.settleK = 0;
    if (!k || this.active || this.hand.k !== k || this.hand.x !== 0 || this.hand.y !== 0) return false;
    this.handTween = true;
    this.goTo(this.to.shot, this.to.room, now, ms, true, ease);
    return true;
  }
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

  /** Where a world point stands on the canvas (px) with the hand view `h` and the camera as it is now; the hand and the camera are left as they were. */
  private placeWith(p: Vector3, h: View): { x: number; y: number } {
    const keep = { ...this.hand };
    this.hand.k = h.k; this.hand.x = h.x; this.hand.y = h.y;
    this.apply();
    const at = this.project(p);
    this.hand.k = keep.k; this.hand.x = keep.x; this.hand.y = keep.y;
    this.apply();
    return at;
  }
  /** A dive begins with the viewer zoomed or panned elsewhere (22 Nov: "many lobules sweep across the screen"). The hand's way home ran on the clock (lerpView) while the dive's own aim and distance ran on the
   *  distance's share: the two never agreed, so the place dived to (which may start off screen) swung across the picture and the neighbours with it. Here the hand's offset is taken from the place dived to
   *  (the closer end's aim, or the one the dive is already going to) and let go with the dive's own share: the place goes where the camera alone would put it, plus the offset it had, run out linearly. */
  private startDiveHand(): { p: Vector3; sx: number; sy: number; lx: number; ly: number; k0: number; k1: number } | null {
    if (!(this.width > 1) || !(this.height > 1)) return null;
    const near = this.to.shot.r <= this.from.shot.r;
    const t = near ? this.to.shot.target : (this.diveHand?.p ? ([this.diveHand.p.x, this.diveHand.p.y, this.diveHand.p.z] as const) : this.from.shot.target);
    const p = new Vector3(t[0], t[1], t[2]);
    const s0 = this.placeWith(p, this.hand), l = this.placeAtEnd(p, this.handEnd);
    if (![s0.x, s0.y, l.x, l.y].every(Number.isFinite)) return null;
    return { p, sx: s0.x, sy: s0.y, lx: l.x, ly: l.y, k0: this.hand.k, k1: this.handEnd.k };
  }
  /** Where a world point lands with the hand `h` when this move has ended (the end pose, room, turn and lens), then the rig is put back as it was. */
  private placeAtEnd(p: Vector3, h: View): { x: number; y: number } {
    const keep = { cur: this.cur, sn: this.scaleNow, bump: this.bump, dn: this.distNow, o: this.orbit, po: this.pitchOrbit };
    this.cur = { shot: copyShot(this.to.shot), room: copyRoom(this.to.room) }; this.scaleNow = { ...this.scaleTo }; this.bump = 0; this.distNow = 0; this.orbit = this.orbitTo; this.pitchOrbit = this.pitchTo;
    const at = this.placeWith(p, h);
    this.cur = keep.cur; this.scaleNow = keep.sn; this.bump = keep.bump; this.distNow = keep.dn; this.orbit = keep.o; this.pitchOrbit = keep.po;
    this.apply();
    return at;
  }
  /** One frame of that hand: the zoom runs on the dive's share m (geometric, as the lens does) from where it was to where it ends, and the pan is solved so the place dived to stands at S(t) = lerp(where it stood, where the
   *  landing frames it, the move's own eased share): one path, monotone, so nothing he looks at lurches sideways (plan 30: the old offset ran out linearly in the camera's distance, 93 % of it in the first part of a 200:1 dive). */
  private stepDiveHand(m: number): void {
    const d = this.diveHand!, h = this.hand;
    h.k = 1; h.x = 0; h.y = 0;
    this.apply();
    const n = this.project(d.p), k = d.k0 * Math.pow(d.k1 / d.k0, m), cx = this.width / 2, cy = this.height / 2, e = Math.min(1, Math.max(0, this.eNow));
    h.k = k;
    // (the screen's place of a point is the centre + k · (its place with the hand home less the centre) + (k - 1) · the room's offset + the pan. Three scales the window's offset by the zoom, so the pan is not
    //  zoomed but the room's centring is: with the room not centred on the canvas (cards on a side or the top) the old centre + k · (...) + pan missed (k - 1) · offset, 5 x 70 px = 350 px at zoom 6 on an iPad: the
    //  place dived to jumped on the first frame and flew off its way, 23 Nov "zooming into the wrong place when zoomed into a different area")
    const off = viewOffset(this.cur.room.w > 1 ? this.cur.room : { x: 0, y: 0, w: this.width, h: this.height }, this.width, this.height);
    h.x = d.sx + (d.lx - d.sx) * e - cx - k * (n.x - cx) - (k - 1) * off.x;
    h.y = d.sy + (d.ly - d.sy) * e - cy - k * (n.y - cy) - (k - 1) * off.y;
  }

  /** The aim and the width of a retargeted move on a cubic Hermite from where it was, starting at the speed it had and ending at rest. */
  private hermiteAim(k: number): number {
    const hv = this.hv!, a = this.from.shot, b = this.to.shot, c = this.cur.shot, k2 = k * k, k3 = k2 * k;
    const h01 = 3 * k2 - 2 * k3, h10 = k3 - 2 * k2 + k;
    c.target[0] = a.target[0] + (b.target[0] - a.target[0]) * h01 + hv.x * h10;
    c.target[1] = a.target[1] + (b.target[1] - a.target[1]) * h01 + hv.y * h10;
    const la = Math.log(Math.max(1e-6, a.half[0])), lb = Math.log(Math.max(1e-6, b.half[0])), lc = la + (lb - la) * h01 + hv.lh * h10;
    const q = Math.abs(lb - la) > 1e-6 ? Math.min(1, Math.max(0, (lc - la) / (lb - la))) : this.eNow, f = Math.exp(lc - la);
    c.half[0] = a.half[0] * f;
    c.half[1] = (a.half[1] + (b.half[1] - a.half[1]) * q) * (c.half[0] / (a.half[0] + (b.half[0] - a.half[0]) * q));
    c.r = a.r * Math.pow(b.r / a.r, q);
    return q;
  }
  private sampleVel(now: number, step: number): void {
    const c = this.cur.shot, L = this.velLast, lh = Math.log(Math.max(1e-6, c.half[0]));
    // (the speed is what the picture moved per ms of the move's own clock: a stalled frame moved it by STEP_MAX, not by the wall time it took)
    if (L.ok && now > L.t && now - L.t < 100 && step > 0) { const dt = step; this.vel.x = (c.target[0] - L.x) / dt; this.vel.y = (c.target[1] - L.y) / dt; this.vel.lh = (lh - L.lh) / dt; this.vel.t = now; this.vel.on = true; }
    L.t = now; L.x = c.target[0]; L.y = c.target[1]; L.lh = lh; L.ok = true;
  }
  /** Steps the tween and writes the camera. Returns true while the camera is still moving (the clock needs another frame). */
  update(now: number): boolean {
    let moving = false;
    if (this.active) {
      // the move's own clock: this frame adds what it took, at most STEP_MAX (2D createSlideClock). A move with a curve of its own (a time-lapse's push, which has to end with the days) keeps the wall clock.
      const dt = this.lastT >= 0 ? Math.max(0, now - this.lastT) : 0;
      this.lastT = now;
      this.step = this.easeFn ? dt : stepOf(dt);
      this.at += this.step;
      const k = this.dur <= 0 ? 1 : Math.min(1, this.at / this.dur);
      const e = this.easeFn ? this.easeFn(k) : easeCarry(k, this.carry);
      this.eNow = e;
      this.cur = blendPose(this.from, this.to, e, 0, this.zoomEnds ?? undefined);
      // the share of the way the room has gone (blendPose: the zoom's share, in a dive the aim's share q): what setRoom must rebuild a retargeted room from, or the picture jumps
      this.roomP = isDive(this.from, this.to) ? roomShareOf(this.from, this.to, this.cur) : zoomShare(this.zoomEnds?.da ?? this.from.shot.r, this.zoomEnds?.db ?? this.to.shot.r, e);
      this.scaleNow = { w: lerp(this.scaleFrom.w, this.scaleTo.w, this.roomP), h: lerp(this.scaleFrom.h, this.scaleTo.h, this.roomP) };
      if (this.lateRoom) {   // a card that came after the room had all but arrived (see setRoom): the room goes the rest of the way on the clock, from where it was
        const L = this.lateRoom, u = easeMove(Math.min(1, Math.max(0, (e - L.e0) / Math.max(1e-6, 1 - L.e0)))), c = this.cur.room = copyRoom(this.cur.room), b = this.to.room;
        c.x = lerp(L.from.x, b.x, u); c.y = lerp(L.from.y, b.y, u); c.w = lerp(L.from.w, b.w, u); c.h = lerp(L.from.h, b.h, u);
      }
      const z = this.zoomEnds, zq = this.hv && e < 1 ? this.hermiteAim(k) : e;
      this.distNow = !isDive(this.from, this.to) && z && z.da > 0 && z.db > 0 && e < 1 ? geo(z.da, z.db, zq) : 0;
      this.sampleVel(now, this.step);
      if (this.long && e < 1) this.long.at(e, this.cur.shot);
      this.bump = fovBump(k, this.bumpFrom, this.plunge);
      // the orbit eases back to centre with the shot (a new shot always starts square on), but a change of room alone (a card opening) leaves the turn the viewer chose
      this.orbit = lerp(this.orbitFrom, this.orbitTo, e);
      this.pitchOrbit = lerp(this.pitchFrom, this.pitchTo, e);
      if (this.handTween) {
        if (this.diveHand) this.stepDiveHand(this.roomP); else lerpView(this.handFrom, this.handEnd, e, this.hand);
        if (k >= 1) { this.handTween = false; this.diveHand = null; this.hand.k = this.handEnd.k; this.hand.x = this.handEnd.x; this.hand.y = this.handEnd.y; }
      }
      if (k >= 1) this.active = false; else moving = true;
      this.dirty = true;
    }
    if (this.followAt) {
      const f = this.followAt;
      if (this.active) { this.to.shot.target[0] = f[0]; this.to.shot.target[1] = f[1]; this.to.shot.target[2] = f[2]; moving = true; }
      else {
        const dt = this.followT > 0 ? Math.min(100, Math.max(0, now - this.followT)) : 16, k = this.reduceMotion || reduced() ? 1 : 1 - Math.exp(-dt / FOLLOW_TAU_MS), t = this.cur.shot.target;
        const dx = f[0] - t[0], dy = f[1] - t[1], dz = f[2] - t[2];
        if (Math.hypot(dx, dy, dz) > 1e-5) { t[0] += dx * k; t[1] += dy * k; t[2] += dz * k; this.dirty = true; moving = true; }
      }
      this.followT = now;
    } else this.followT = 0;
    if (this.stepChase(now)) moving = true;
    if (this.stepTilt(now)) moving = true;
    if (this.stepInspect(now)) moving = true;
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
    let fov = fovAt(this.bump);
    // (the dolly zoom: as the lens widens the camera comes in by the same ratio, so what the dive aims at keeps its size and the world opens round it)
    const sc = this.scaleNow.w > 1 ? { x: 0, y: 0, w: this.scaleNow.w, h: this.scaleNow.h } : room.w > 1 ? room : { x: 0, y: 0, w, h };
    let r = dollyDistance(this.distNow > 0 ? this.distNow : effectiveDistance(shot, sc, h, w), fov);
    // the chase camera (chase.ts): the pose of the shot the camera is on, mixed toward the catheter's chase by its eased share
    const cc = this.chaseCur, ck = cc ? easeMove(this.chaseK) : 0;
    let shotYaw = shot.yaw, shotPitch = shot.pitch, aim = shot.target;
    if (cc && ck > 0) {
      shotYaw = lerp(shotYaw, cc.yaw, ck); shotPitch = lerp(shotPitch, cc.pitch, ck); fov = lerp(fov, cc.fov, ck); r = geo(r, cc.dist, ck);
      aim = [lerp(aim[0], cc.target[0], ck), lerp(aim[1], cc.target[1], ck), lerp(aim[2], cc.target[2], ck)];
    }
    this.zoomW = (effectiveDistance(SHOTS.play, sc, h, w) / Math.max(r, 1e-9)) * this.hand.k;
    this.camera.fov = fov;
    // the tilt is added here, at render time, on top of the shot and the viewer's turn; `project` and every pick use this same camera, so tags and taps agree with what is drawn
    // (the viewer's turn and tilt are about the SCREEN's axes: a rolled camera (the sinusoid on a portrait screen) carries them round with the roll, so a drag to the right still swings the picture to the right)
    const roll = shot.roll ?? 0, oy = this.orbit + (this.noTilt ? 0 : this.tilt.yaw + this.inspectYaw), op = this.pitchOrbit + (this.noTilt ? 0 : this.tilt.pitch + this.inspectPitch);
    const cr = Math.cos(roll), sr = Math.sin(roll);
    const yaw = shotYaw + (roll === 0 ? oy : cr * oy - sr * op), pitch = shotPitch + (roll === 0 ? op : sr * oy + cr * op);
    const cp = Math.cos(pitch);
    const [tx, ty, tz] = aim;
    this.pos.set(tx + Math.sin(yaw) * cp * r, ty + Math.sin(pitch) * r, tz + Math.cos(yaw) * cp * r);
    this.camera.position.copy(this.pos);
    const cps = Math.cos(shotPitch);
    this.restEye.set(tx + Math.sin(shotYaw) * cps * r, ty + Math.sin(shotPitch) * r, tz + Math.cos(shotYaw) * cps * r);
    const a = this.offA.set(this.pos.x - tx, this.pos.y - ty, this.pos.z - tz), b = this.offB.set(this.restEye.x - tx, this.restEye.y - ty, this.restEye.z - tz), la = a.length(), lb = b.length();
    this.offRest = la > 0 && lb > 0 ? Math.min(1, Math.acos(Math.min(1, Math.max(-1, a.dot(b) / (la * lb)))) / ((TURN_LIMIT_DEG * Math.PI) / 180)) : 0;
    this.camera.lookAt(tx, ty, tz);
    if (roll !== 0) this.camera.rotateZ(roll);   // (about its own view axis, after the aim: the whole picture turns, the lobule and the sinusoid with it)
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
