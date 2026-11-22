// What the instrument procedures that have a device of their own draw at a time on their clock (ms of the procedure's own time), pure (no scene, no clock). The 2D procedure table (copied/proc-anim.js)
// frames the catheter kinds itself; the instruments of instrument-specs.ts are graft-style (their frame is zeros), so the two that put a device on the figure before the model's change give it here:
//  - DIPS: the catheter down the cava to where the shunt leaves it, the needle across the liver into the portal vein (the hit, then the tract: tract.ts), the catheter on over the needle and the wire, the balloon dilating the tract, and the stent opening at T.apply;
//  - paracentesis: the needle through the abdominal wall into the ascites (step 1), held while the fluid drains (step 2), drawn out (step 3).
// Every step of every instrument procedure draws something: tests/procedure-steps-draw.test.ts.
import { INSTRUMENT_SPECS } from './instrument-specs.ts';
import { ease, cruise, k01 } from './copied/hvpg-clock.js';
import { easeMove } from './copied/ease.js';

type Frame = { u: number; needle: number; wire: number; flash: number; balloon: number; opacity: number; [k: string]: unknown };

/** The DIPS catheter's frame, written over the graft frame `f` (the step, the shot and the fade are the table's own): `stops` are the route's named stretches as u, `tract` the shunt through the liver. */
export function dipsFrame<F extends Frame>(f: F, t: number, stops: Record<string, [number, number]> | null): F {
  const sp = INSTRUMENT_SPECS.dips!, T = sp.T, s0 = sp.stops[0]!, s1 = sp.stops[1]!;
  const a = stops?.tract?.[0] ?? 0.8;
  const back = cruise(k01(t, T.back, T.end - 400));
  // step 1: the catheter in, down the cava to where the shunt leaves it; step 3: on over the needle and the wire through the tract to the portal vein, then out
  const tip = (t < s1 ? a * cruise(k01(t, 0, s0)) : a + (1 - a) * cruise(k01(t, s1, s1 + 600))) * (1 - back);
  // step 2: the needle across the liver into the portal vein, the wire behind it; the catheter covers them again as it goes over (3)
  const nd = a + (1 - a) * ease(k01(t, s0 + 200, T.flash0)), wd = a + (1 - a) * ease(k01(t, T.flash0 + 300, s1));
  f.u = tip;
  f.needle = t >= s0 + 200 && nd > tip + 1e-4 ? nd : 0;
  f.wire = t >= T.flash0 + 300 && wd > tip + 1e-4 ? wd : 0;
  // the hit (portal blood back up the needle) as the TIPS's, then the dilation balloon along the tract, up and down before the stent opens
  f.flash = t > T.flash0 && t < T.flash1 ? k01(t, T.flash0, T.flash1) : 0;
  f.balloon = easeMove(k01(t, T.inflate0, T.inflate1)) * (1 - easeMove(k01(t, T.deflate0, T.deflate1)));
  return f;
}

/** The paracentesis needle's depth at a time: 0 outside the skin, 1 in the ascites. In during step 1, held through the drain, out at the start of step 3. */
export function paracentesisAt(t: number): number {
  const sp = INSTRUMENT_SPECS.paracentesis!, s0 = sp.stops[0]!, s1 = sp.stops[1]!;
  return ease(k01(t, 200, s0)) * (1 - ease(k01(t, s1 + 300, s1 + 1500)));
}
