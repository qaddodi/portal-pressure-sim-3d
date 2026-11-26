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

