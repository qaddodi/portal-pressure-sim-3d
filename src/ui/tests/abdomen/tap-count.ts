// The litres a slide's paracentesis has taken off: one counter for the whole app, fed by every engine frame (see `tapCounter` in model.ts for why a render's samples, or the
// belly the slide landed on, are not enough).
// It starts when the slide's run does (the procedure's phase turns to play: ui/deck/procs-state.ts), counts every frame after, and is cleared when another slide's procedure
// comes in; the pane reads `peak`.
import { onFrame, latest } from '../../../engine/index.ts';
import { useProc } from '../../deck/procs-state.ts';
import { metricsOf } from '../frame.ts';
import { tapCounter, WORDS } from './model.ts';

export const tapCount = tapCounter();
const litresOf = (f: Parameters<typeof metricsOf>[0]): number => { const v = metricsOf(f)?.ascites?.volume; return typeof v === 'number' ? v / 1000 : NaN; };
const isTap = (name: string): boolean => name === WORDS.paracentesis;
let watching = false, slide = '';
/** Starts the counting (idempotent, once for the app): every frame is seen, and the run's start is heard the moment it happens, between renders. */
export function watchTap(): void {
  if (watching) return;
  watching = true;
  onFrame((f) => { if (tapCount.live && isTap(useProc.getState().name)) tapCount.see(litresOf(f)); });   // (lives for the page)
  useProc.subscribe((s, was) => {   // (lives for the page)
    if (!isTap(s.name)) return;   // (the procedure leaves with its slide: what was counted stays for a Back that lands on the finished slide)
    if (s.key !== slide) { slide = s.key; tapCount.reset(); }
    if (s.phase === 'play' && was.phase !== 'play') tapCount.begin(litresOf(latest.frame));
  });
}
/** A pane that mounted after the run began (nothing heard it): counts from now, with the litres it has. */
export function syncTap(running: boolean, litres: number): void {
  if (running && !tapCount.live) tapCount.begin(litres);
}
