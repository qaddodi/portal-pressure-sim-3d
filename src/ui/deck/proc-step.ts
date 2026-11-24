// Next and Back on a slide whose procedure is guided by them (2D presenter.js procNext / procBack): the slide's procedure link registers what it can do while the slide is up, and the presenter's move
// (ui/ui-store.ts `move`, which every key, swipe, clicker press and the presenter view go through) asks it first and only moves the talk when it declined. The same shape as talk/tool-step.ts.
type Stepper = ((dir: 1 | -1) => boolean) & { can?: (dir: 1 | -1) => boolean };
let cur: Stepper | null = null;
export function setProcStep(s: Stepper | null): void { cur = s; }
/** The procedure took the key (true): it played or took back one step, and the slide stays. */
export const procStep = (dir: 1 | -1): boolean => !!cur?.(dir);
/** Whether `procStep(dir)` would take the key (a step to play or take back), nothing changed: a swipe on such a slide steps the procedure and never moves a card. */
export const procCanStep = (dir: 1 | -1): boolean => !!cur?.can?.(dir);
