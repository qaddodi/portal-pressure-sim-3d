// The node runner for a deck's steps: the engine host's own `sequence` (what the worker runs for the page), on this thread. Tests and the gen script use it;
// the page runs the same steps on the worker. No browser, no pictures, no timing.
import { createCore } from '../../engine/hales/host/worker-core.js';
import { flagStep } from '../../engine/hv-flag.ts';
import type { Fingerprint, RunSteps, Step } from './numbers.ts';

export const runStepsNode: RunSteps = async (steps: Step[]) => {
  const out: Fingerprint[] = [];
  const core = createCore((m: { type: string; i?: number; fp?: Fingerprint; params?: unknown }) => { if (m.type === 'seqStep') out[m.i!] = flagStep({ fp: m.fp!, params: m.params }).fp; });
  core.handle({ type: 'run', running: false });   // (no live clock left ticking)
  await core.handle({ type: 'sequence', steps, reqId: 1 });
  core.dispose();
  return out;
};
