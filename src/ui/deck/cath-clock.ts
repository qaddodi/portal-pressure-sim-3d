// The deck's HVPG catheter on the 2D app's ONE clock (hvpg-clock.js, copied at scene/procedures/copied/): the catheter, its balloon, its still column and the tracing card all read one time, the HVPG
// script's `t` (ms), so the balloon fills and the trace steps in the same frame (V-CARD-4, V-CHART-5).
//   advance  cruise(k01(t, T.travel0, T.travel1))      the route takes legMs(274) = 3.4 s at the travel speed, on the cruise curve
//   balloon  balloonAt(t) = easeMove(k01(t, T.inflate, T.wedge))   BALLOON_IN_MS, one curve (easeMove)
//   column   ease(k01(t, T.settle, T.callout))     the still column fills after the balloon is up (2D cathTo: balloon, THEN column, THEN the WHVP pill)
// A step of the talk is a place on that script (route, free, wedge, result, blocked); Next runs `t` on to the next place at the script's own pace, Back runs it back (the balloon lets down over
// BALLOON_OUT_MS), and a press while it moves turns it round without a jump (scene/procedures/step-clock.ts). Pure: no scene, no clock; scene-link.ts steps it once a frame.
import { T, cruise, k01, balloonAt, ease, BALLOON_IN_MS, BALLOON_OUT_MS } from '../../scene/procedures/copied/hvpg-clock.js';
import { OSTIUM_U } from '../../scene/procedures/ostium.ts';
import { BACK_SPEED, type StepClock, makeStepClock, stepClock } from '../../scene/procedures/step-clock.ts';
import type { CathState } from '../../decks/schema.ts';

/** The script time each reading is taken at: the same as the tracing card's STEP_T (talk/hvpg-plan.ts; tests/deck-cath-clock.test.ts holds them equal). */
export const FREE_T = T.inflate - 60, WEDGE_T = T.result, RESULT_T = T.back;
/** Where the tip stands in the blocked vein's ostium: the script time at which the route's progress is OSTIUM_U. */
export const timeOfAdvance = (u: number): number => {
  if (u <= 0) return T.travel0;
  if (u >= 1) return T.travel1;
  let lo = 0, hi = 1;
  for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2; if (cruise(mid) < u) lo = mid; else hi = mid; }
  return T.travel0 + ((lo + hi) / 2) * (T.travel1 - T.travel0);
};

/** The script time a catheter state of the talk stands at (null: no catheter on the figure). */
export function targetT(c: CathState | null): number {
  switch (c) {
    case 'route': return T.travel1;
    case 'blocked': return timeOfAdvance(OSTIUM_U);
    case 'free': return FREE_T;
    case 'wedge': return WEDGE_T;
    case 'result': return RESULT_T;
    default: return 0;
  }
}

export interface CathPose { advance: number; balloon: number; column: number }
/** What the figure draws at script time t. The blocked state's tip stops at the ostium; its goal time is where the route's progress is OSTIUM_U, so the pose is the same function. */
export function poseAt(t: number, out: CathPose = { advance: 0, balloon: 0, column: 0 }): CathPose {
  out.advance = cruise(k01(t, T.travel0, T.travel1));
  out.balloon = balloonAt(t);
  out.column = ease(k01(t, T.settle, T.callout));
  return out;
}

/** How fast the script runs toward its goal now (signed, script ms per ms). Forward it is the script's own pace (1), so the balloon takes BALLOON_IN_MS and the trace reads the same t; the quiet stretch
 *  before the balloon (the free sweep, nothing moves on the figure) goes 3 times as fast once Next has asked for the wedge, and a jump of more than one step runs every stretch the figure does not change fast.
 *  Back, the balloon lets down over BALLOON_OUT_MS and the rest goes back at BACK_SPEED (the plateau at four times that: nothing on the figure changes there). */
export function rateAt(c: StepClock, jump = false): number {
  if (c.t === c.goal) return 0;
  if (c.goal > c.t) {
    if (c.t >= T.wedge && c.t < c.goal && jump) return 8;
    if (c.t >= T.travel1 && c.t < FREE_T && (c.goal > FREE_T || jump)) return jump ? 8 : 3;
    return 1;
  }
  if (c.t > T.inflate && c.t <= T.wedge) return -(T.wedge - T.inflate) / BALLOON_OUT_MS;
  return c.t > T.wedge ? -2.5 : -BACK_SPEED;   // (the plateau, where nothing on the figure changes, a little faster; kept near the balloon's own rate so the velocity slew into the balloon's stretch does not eat it)
}

/** The deck catheter's clock: the script time and where it is going. */
export interface CathClock { clk: StepClock; jump: boolean }
export const makeCathClock = (): CathClock => ({ clk: makeStepClock(0), jump: false });

/** Send the clock to a catheter state. `jump`: the move is more than one step of the talk (a jump or a skip), so the quiet stretches run fast. */
export function aimCath(c: CathClock, state: CathState | null, jump = false): void {
  c.clk.goal = targetT(state); c.clk.rush = false; c.jump = jump;
}

/** Advance by dt ms; returns whether it is still moving. */
export function stepCath(c: CathClock, dt: number): boolean {
  stepClock(c.clk, Math.min(dt, 64), rateAt(c.clk, c.jump));
  return c.clk.t !== c.clk.goal;
}

/** The script time the tracing card follows (talk/HvpgTool.tsx reads it, so its trace steps in the frame the balloon does): written each frame by scene-link while the deck holds the catheter. */
export const cathScript = { on: false, t: 0 };

export { BALLOON_IN_MS, BALLOON_OUT_MS };

/** How far along the talk's catheter a state is (none, the way in, the free reading, the wedge, the result): a move of more than one is a jump. The blocked vein's way in is the route's. */
export const rankOf = (c: CathState | null): number => (c === null ? 0 : c === 'route' || c === 'blocked' ? 1 : c === 'free' ? 2 : c === 'wedge' ? 3 : 4);

/** How long the catheter takes to come from the neck to a blocked vein's mouth (script ms from the start: the 300 ms of stillness and the travel at cruise speed up to OSTIUM_U). */
export const ARRIVE_MS = targetT('blocked');
