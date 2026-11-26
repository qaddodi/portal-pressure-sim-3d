// Where a procedure's graph ends: the state the procedure leaves the patient in, never the one it opened on.
//
// The wrong source (capture 3531bdfa, Shunts 7, "TIPS is placed through transjugular access"): the graph's line glides its last 30% toward the slide's own fingerprint (procs-link.ts evChange),
// but a slide that plays a procedure with no parameters of its own lands on the state BEFORE it (hp/link.ts, 2D `pre`), so its own fingerprint is the pre-TIPS one: the PPG fell to 10 by +12 s
// and climbed back to 19.1 by +20 s, the chart ending on a failed TIPS. The state the procedure leaves is the slide's own with the procedure's `apply` laid on it, worked out on the second
// engine like every control's (tests/proc-after.test.ts: for every deck, a TIPS or a stent procedure ends below where it began).
import type { Seq } from '../talk/variant-state.ts';

type Fp = Record<string, number | null | undefined>;
/** A procedure's spec as the graph needs it: whether the patient already has its result, and the parameters with it laid on. */
interface Spec { had(p: unknown): boolean; apply(p: unknown): unknown }
/** A slide's state as the deck's calc keeps it. */
interface Own { fp?: unknown; params?: unknown; base?: unknown }

/** The fingerprint the procedure ends in: the slide's own where the patient already has the result (its parameters say so),
 *  else the state after the procedure's change; null until it can be worked out. */
export async function afterProcedureFp(spec: Spec, own: Own | undefined, seq: Seq): Promise<Fp | null> {
  if (!own?.fp) return null;
  if (!own.params || spec.had(own.params)) return own.fp as Fp;
  if (!own.base) return null;
  const done = await seq([{ params: spec.apply(structuredClone(own.params)) }], own.base);
  return (done[0]?.fp as Fp | undefined) ?? null;
}
