// One calm cue for every wait the viewer did not expect (splash plan A7, 22 Nov): 2D's "Preparing…" look (a small spinner and the words) in a quiet pill, shown only when the wait passes `after` ms (300 by default),
// eased in and out, never blanking the figure (it sits over it, the figure stays faintly visible). The three waits that can happen after the first picture all call it, so they read the same: a dive held for its
// parts (scene.ts goTo), the Circuit's first open (view-actions.ts) and a pane whose code has not arrived (LazyBoundary). `tests/wait-cue.test.ts` checks that each held path calls it.
import { clock } from '../../clock/frame.ts';
import { D_SMALL, fadeMs } from '../a11y/motion.ts';

export const CUE_AFTER_MS = 300;
export interface CueOptions { /** where it sits: inside this element (centred in it), or over the whole screen when absent */ host?: HTMLElement | null; /** ms of wait before it shows */ after?: number }

/** The words: what is being prepared, in one calm line, and how far it has come when something that is being read in says (a share from 0 to 1: the Lobule's weld file on a slow link). */
export const cueWords = (what: string, share?: number): string => `Preparing ${what}…${share === undefined ? '' : ` ${Math.round(Math.min(1, Math.max(0, share)) * 100)}%`}`;
/** The end of a wait, which can also be told how far the thing waited for has come. */
export interface Cue { (): void; /** how far what is read in has come (0 to 1), or null to say no more of it (the words go back to the plain line) */ progress?: (share: number | null) => void }

/** A wait has begun: returns `done`, to call when it ends. A wait shorter than `after` shows nothing at all. */
export function waitCue(what: string, o: CueOptions = {}): Cue {
  if (typeof document === 'undefined') return () => undefined;
  let el: HTMLDivElement | null = null, words: HTMLSpanElement | null = null, ended = false, share: number | undefined;
  const timer = clock.after(() => {
    if (ended) return;
    const c = document.createElement('div');
    c.className = o.host ? 'sh-waitcue in-host' : 'sh-waitcue'; c.setAttribute('role', 'status');
    const spin = document.createElement('i'); spin.setAttribute('aria-hidden', 'true');
    const w = document.createElement('span'); w.textContent = cueWords(what, share);
    words = w; c.append(spin, w);
    (o.host ?? document.body).append(c);
    el = c;
    clock.after(() => { if (!ended) c.classList.add('on'); }, 0, 'wait-cue-on');   // (a task later, so the first paint is the cue at 0 and the fade is seen)
  }, o.after ?? CUE_AFTER_MS, 'wait-cue');
  const done: Cue = () => {
    if (ended) return;
    ended = true; clock.cancel(timer);
    const c = el;
    if (!c) return;
    c.classList.remove('on');
    clock.after(() => c.remove(), fadeMs(D_SMALL) + 40, 'wait-cue-off');
  };
  // (the share is kept for a cue that has not shown yet: a short wait shows nothing at all, a longer one shows how far it has come)
  done.progress = (k) => {
    const step = k === null ? undefined : Math.floor(Math.min(1, Math.max(0, k)) * 20) / 20;   // (in fives of a hundred: a status line read aloud is not said at every chunk that arrives)
    if (ended || step === share) return;
    share = step; if (words) words.textContent = cueWords(what, share);
  };
  return done;
}
