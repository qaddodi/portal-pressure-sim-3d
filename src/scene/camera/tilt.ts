// Gentle tilt (depth upgrade 3, owner-approved exception to match-2D, 19 Nov 2026; parallax rebuild 28 Nov 2026, docs/approved/tilt-parallax.md): the figure turns a few degrees toward the pointer
// on a laptop; on a phone or tablet it counter-rotates against the device (parallax: it stays where it is in space behind the glass), so the depth
// reads. It is an OFFSET ADDED to the rig's yaw and pitch when the camera is written (rig.apply) and is never stored in the
// hand's or the orbit's state, so Fit, Home and refit still return to the exact rest view and what the fit computes is measured without it (rig.fitRect).
// This file is pure (no DOM, no three): the target from an input, the easing, the clamp and the locks. The listeners are in tilt-input.ts.

/**
 *The device's parallax is a window (owner, 28 Nov: "the glass of the iPhone is looking at a 3D structure ... locked in space tilt wise"): the figure
 * counter-rotates by the device's own turn, 1:1 past a soft dead zone, up to this angle each way. 5 is the most the 40 px station margin allows on every
 * slide with every vein still 8 px on an iPhone (6 pulls sites/healthy under 8 px; tests/camera-framing-rules.test.ts). The pointer's lean on a laptop
 * keeps the limits below.
 */
export const DEVICE_CAP_DEG = 20;
/**
 * TRIAL (owner, 28 Nov: "Make it 20 degrees both horizontal and vertical just to test it out"): the cap is 20 for a test while the room solver still frames for the decided 5, so past 5 a label can
 * come inside its 40 px margin. Setting DEVICE_CAP_DEG back to FRAMING_TILT_DEG ends the trial.
 */
export const FRAMING_TILT_DEG = 5;
export const FRAMING_TILT_RAD = (FRAMING_TILT_DEG * Math.PI) / 180;
/** The pointer's largest turn each way, radians: 3.5° of yaw, 2.5° of pitch (owner: at most about 3 to 4 and 2 to 3). */
export const TILT_YAW_MAX = (3.5 * Math.PI) / 180;
export const TILT_PITCH_MAX = (2.5 * Math.PI) / 180;
export const DEVICE_YAW_MAX = (DEVICE_CAP_DEG * Math.PI) / 180;
export const DEVICE_PITCH_MAX = DEVICE_YAW_MAX;
/** Time constant of the ease toward a target (ms), and of the faster ease to zero while locked (a gesture, a shot) or when the input has gone. */
export const TILT_TAU_IN = 160;
export const TILT_TAU_OUT = 140;
/** Under this distance (radians, about 0.011°, under a pixel on the figure) the tilt has arrived and no more frames are asked for. */
export const TILT_EPS = 2e-4;
/** A phone's tilt: the range of device angle that makes a full tilt (degrees), the dead zone round the held position, and how fast the held position follows a steady hand (ms). */
export const DEVICE_DEAD = 1.0;
export const DEVICE_RANGE = DEVICE_CAP_DEG + DEVICE_DEAD;
export const DEVICE_BASE_TAU = 30000;
/** A change of the unit input smaller than this does not wake the clock (a phone in a hand never sits still); the input uses `wakeStep` for the stage it is on. */
export const WAKE_STEP = 0.01;
/**
 * The unit change that moves the figure's largest on-screen point by half a pixel on a stage of this size (the figure's edge stands about half the short
 * side off the aim, and a full tilt turns it by DEVICE_YAW_MAX).
 */
export function wakeStep(w: number, h: number): number {
  const reach = (Math.min(w, h) / 2) * Math.sin(DEVICE_YAW_MAX);
  return reach > 0 ? Math.min(0.06, Math.max(WAKE_STEP, 0.5 / reach)) : WAKE_STEP;
}

export interface Unit { x: number; y: number }
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** The pointer's place over the window as a unit square, -1 to 1 each way, y positive down; 0 at the middle. */
export function pointerUnit(x: number, y: number, w: number, h: number): Unit {
  if (!(w > 0) || !(h > 0)) return { x: 0, y: 0 };
  return { x: clamp((x - w / 2) / (w / 2), -1, 1), y: clamp((y - h / 2) / (h / 2), -1, 1) };
}

type Quat = readonly [number, number, number, number];   // x, y, z, w
const qmul = (a: Quat, b: Quat): Quat => [
  a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
  a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
  a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
  a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2],
];
const qconj = (q: Quat): Quat => [-q[0], -q[1], -q[2], q[3]];
const qnorm = (q: Quat): Quat => { const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1; return [q[0] / l, q[1] / l, q[2] / l, q[3] / l]; };

