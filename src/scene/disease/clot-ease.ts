// How a clot GROWS on screen (plan 26, gate 4: nothing pops). The engine's occlusion v and the lesion ease (follow.ts lesionStep) stay as they are: only the DRAWN occlusion `vDraw`, which feeds the shader's uniforms, follows its own ease.
// An exponential ease is fastest on its first frame, the opposite of growth. This is the quintic easeMove (slow start, a peak at the middle, slow settle) from the drawn value to the goal over T = max(CLOT_EASE_MIN_S, CLOT_EASE_K |dv|) seconds,
// whose peak rate is 1.875 |dv| / T. A retarget part-way starts the new ease from where the clot is, with the velocity it has (a cubic Hermite from (v, v') to (goal, 0)), so there is never a kink.
export const CLOT_EASE_MIN_S = 3.0;   // (the cap of the plan: area grows as v squared, so a small clot needs the longest ease to stay under 2 % of its area per frame)
export const CLOT_EASE_K = 2.0;
const smoother = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (t * (6 * t - 15) + 10));
const smootherD = (t: number): number => (t <= 0 || t >= 1 ? 0 : 30 * t * t * (t - 1) * (t - 1));

export class ClotGrow {
  /** the drawn occlusion */ v = 0;
  /** its rate, per second */ vel = 0;
  private v0 = 0; private vel0 = 0; private goal = 0; private t = 0; private T = 1;
  private readonly k: number; private readonly minS: number;
  constructor(k = CLOT_EASE_K, minS = CLOT_EASE_MIN_S) { this.k = k; this.minS = minS; }
  /** Sets the goal (a change starts a new ease from here). `instant` lands it whole. Returns true while it moves. */
  to(goal: number, instant = false): void {
    if (instant) { this.v = this.goal = goal; this.vel = 0; this.t = this.T = 1; return; }
    if (goal === this.goal) return;
    this.v0 = this.v; this.vel0 = this.vel; this.goal = goal; this.t = 0;
    this.T = Math.max(this.minS, this.k * Math.abs(goal - this.v));
  }
  step(dt: number): boolean {
    if (this.v === this.goal && this.vel === 0) return false;
    this.t += Math.max(0, dt);
    const s = this.t / this.T;
    if (s >= 1) { this.v = this.goal; this.vel = 0; return false; }
    const d = this.goal - this.v0;
    if (this.vel0 === 0) { this.v = this.v0 + d * smoother(s); this.vel = d * smootherD(s) / this.T; }
    else {
      const s2 = s * s, s3 = s2 * s;
      this.v = (2 * s3 - 3 * s2 + 1) * this.v0 + (s3 - 2 * s2 + s) * this.T * this.vel0 + (-2 * s3 + 3 * s2) * this.goal;
      this.vel = ((6 * s2 - 6 * s) * this.v0 + (3 * s2 - 4 * s + 1) * this.T * this.vel0 + (-6 * s2 + 6 * s) * this.goal) / this.T;
    }
    return true;
  }
  get target(): number { return this.goal; }
}
