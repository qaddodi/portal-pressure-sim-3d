// The parts most sessions open a little later are read in once the page has loaded and gone idle, one at a time, so the first tap on them does not wait for the
// network (the 2D app's warmUp, its src/ui/main.js). Nothing here is needed for the first picture; a part that fails to load is fetched again when it is asked for.
import { loadToolCard } from '../ui/talk/tool-card-load.ts';

import { clock } from '../clock/frame.ts';
const STEPS: (() => Promise<unknown>)[] = [() => loadToolCard()];   // (a talk's charts)

export function warmLater(delayMs = 3000): void {
  if (typeof window === 'undefined') return;
  const idle = (fn: () => void) => { const ric = (window as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => void }).requestIdleCallback; if (ric) ric(fn, { timeout: 4000 }); else clock.after(fn, 1500); };
  const next = (i: number) => { const step = STEPS[i]; if (step) idle(() => { void step().catch(() => undefined).then(() => next(i + 1)); }); };
  const go = () => clock.after(() => next(0), delayMs);
  if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
}
