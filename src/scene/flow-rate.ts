// THE FLOW'S ONE EASED RATE (Mohammad, 20 Nov: "when i stop the motion, it should EASE stop and EASE begin on pause and play"). Pause and Play do not freeze or start the blood's visible flow at once: this rate eases
// from 1 (playing) to 0 (paused) and back over FLOW_EASE_S with a smoothstep (monotone, no jump at either end, exactly the target when it lands, an interrupted ease restarts from where it is). Every visible
// phase that rides the blood's own distance (the streams' D: the chevrons, the Circuit's heads) advances by `dt * rate`, so all views agree. The simulation's own numbers and clock keep pausing
// at once; only the picture eases.
//
// Frames: `active` is true while the rate is above 0.001 or still easing, false once it has settled at 0, so a paused figure asks the clock (clock.hold in the Stage's frame loop) for nothing: the scene's update
// returns "moving" from it and the Stage holds the clock only while that is true. No requestAnimationFrame here: it is stepped from the scene's update, which the one clock calls.

/** Seconds a pause or a play takes to settle. */
export const FLOW_EASE_S = 0.5;

const smooth = (k: number): number => { const t = Math.min(1, Math.max(0, k)); return t * t * (3 - 2 * t); };

export class FlowRate {
  private from = 1;
  private to = 1;
  private el = FLOW_EASE_S;
  /** The rate now, 0 (stood) to 1 (full speed). */
  value = 1;

  /** Steps by `dtSec` toward `target` (1 playing, 0 paused). Returns whether the rate still needs frames. */
  step(dtSec: number, target: number): boolean {
    if (target !== this.to) { this.from = this.value; this.to = target; this.el = 0; }
    this.el = Math.min(FLOW_EASE_S, this.el + Math.max(0, dtSec));
    this.value = this.el >= FLOW_EASE_S ? this.to : this.from + (this.to - this.from) * smooth(this.el / FLOW_EASE_S);
    return this.active;
  }

  /** In the middle of an ease (a Pause or a Play just made): an eased change, which keeps the display's full frame rate. Steady at 0 or 1 it is false. */
  get easing(): boolean { return this.el < FLOW_EASE_S; }

  /** Still moving the picture: above a hair of speed, or in the middle of an ease. Settled at 0, nothing asks for a frame. */
  get active(): boolean { return this.el < FLOW_EASE_S || this.value > 0.001; }
}

/** THE one rate, shared by every view (the Anatomy and Circuit streams, the lobule, the sinusoid and the 3D scenes of both): the scene steps it once a frame, everything that moves with the blood multiplies its advance by `.value`. */
export const flowRate = new FlowRate();

/** What the rate is easing toward: 1 while the model runs, 0 once Pause has stopped it. Read from the live model's own frame (not the pinned one Compare's Then view shows), as the play button reads it. */
export function flowTarget(running: boolean | undefined): number { return running === false ? 0 : 1; }