/**
 * A device's orientation as a quaternion, the W3C way: Z by alpha, then X by beta, then Y by gamma (degrees in). It turns device axes into earth axes,
 * and it has no singular point, unlike beta and gamma read on their own near upright.
 */
export function deviceQuat(alpha: number, beta: number, gamma: number): Quat {
  const r = Math.PI / 360, [ca, sa, cb, sb, cg, sg] = [Math.cos(alpha * r), Math.sin(alpha * r), Math.cos(beta * r), Math.sin(beta * r), Math.cos(gamma * r), Math.sin(gamma * r)];
  return qmul(qmul([0, 0, sa, ca], [sb, 0, 0, cb]), [0, sg, 0, cg]);
}

/**
 * How far the device has turned from the held orientation, as a turn about the held device's own x and y axes (degrees): rx is the top edge coming
 * toward the viewer, ry is the right edge going away.
 */
export function turnBetween(held: Quat, now: Quat): { rx: number; ry: number } {
  let q = qmul(qconj(held), now);
  if (q[3] < 0) q = [-q[0], -q[1], -q[2], -q[3]];
  const s = Math.hypot(q[0], q[1], q[2]);
  if (s < 1e-9) return { rx: 0, ry: 0 };
  const k = ((2 * Math.atan2(s, q[3])) * 180) / Math.PI / s;
  return { rx: q[0] * k, ry: q[1] * k };
}

/**
 * The turn about the SCREEN's axes: `angle` is the screen's own turn (0, 90, 180, 270; the device turned counter-clockwise by it), so the screen's right
 * is the device's y turned the same way. `top` is the screen's top edge coming
 *  toward the viewer and `right` is its right edge going away, in degrees. */
export function screenTurn(rx: number, ry: number, angle = 0): { top: number; right: number } {
  const a = (((Math.round(angle / 90) % 4) + 4) % 4) * (Math.PI / 2), c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
  // the screen's x axis in device coordinates is (c, -s), its y axis (s, c)
  return { top: rx * c - ry * s, right: rx * s + ry * c };
}

/**
 * What a device turn means as a unit input (the place a pointer would stand to give the same lean: the figure's turn is the
 * device's, reversed (owner, 28 Nov: flipped once): the right edge going away is a pointer to the right, the top edge going away is a pointer above.
 *  A soft dead zone leaves a hand's tremor out (only the angle past it counts, so nothing jumps at its edge); DEVICE_RANGE past it is the full tilt. */
export function deviceUnit(top: number, right: number): Unit {
  const f = (v: number) => (Math.abs(v) <= DEVICE_DEAD ? 0 : clamp(Math.sign(v) * (Math.abs(v) - DEVICE_DEAD) / (DEVICE_RANGE - DEVICE_DEAD), -1, 1));
  const x = f(right), y = f(top);
  return { x: x === 0 ? 0 : x, y: y === 0 ? 0 : y };   // (no negative zero)
}

/** The orientation a device is held at: the first reading, then it follows a steady hand slowly, so a phone resting at any angle is "straight" and only a change tilts. */
export class DeviceBase {
  private q: Quat | null = null;
  private t = 0;
  /** Takes an orientation at time `now` (ms); returns its turn from the held orientation (degrees about the held device's x and y). */
  readQuat(q: Quat, now: number): { rx: number; ry: number } {
    if (!this.q) { this.q = qnorm(q); this.t = now; return { rx: 0, ry: 0 }; }
    const out = turnBetween(this.q, q);
    const k = 1 - Math.exp(-Math.max(0, now - this.t) / DEVICE_BASE_TAU);
    this.t = now;
    // the held orientation moves a share of the way to the reading: a turn about the held frame of the same share of the angle (small angles: a scaled rotation vector)
    const h = this.q, d = turnBetween(h, q), ang = Math.hypot(d.rx, d.ry);
    if (k > 0 && ang > 1e-9) { const half = (ang * k * Math.PI) / 360, sn = Math.sin(half) / ang; this.q = qnorm(qmul(h, [d.rx * sn, d.ry * sn, 0, Math.cos(half)])); }
    return { rx: clamp(out.rx, -90, 90), ry: clamp(out.ry, -90, 90) };
  }
  read(alpha: number, beta: number, gamma: number, now: number): { rx: number; ry: number } { return this.readQuat(deviceQuat(alpha, beta, gamma), now); }
  reset(): void { this.q = null; }
}

