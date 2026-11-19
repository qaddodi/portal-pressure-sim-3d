// The engine side of the curve's work: the presenter's ctx.run is the engine's 'sequence' message (kept apart from data.ts so the pure part loads in node).
import { engine } from '../../../engine/index.ts';
import type { RunFn, SlideState, State } from './data.ts';

/** The engine's 'sequence' as the presenter's ctx.run asks it: a missing `from` means the slide's own state. */
export function engineRun(slide: SlideState | null): RunFn {
  return (steps, from) => {
    const base = from === undefined ? slide?.base ?? slide?.snap ?? null : from;
    return engine().sequence(steps, base ?? undefined).then((r) => (r as unknown as State[]) ?? null, () => null);
  };
}

