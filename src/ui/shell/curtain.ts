// The talk's start cover (2D presenter-start.js coverUp / coverDown): "Preparing the slides", a calm dimming of the screen while the layout, the first patient and the first slide are set up
// under it. It fades in, everything is made ready behind it, and it fades away once the first slide has landed. Its look is 2D's own (`.pz-cover`, css2d/app-08-cards.css); while it is up
// `html.pz-covered` keeps the slide's cards unseen under it, so their words are never seen coming in. Never left up: it gives itself up after COVER_MAX_MS.
import { D_SMALL, D_SURFACE, fadeMs } from '../a11y/motion.ts';
import { W } from '../deck/words.ts';

import { clock, type TimerId } from '../../clock/frame.ts';
export const COVER_MAX_MS = 12000;
let cover: HTMLDivElement | null = null;
let giveUp: TimerId | undefined;

/** The cover comes up (what is opening is its cue). Resolves once it has faded in. */
export function coverUp(what = ''): Promise<void> {
  if (typeof document === 'undefined') return Promise.resolve();
  document.documentElement.classList.add('pz-covered');
  clock.cancel(giveUp); giveUp = clock.after(() => { void coverDown(); }, COVER_MAX_MS);
  if (!cover || !cover.isConnected) {
    const c = document.createElement('div');
    c.className = 'pz-cover'; c.setAttribute('role', 'status');
    const spin = document.createElement('i'); spin.setAttribute('aria-hidden', 'true');
    const cue = document.createElement('span');
    if (what) { cue.append(what); const small = document.createElement('small'); small.textContent = W.preparing; cue.append(small); } else cue.textContent = W.preparing;
    c.append(spin, cue);
    document.body.append(c);
    cover = c;
  }
  const c = cover;
  // (the class that brings the opacity up is set a task later, so the first paint is the cover at 0 and the fade is seen)
  return new Promise((done) => { clock.after(() => { c.classList.add('on'); clock.after(done, fadeMs(D_SMALL)); }, 0); });
}

/** The cover fades away, and the cards under it show. Resolves when it is gone. */
export function coverDown(): Promise<void> {
  clock.cancel(giveUp);
  const c = cover;
  if (!c) { document.documentElement.classList.remove('pz-covered'); return Promise.resolve(); }
  c.classList.remove('on');
  document.documentElement.classList.remove('pz-covered');
  return new Promise((done) => clock.after(() => { if (cover === c && !c.classList.contains('on')) { c.remove(); cover = null; } done(); }, fadeMs(D_SURFACE) + 40));
}

export const covered = (): boolean => typeof document !== 'undefined' && document.documentElement.classList.contains('pz-covered');
