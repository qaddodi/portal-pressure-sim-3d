// The stepped procedure's clock (2D proc-anim.js playProcedure: createReversible({ ms: 1, land: false })): a time t in ms of the procedure's own sequence that runs to a goal (a step's stop) at the
// sequence's own pace forward and a little faster back, and when the goal changes mid-way (a Next or a Back pressed while a step is moving) turns round by slewing its VELOCITY over FLIP_MS rather than
// switching sign in one frame. Position and velocity are continuous through the turn; from rest a move starts at full rate (the sequence's own curves give it a soft start); it lands exactly on the goal.
// Pure: no clock, no scene. The layer steps it once a frame (scene/procedures/layer.ts).

/** Going back through a step runs it backwards a little faster than forward (2D BACK_SPEED). */
export const BACK_SPEED = 1.6;
/** The fast run that plays the rest of a step out when a Next comes on the last one (2D RUSH_SPEED). */
export const RUSH_SPEED = 6;
/** How long a turn round takes (2D D_FLIP). */
export const FLIP_MS = 120;

export interface StepClock {
  /** the sequence's time now, ms */
  t: number;
  /** its velocity, ms of sequence per ms of wall time (signed) */
  v: number;
  /** the stop it runs to */
  goal: number;
  /** run the rest of the way at RUSH_SPEED */
  rush: boolean;
}

export const makeStepClock = (t = 0): StepClock => ({ t, v: 0, goal: t, rush: false });

/** Whether the clock stands on its goal. */
export const landed = (c: StepClock): boolean => c.t === c.goal;

/** The rate the clock runs at toward its goal (signed): 1 forward, BACK_SPEED back, RUSH_SPEED when rushing. */
export function rateOf(c: StepClock): number {
  if (c.t === c.goal) return 0;
  const dir = c.goal > c.t ? 1 : -1;
  return dir * (c.rush ? RUSH_SPEED : dir < 0 ? BACK_SPEED : 1);
}

/** Aim at a stop; a new goal turns the move round (the velocity slews, the position does not jump). */
export function aim(c: StepClock, goal: number, rush = false): void {
  c.goal = goal; c.rush = rush;
}

/** Advance by dt ms of wall time; returns t. Lands exactly on the goal (never passes it) and then stands. `rate`: the signed rate to run at (the caller's own where the pace changes along the sequence), default rateOf. */
export function stepClock(c: StepClock, dt: number, rate = rateOf(c)): number {
  if (c.t === c.goal) { c.v = 0; return c.t; }
  if (!(dt > 0)) return c.t;
  const a = (2 * Math.abs(rate)) / FLIP_MS;
  let dx: number;
  if (c.v === 0) { c.v = rate; dx = rate * dt; }   // from rest: full rate at once
  else {
    const dv = rate - c.v, tS = Math.abs(dv) / a;
    if (dt >= tS) { dx = ((c.v + rate) / 2) * tS + rate * (dt - tS); c.v = rate; }
    else { const v1 = c.v + Math.sign(dv) * a * dt; dx = ((c.v + v1) / 2) * dt; c.v = v1; }
  }
  const nt = c.t + dx;
  if (c.goal > c.t ? nt >= c.goal : nt <= c.goal) { c.t = c.goal; c.v = 0; return c.t; }
  c.t = nt;
  return c.t;
}
