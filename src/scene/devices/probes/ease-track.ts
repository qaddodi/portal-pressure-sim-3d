// One eased number, as 2D keeps the FibroScan probe's fades (scan-ease.js scanTo and stepTrack): a change of goal runs from where the number stands to the new goal over `dur` ms on the arrive curve
// (the CSS --ease), and a change while one runs goes as a CSS transition does: from where it stands, its time shortened when it turns back to where it came from (the reversing shortening factor).
// Nothing here makes an object after the track is made.
import { easeArrive } from '../../../ui/tests/copied/motion.copied.js';

export class ArriveTrack {
  /** where the number stands now */
  value: number;
  private run = false; private from = 0; private to = 0; private t0 = 0; private dur = 0; private rAdj = 0; private rf = 1;
  constructor(value = 0) { this.value = value; this.to = value; this.rAdj = value; }

  /** The goal now (or the goal it is running to). */
  get goal(): number { return this.run ? this.to : this.value; }
  get running(): boolean { return this.run; }

  /** Takes the number to `to` outright (no ease): a model that is placed afresh. */
  set(v: number): void { this.value = v; this.to = v; this.run = false; }

  /** Asks for `to` over `dur` ms from `now`. Asking again for the goal it already runs to changes nothing. */
  go(to: number, dur: number, now: number): void {
    if (this.run) {
      this.stepTo(now);
      if (!this.run) { if (this.value === to) return; }
      else {
        if (to === this.to) return;
        const cur = this.value;
        if (cur === to) { this.run = false; return; }
        if (to === this.rAdj) {
          // turning back to where it came from: its time is cut by how far it had gone
          const p = this.dur > 0 ? Math.min(1, Math.max(0, (now - this.t0) / this.dur)) : 1, f = Math.min(1, Math.max(0, Math.abs(easeArrive(p) * this.rf + 1 - this.rf)));
          this.rAdj = this.to; this.rf = f; this.dur = dur * f;
        } else { this.rAdj = cur; this.rf = 1; this.dur = dur; }
        this.from = cur; this.to = to; this.t0 = now;
        return;
      }
    }
    if (this.value === to) return;
    if (!(dur > 0)) { this.value = to; return; }
    this.run = true; this.from = this.value; this.to = to; this.t0 = now; this.dur = dur; this.rAdj = this.value; this.rf = 1;
  }

  private stepTo(now: number): void {
    const p = this.dur > 0 ? (now - this.t0) / this.dur : 1;
    if (p >= 1) { this.value = this.to; this.run = false; return; }
    this.value = this.from + (this.to - this.from) * easeArrive(p > 0 ? p : 0);
  }

  /** The number at `now`; true while it still eases. */
  step(now: number): boolean {
    if (this.run) this.stepTo(now);
    return this.run;
  }
}
