// The parts most sessions open a little later are read in once the page has loaded and gone quiet, one at a time, so the first tap on them does not wait for the
// network (the 2D app's warmUp, its src/ui/main.js). Nothing here is needed for the first picture; a part that fails to load is fetched again when it is asked for.
// Each rung is a job in the one background slot (clock/idle.ts): it never starts while anything moves or a finger is down, and the next rung is asked for only when this one has loaded.
import { loadToolCard } from '../ui/talk/tool-card-load.ts';
import { whenQuietOnce } from '../clock/idle.ts';
import { clock } from '../clock/frame.ts';
import { stamp } from './timeline.ts';

const STEPS: (() => Promise<unknown>)[] = [() => loadToolCard()];   // (a talk's charts)

export function warmLater(delayMs = 3000): void {
  if (typeof window === 'undefined') return;
  const next = (i: number) => { const step = STEPS[i]; if (!step) stamp('instruments'); else whenQuietOnce(() => { void step().catch(() => undefined).then(() => next(i + 1)); }, { tag: `warm:${i}`, maxWaitMs: 6000 }); };
  const go = () => clock.after(() => next(0), delayMs);
  if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
}
