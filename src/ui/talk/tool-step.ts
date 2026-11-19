// Next and Back on a slide whose data card takes its readings one Next at a time (2D presenter-tools.js `step` / `canStep`: the HVPG tracing). The card registers what it can do while it is up;
// the presenter's move asks it first and only moves on when it declined (ui/ui-store.ts `move`).
type Stepper = { can(dir: 1 | -1): boolean; step(dir: 1 | -1): boolean };
let cur: Stepper | null = null;
export function setToolStep(s: Stepper | null): void { cur = s; }
/** The card took the step (true): the slide stays. */
export const toolStep = (dir: 1 | -1): boolean => !!cur?.step(dir);
/** Whether `toolStep(dir)` would take a reading, nothing changed. */
export const toolCanStep = (dir: 1 | -1): boolean => !!cur?.can(dir);
