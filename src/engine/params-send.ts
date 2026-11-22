// The one way the page changes the patient's parameters. The figure (scene/disease/targets.ts bodyTargets) draws from `patient.params`, and the worker does not echo a
// page-sent change back (worker-core.js setParams: "UI-originated: not echoed back"), so every change must reach the page's own copy as well as the worker.
// A patch is merged into the copy first (deep merge, as updateParams does), then the whole set goes to the worker: the worker fills a partial set from the model's
// defaults, so a bare patch would also reset everything else it did not name. `replace` puts a whole set in place of the copy (undo, a restored patient).
// tests/lint-rules.test.ts (rule raw-setparams) fails any other place that builds a `type: 'setParams'` message.
import { deepMerge } from './hales/portal/scenario.js';
import { engine } from './boot.ts';
import { patient, setParams } from './store.ts';

export interface SendOpts { settle?: boolean; ease?: number; replace?: boolean }

/** The parameters after `change` is applied to the page's copy (a pure merge: nothing is sent). */
export function mergedParams(change: unknown): unknown {
  const prev = patient.params;
  return prev && typeof prev === 'object' ? deepMerge(prev as Record<string, unknown>, (change ?? {}) as Record<string, unknown>) : change;
}

/** Change the patient's parameters: the page's copy first (so the next frame's figure sees it), then the worker. Returns the parameters now in force. */
export function sendParams(change: unknown, opts: SendOpts = {}): unknown {
  const next = opts.replace ? change : mergedParams(change);
  if (next == null) return null;
  setParams(next);
  const msg: { type: 'setParams'; params: unknown; settle: boolean; ease?: number } = { type: 'setParams', params: next, settle: opts.settle ?? false };
  if (opts.ease != null) msg.ease = opts.ease;
  try { engine().send(msg as Parameters<ReturnType<typeof engine>['send']>[0]); } catch { /* the engine is not up (a test): the local copy is the change */ }
  return next;
}
