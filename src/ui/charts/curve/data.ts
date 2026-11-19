// What the curve and the course read from the engine (2D: tool-curve.js curveWork / aim, tool-course.js courseWork; the worker call is the presenter's ctx.run =
// the engine's 'sequence' message, src/engine/host/worker-core.js). The pure part (the steps, the series, where the case sits) is the 2D code
// (curve-pure.generated.js, course-pure.generated.js); this file only joins it to the engine and keeps what was worked out.
import * as P from './curve-pure.generated.js';
import * as C from './course-pure.generated.js';
import type { CurveTool, Goal } from './frame.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
export type Fp = Record<string, number | null | undefined> & { at?: { P?: ArrayLike<number> }; varixAir?: unknown };
/** One state the worker worked out (a 'seqStep'): the fingerprint, and what a later run can start from. */
export interface State { fp: Fp; snap?: unknown; base?: unknown; params?: unknown; extra?: unknown; trail?: unknown }
/** The slide's own state: what the curve is drawn on. `base` (else `snap`) is where each point starts from; `fp` and `params` are what its tiles read. */
export interface SlideState { fp: Fp; params?: unknown; base?: unknown; snap?: unknown }
/** The worker's chain of steps, from a state (undefined: the slide's own; null: a fresh model). */
export type RunFn = (steps: unknown[], from?: unknown) => Promise<State[] | null>;

/** The curve's worked out result: the series and the dots (each with its fingerprint). */
export interface CurveWork { s: Any; dd: Any[] }
export const curveKey = (tool: unknown, id: unknown) => JSON.stringify([id ?? 0, tool]);

/** The curve for a slide, worked out once (2D curveWork): the sweep on the worker, then the dots made from a preset on fresh models. */
export function curveWork(t: CurveTool, slide: SlideState, run: RunFn, fpOf?: (slideId: string) => Fp | null): Promise<CurveWork | null> {
  if (P.overScope(t)) {
    // (Nothing to run: the slide's own reading holds it all.)
    const st = P.scopeStates(t, slide.fp);
    return Promise.resolve(st ? { s: P.curveSeries(t, st), dd: [] } : null);
  }
  const ds = P.dotsOf(t), dSteps = P.dotSteps(t);
  return Promise.all([run(P.curveSteps(t), P.patientOf(t) ? null : undefined).then((states) => P.curveSeries(t, states)), dSteps.length ? run(dSteps, null) : Promise.resolve([] as State[])]).then(([s, made]) => {
    if (!s) return null;
    let k = 0;
    const dd = ds.map((d: Any) => ({ ...d, fp: d.slide ? fpOf?.(d.slide) ?? null : made?.[k++]?.fp ?? null }));
    return { s, dd };
  });
}

/** The course for a slide (2D courseWork): the head from a fresh model, then the treatments from its last state. */
export function courseWork(t: Record<string, Any>, run: RunFn): Promise<Any | null> {
  return run(C.headSteps(t), null).then((head) => {
    const snap = head?.at(-1)?.snap;
    return snap ? run(C.tailSteps(t), snap).then((tail) => C.courseSeries(t, head, tail)) : null;
  });
}

/** Where the case sits and each line's value there (2D ringAt, then aim()'s reading from the curve): from the live params and fingerprint while a what-if slider or a compare
 *  button drives the model, else the slide's own. */
export function goalOf(t: CurveTool, ser: Any | null, slide: SlideState | null, live?: { params?: unknown; fp: Fp } | null): Goal | null {
  if (!slide) return null;
  const params = live ? live.params : slide.params, fp = live ? live.fp : slide.fp;
  let goal: Goal = P.ringAt(t, params, fp);
  // (A what-if slider on the curve's own setting: the case is a point of the curve, so the rings sit on the lines at the slider's value.)
  const ys = ser && live && live.params !== slide.params && P.onCurve(t, live.params, slide.params) ? P.curveAt(ser, goal.x) : null;
  if (ys) goal = { x: goal.x, ys, on: true };
  else if (ser && P.againstOf(t)) { const at = P.curveAt(ser, goal.x); goal = { x: goal.x, ys: goal.ys.map((y, j) => (j ? at?.[j] ?? null : y)) }; }
  return goal;
}