/** One Euro filter (steady when the hand is still, quick when it really tilts): the cut-off rises with the speed of the signal. */
export class OneEuro {
  private x = NaN;
  private dx = 0;
  private t = 0;
  private readonly minCut: number;
  private readonly beta: number;
  private readonly dCut: number;
  constructor(minCut = 1.2, beta = 0.05, dCut = 1) { this.minCut = minCut; this.beta = beta; this.dCut = dCut; }
  private static alpha(cut: number, dt: number): number { const tau = 1 / (2 * Math.PI * cut); return 1 / (1 + tau / dt); }
  filter(v: number, now: number): number {
    if (Number.isNaN(this.x)) { this.x = v; this.t = now; return v; }
    const dt = Math.max(1e-3, (now - this.t) / 1000);
    this.t = now;
    const dv = (v - this.x) / dt;
    this.dx += OneEuro.alpha(this.dCut, dt) * (dv - this.dx);
    this.x += OneEuro.alpha(this.minCut + this.beta * Math.abs(this.dx), dt) * (v - this.x);
    return this.x;
  }
  reset(): void { this.x = NaN; this.dx = 0; }
}

/** The tilt that a unit input asks for (radians): none when the switch is off, Reduce Motion is on, a lock holds, or there is no input. */
export function tiltTarget(unit: Unit | null, on: boolean, reduce: boolean, locked: boolean, source: 'pointer' | 'device' = 'pointer'): { yaw: number; pitch: number } {
  if (!on || reduce || locked || !unit) return { yaw: 0, pitch: 0 };
  // the figure's face turns toward the input (the same way a drag turns it: the camera swings the other way, so yaw goes down as x goes up); a pointer below turns its top toward the viewer
  const [ym, pm] = source === 'device' ? [DEVICE_YAW_MAX, DEVICE_PITCH_MAX] : [TILT_YAW_MAX, TILT_PITCH_MAX];
  return { yaw: -clamp(unit.x, -1, 1) * ym, pitch: clamp(unit.y, -1, 1) * pm };
}

/** Whether a new input differs from the old enough to ask for a frame. */
export const worthAFrame = (a: Unit | null, b: Unit | null, step = WAKE_STEP): boolean => (!a || !b ? a !== b : Math.abs(a.x - b.x) > step || Math.abs(a.y - b.y) > step);

/** The tilt as it stands: eased toward the target, one exponential step per frame, and nothing else. */
export class Tilt {
  yaw = 0;
  pitch = 0;
  /** The input now: set by the listeners (tilt-input.ts), null when the pointer left, the tab is hidden or there is none. */
  unit: Unit | null = null;
  /** Where the input comes from: the pointer (a laptop, off in a talk) or the device's turn (a phone or tablet, on in a talk too). */
  source: 'pointer' | 'device' = 'pointer';
  private last = -1;
  /** The input the clock was last woken for (a slow drift in small steps is measured from it, not from the reading before). */
  private woke: Unit | null = null;

  /** Puts the input in; returns whether a frame is worth asking for (`step`: the unit change worth half a pixel, `wakeStep`). */
  set(unit: Unit | null, source: 'pointer' | 'device' = 'pointer', step = WAKE_STEP): boolean {
    const wake = worthAFrame(this.woke, unit, step) || source !== this.source;
    this.source = source;
    this.unit = unit;
    if (wake) this.woke = unit;
    return wake;
  }

  /** Back to square at once (the tab went to the background, or the switch went off). */
  reset(): void { this.yaw = 0; this.pitch = 0; this.unit = null; this.woke = null; this.last = -1; }

  /** One frame: eases toward the target for the input as locked or not. Returns true while it has not arrived (another frame is needed).
   *  Reduce Motion, or the switch off with nothing left to undo, never eases: it is square at once. */
  step(now: number, on: boolean, reduce: boolean, locked: boolean): boolean {
    const dt = this.last < 0 ? 16 : clamp(now - this.last, 0, 100);
    this.last = now;
    if (reduce || !on) { this.yaw = 0; this.pitch = 0; this.last = -1; return false; }
    const t = tiltTarget(this.unit, on, reduce, locked, this.source);
    const tau = locked || !this.unit ? TILT_TAU_OUT : TILT_TAU_IN;
    const k = 1 - Math.exp(-dt / tau);
    this.yaw += (t.yaw - this.yaw) * k;
    this.pitch += (t.pitch - this.pitch) * k;
    if (Math.abs(t.yaw - this.yaw) < TILT_EPS && Math.abs(t.pitch - this.pitch) < TILT_EPS) { this.yaw = t.yaw; this.pitch = t.pitch; this.last = -1; return false; }
    return true;
  }
}
