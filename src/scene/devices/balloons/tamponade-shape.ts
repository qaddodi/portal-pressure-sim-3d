// The tamponade's timing as pure numbers (no scene, no clock), so the tube's timing can be tested in node. (Its line and the gastric balloon's shape are tamponade-path.ts.)
//
//  - `tamponadeAt`: where the tube and its gastric balloon are at a time on the procedure's own clock (the tube in the first step, the balloon filling and drawn up in the second, held at its stop), so the device
//    follows the procedure and not the model's `balloonGas`, which changes only at T.apply.
import { INSTRUMENT_SPECS } from '../../procedures/instrument-specs.ts';

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** The tube and its gastric balloon on the procedure's clock (ms of its own time): adv 0..1 the tube going in (the first step, to its first stop), gas 0..1 the balloon filling and being drawn up (the second step, to the model's change at T.apply). */
export function tamponadeAt(t: number, spec = INSTRUMENT_SPECS.tamponade!): { adv: number; gas: number } {
  const s0 = spec.stops[0]!, s1 = spec.T.apply;
  return { adv: clamp01(t / s0), gas: clamp01((t - s0) / (s1 - s0)) };
}
