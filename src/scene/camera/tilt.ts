// Gentle tilt (depth upgrade 3, owner-approved exception to match-2D, 19 Nov 2026): the figure turns a few degrees toward the pointer on a laptop, or with the device's
// orientation on a phone or tablet, so the depth reads. It is an OFFSET ADDED to the rig's yaw and pitch when the camera is written (rig.apply) and is never stored in the
// hand's or the orbit's state, so Fit, Home and refit still return to the exact rest view and what the fit computes is measured without it (rig.fitRect).
// This file is pure (no DOM, no three): the target from an input, the easing, the clamp and the locks. The listeners are in tilt-input.ts.

/** Largest turn each way, radians: 3.5° of yaw, 2.5° of pitch (owner: at most about 3 to 4 and 2 to 3). */
export const TILT_YAW_MAX = (3.5 * Math.PI) / 180;
export const TILT_PITCH_MAX = (2.5 * Math.PI) / 180;
/** Time constant of the ease toward a target (ms), and of the faster ease to zero while locked (a gesture, a shot) or when the input has gone. */
export const TILT_TAU_IN = 260;
export const TILT_TAU_OUT = 140;
/** Under this distance (radians, about 0.011°, under a pixel on the figure) the tilt has arrived and no more frames are asked for. */
export const TILT_EPS = 2e-4;
/** A phone's tilt: the range of device angle that makes a full tilt (degrees), the dead zone round the held position, and how fast the held position follows a steady hand (ms). */
export const DEVICE_RANGE = 14;
export const DEVICE_DEAD = 1.2;
export const DEVICE_BASE_TAU = 4000;
/** A change of the unit input smaller than this does not wake the clock (a phone in a hand never sits still). */
export const WAKE_STEP = 0.01;

export interface Unit { x: number; y: number }
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/** The pointer's place over the window as a unit square, -1 to 1 each way, y positive down; 0 at the middle. */
export function pointerUnit(x: number, y: number, w: number, h: number): Unit {
  if (!(w > 0) || !(h > 0)) return { x: 0, y: 0 };
  return { x: clamp((x - w / 2) / (w / 2), -1, 1), y: clamp((y - h / 2) / (h / 2), -1, 1) };
}

/** What a device-orientation reading means, as a unit input. `db` and `dg` are beta and gamma (degrees) away from the held position; `angle` is the screen's own turn
 *  (0, 90, 180, 270). The unit is positive x when the screen's right edge tilts away from the viewer and positive y when its top edge does, the way a pointer to the right
 *  and below the middle reads; a dead zone leaves a hand's tremor out. */
export function deviceUnit(db: number, dg: number, angle = 0): Unit {
  const a = ((Math.round(angle / 90) % 4) + 4) % 4;
  // portrait: gamma is right edge away, beta is top edge away; each quarter turn of the screen swaps them
  const [x, y] = a === 0 ? [dg, db] : a === 1 ? [-db, dg] : a === 2 ? [-dg, -db] : [db, -dg];
  const f = (v: number) => (Math.abs(v) <= DEVICE_DEAD ? 0 : clamp(Math.sign(v) * (Math.abs(v) - DEVICE_DEAD) / (DEVICE_RANGE - DEVICE_DEAD), -1, 1));
  return { x: f(x), y: f(y) };
}

/** The position a device is held at: the first reading, then it follows a steady hand slowly, so a phone resting at an angle is "straight" and only a change tilts. */
export class DeviceBase {
  private b = NaN;
  private g = NaN;
  private t = 0;
  /** Takes a reading (degrees) at time `now` (ms); returns its distance from the held position. */
  read(beta: number, gamma: number, now: number): { db: number; dg: number } {
    if (Number.isNaN(this.b)) { this.b = beta; this.g = gamma; this.t = now; return { db: 0, dg: 0 }; }
    const k = 1 - Math.exp(-Math.max(0, now - this.t) / DEVICE_BASE_TAU);
    this.t = now;
    const db = beta - this.b, dg = gamma - this.g;
    this.b += db * k; this.g += dg * k;
    return { db: clamp(db, -90, 90), dg: clamp(dg, -90, 90) };
  }
  reset(): void { this.b = NaN; this.g = NaN; }
}

/** The tilt that a unit input asks for (radians): none when the switch is off, Reduce Motion is on, a lock holds, or there is no input. */
export function tiltTarget(unit: Unit | null, on: boolean, reduce: boolean, locked: boolean): { yaw: number; pitch: number } {
  if (!on || reduce || locked || !unit) return { yaw: 0, pitch: 0 };
  // the figure's face turns toward the input (the same way a drag turns it: the camera swings the other way, so yaw goes down as x goes up); a pointer below turns its top toward the viewer
  return { yaw: -clamp(unit.x, -1, 1) * TILT_YAW_MAX, pitch: clamp(unit.y, -1, 1) * TILT_PITCH_MAX };
}

/** Whether a new input differs from the old enough to ask for a frame. */
export const worthAFrame = (a: Unit | null, b: Unit | null): boolean => (!a || !b ? a !== b : Math.abs(a.x - b.x) > WAKE_STEP || Math.abs(a.y - b.y) > WAKE_STEP);

/** The tilt as it stands: eased toward the target, one exponential step per frame, and nothing else. */
export class Tilt {
  yaw = 0;
  pitch = 0;
  /** The input now: set by the listeners (tilt-input.ts), null when the pointer left, the tab is hidden or there is none. */
  unit: Unit | null = null;
  private last = -1;

  /** Puts the input in; returns whether a frame is worth asking for. */
  set(unit: Unit | null): boolean {
    const wake = worthAFrame(this.unit, unit);
    this.unit = unit;
    return wake;
  }

  /** Back to square at once (the tab went to the background, or the switch went off). */
  reset(): void { this.yaw = 0; this.pitch = 0; this.unit = null; this.last = -1; }

  /** One frame: eases toward the target for the input as locked or not. Returns true while it has not arrived (another frame is needed).
   *  Reduce Motion, or the switch off with nothing left to undo, never eases: it is square at once. */
  step(now: number, on: boolean, reduce: boolean, locked: boolean): boolean {
    const dt = this.last < 0 ? 16 : clamp(now - this.last, 0, 100);
    this.last = now;
    if (reduce || !on) { this.yaw = 0; this.pitch = 0; this.last = -1; return false; }
    const t = tiltTarget(this.unit, on, reduce, locked);
    const tau = locked || !this.unit ? TILT_TAU_OUT : TILT_TAU_IN;
    const k = 1 - Math.exp(-dt / tau);
    this.yaw += (t.yaw - this.yaw) * k;
    this.pitch += (t.pitch - this.pitch) * k;
    if (Math.abs(t.yaw - this.yaw) < TILT_EPS && Math.abs(t.pitch - this.pitch) < TILT_EPS) { this.yaw = t.yaw; this.pitch = t.pitch; this.last = -1; return false; }
    return true;
  }
}
