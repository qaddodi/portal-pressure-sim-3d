// How a clot GROWS on screen (plan 26b). Only the DRAWN occlusion `vDraw` (the shader's uniforms) follows this; the engine's v and lesionStep are untouched.
// Two modes, chosen by the size of the step that arrives:
//  - FOLLOW (goal moves <= CLOT_FOLLOW_STEP at once: a slider drag, one step per pointer event): a critically damped spring, omega 30 /s. 90 % of a step in about 130 ms, trails the finger by about 65 ms, never overshoots, keeps its velocity across new goals.
//  - JUMP (a bigger step: preset, reset, tap on the track, talk slide, undo): a cubic Hermite from (v, v') to (goal, 0) over T = 0.35 s + 0.35 s |dv|. A follow step arriving mid-jump hands over to the spring from the same value and velocity.
export const CLOT_FOLLOW_STEP = 0.08;
export const CLOT_SPRING_W = 30;
export const CLOT_JUMP_BASE_S = 0.35;
export const CLOT_JUMP_K = 0.35;
const EPS_V = 1e-4, EPS_VEL = 1e-3;

export class ClotGrow {
  /** the drawn occlusion */ v = 0;
  /** its rate, per second */ vel = 0;
  private v0 = 0; private vel0 = 0; private goal = 0; private t = 0; private T = 1; private spring = false;
  /** Sets the goal. `instant` lands it whole. */
  to(goal: number, instant = false): void {
    if (instant) { this.v = this.goal = goal; this.vel = 0; this.t = this.T = 1; this.spring = false; return; }
    if (goal === this.goal) return;
    const small = Math.abs(goal - this.goal) <= CLOT_FOLLOW_STEP, jumping = !this.spring && this.v !== this.goal;
    this.v0 = this.v; this.vel0 = this.vel; this.goal = goal; this.t = 0;
    // a drag step that lands during a jump keeps the jump's profile (retargeted from the current value and rate); the spring takes over once the jump has landed, so no velocity spike
    this.spring = small && !jumping;
   
    this.T = CLOT_JUMP_BASE_S + CLOT_JUMP_K * Math.abs(goal - this.v);
  }
  step(dt: number): boolean {
    if (this.v === this.goal && this.vel === 0) return false;
    dt = Math.max(0, dt);
    if (this.spring) {
      const w = CLOT_SPRING_W, e = Math.exp(-w * dt), x = this.v - this.goal, b = this.vel + w * x;
      const nx = (x + b * dt) * e, nv = (this.vel - w * b * dt) * e;
      if (Math.abs(nx) < EPS_V && Math.abs(nv) < EPS_VEL) { this.v = this.goal; this.vel = 0; return false; }
      this.v = this.goal + nx; this.vel = nv; return true;
    }
    this.t += dt;
    const s = this.t / this.T;
    if (s >= 1) { this.v = this.goal; this.vel = 0; return false; }
    const s2 = s * s, s3 = s2 * s;
    this.v = (2 * s3 - 3 * s2 + 1) * this.v0 + (s3 - 2 * s2 + s) * this.T * this.vel0 + (-2 * s3 + 3 * s2) * this.goal;
    this.vel = ((6 * s2 - 6 * s) * this.v0 + (3 * s2 - 4 * s + 1) * this.T * this.vel0 + (-6 * s2 + 6 * s) * this.goal) / this.T;
    return true;
  }
  get target(): number { return this.goal; }
}
