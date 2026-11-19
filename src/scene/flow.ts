import type { CelObject } from './materials/cel.ts';

// Flow marks (look-and-feel.md section 2, options in section 11). Option A is the default until Mohammad picks:
//   A  chevrons on the vessels the slide names and the picked vessel; the rest still
//   B  chevrons on every vessel, fainter on the vessels the slide does not name
//   C  soft light bands on every vessel
//   D  marks run for a few seconds after a change, then fade
// All four sit behind this one setting, so the choice is a switch.

export type FlowMarkMode = 'A' | 'B' | 'C' | 'D';
export const DEFAULT_FLOW_MODE: FlowMarkMode = 'A';
/** Marks on the vessels a slide does not name, in option B. */
export const QUIET_AMOUNT = 0.35;
/** How long option D's marks stay after a change, ms. */
export const PULSE_MS = 4000;
export const FLOW_FADE_MS = 180;

/** Mark speed (marks per second, signed) for an engine flow in mL/s along the edge's own direction. The engine's flow ranges from about
 *  0.1 (collaterals) to 60 (the cava); the root keeps small vessels visibly moving and the big ones from racing. Zero below 0.05. */
export function markSpeed(flowMlPerS: number): number {
  const a = Math.abs(flowMlPerS);
  if (a < 0.05) return 0;
  return Math.sign(flowMlPerS) * (0.3 + 0.55 * Math.sqrt(Math.min(a, 60) / 20));
}

/** How much of the marks a vessel shows, 0 to 1, for a mode (before the fade in time). */
export function targetAmount(mode: FlowMarkMode, named: boolean, pulse: number): number {
  switch (mode) {
    case 'A': return named ? 1 : 0;
    case 'B': return named ? 1 : QUIET_AMOUNT;
    case 'C': return 1;
    case 'D': return pulse;
  }
}

interface Track { obj: CelObject; named: boolean; amount: number }

export class FlowMarks {
  mode: FlowMarkMode = DEFAULT_FLOW_MODE;
  private tracks = new Map<string, Track>();
  private pulseUntil = -Infinity;
  private pulseStart = -Infinity;
  private pulse = 0;

  constructor(vessels: readonly CelObject[]) {
    for (const o of vessels) if (o.edge) this.tracks.set(o.edge.id, { obj: o, named: false, amount: 0 });
  }

  setMode(mode: FlowMarkMode): void { this.mode = mode; }

  /** The edge IDs the slide talks about, plus the picked vessel. */
  setNamed(ids: Iterable<string>): void {
    const set = new Set(ids);
    for (const [id, t] of this.tracks) t.named = set.has(id);
  }

  /** Option D: a change happened (a preset, a slider, a treatment). */
  trigger(nowMs: number): void { this.pulseStart = nowMs; this.pulseUntil = nowMs + PULSE_MS; }

  /** Fades each vessel's marks toward its target. Returns true while marks are showing or fading, so the clock keeps drawing. */
  step(nowMs: number, dtMs: number): boolean {
    this.pulse = nowMs >= this.pulseUntil ? 0 : Math.min(1, (this.pulseUntil - nowMs) / 1000, (nowMs - this.pulseStart) / FLOW_FADE_MS);
    const k = Math.min(1, dtMs / FLOW_FADE_MS);
    let active = false;
    for (const t of this.tracks.values()) {
      const goal = targetAmount(this.mode, t.named, this.pulse);
      t.amount = Math.abs(goal - t.amount) <= k ? goal : t.amount + Math.sign(goal - t.amount) * k;
      t.obj.setFlow(t.amount, this.mode === 'C');
      if (t.amount > 0.001) active = true;
    }
    return active;
  }
}
