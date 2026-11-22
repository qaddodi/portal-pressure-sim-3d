// One calm cue for every wait the viewer did not expect (splash plan A7, 22 Nov): 2D's "Preparing…" look (a small spinner and the words) in a quiet pill, shown only when the wait passes `after` ms (300 by default),
// eased in and out, never blanking the figure (it sits over it, the figure stays faintly visible). The three waits that can happen after the first picture all call it, so they read the same: a dive held for its
// parts (scene.ts goTo), the Circuit's first open (view-actions.ts) and a pane whose code has not arrived (LazyBoundary). `tests/wait-cue.test.ts` checks that each held path calls it.
import { clock } from '../../clock/frame.ts';
import { D_SMALL, fadeMs } from '../a11y/motion.ts';

export const CUE_AFTER_MS = 300;
export interface CueOptions { /** where it sits: inside this element (centred in it), or over the whole screen when absent */ host?: HTMLElement | null; /** ms of wait before it shows */ after?: number }

/** The words: what is being prepared, in one calm line. */
export const cueWords = (what: string): string => `Preparing ${what}…`;

/** A wait has begun: returns `done`, to call when it ends. A wait shorter than `after` shows nothing at all. */
export function waitCue(what: string, o: CueOptions = {}): () => void {
  if (typeof document === 'undefined') return () => undefined;
  let el: HTMLDivElement | null = null, ended = false;
  const timer = clock.after(() => {
    if (ended) return;
    const c = document.createElement('div');
    c.className = o.host ? 'sh-waitcue in-host' : 'sh-waitcue'; c.setAttribute('role', 'status');
    const spin = document.createElement('i'); spin.setAttribute('aria-hidden', 'true');
    const words = document.createElement('span'); words.textContent = cueWords(what);
    c.append(spin, words);
    (o.host ?? document.body).append(c);
    el = c;
    clock.after(() => { if (!ended) c.classList.add('on'); }, 0, 'wait-cue-on');   // (a task later, so the first paint is the cue at 0 and the fade is seen)
  }, o.after ?? CUE_AFTER_MS, 'wait-cue');
  return () => {
    if (ended) return;
    ended = true; clock.cancel(timer);
    const c = el;
    if (!c) return;
    c.classList.remove('on');
    clock.after(() => c.remove(), fadeMs(D_SMALL) + 40, 'wait-cue-off');
  };
}
