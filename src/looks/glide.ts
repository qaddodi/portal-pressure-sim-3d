// A change of look (Settings > Appearance, or the device going light/dark under "System") is never an instant swap: the whole page, the figure's canvas included, cross-fades
// from the old look to the new on one eased curve (owner, 20 Nov: "when changing ANYTHING in the app there should be a transition").
// The page and the scene each register an applier; one change runs them together inside a View Transition (the browser holds the old picture, the appliers paint the new look, the new
// picture is taken once the figure has drawn a frame in it, and the two cross-fade, `::view-transition-*` in shell/global.css). Where there is no View Transition the DOM's own colours
// ease (`html.look-glide`, global.css) and the figure changes at once. Reduce Motion, a hidden page and the first paint apply at once.
import type { LookId } from './looks.ts';
import { clock } from '../clock/frame.ts';

export const GLIDE_MS = 320;
type Applier = (look: LookId) => void;
export interface GlideEnv {
  /** Runs `apply` inside a View Transition and resolves when it ends; undefined where the browser has none. */
  transition?: (apply: () => Promise<void>) => void;
  /** Whether the person asked for less motion, or the page is not shown. */
  still(): boolean;
  /** Resolves once the figure has drawn a frame (or soon, where none comes). */
  drawn(): Promise<void>;
  /** The fallback: the DOM's colours ease. */
  ease?(): void;
}

export function createLookGlide(env: GlideEnv) {
  const appliers = new Set<Applier>();
  let current: LookId | null = null;
  const all = (look: LookId) => { for (const fn of [...appliers]) fn(look); };
  return {
    get current() { return current; },
    /** Registers an applier; it is run at once with the look in force. Returns its remover. */
    onLook(fn: Applier): () => void { appliers.add(fn); if (current) fn(current); return () => { appliers.delete(fn); }; },
    /** The look is now `next`: at once the first time or with Reduce Motion, otherwise eased. A change to the look already in force does nothing. */
    change(next: LookId): void {
      if (next === current) return;
      const first = current === null;
      current = next;
      if (first || env.still()) { all(next); return; }
      if (env.transition) { env.transition(async () => { all(next); await env.drawn(); }); return; }
      env.ease?.(); all(next);
    },
  };
}

/** The browser's: View Transitions, the motion preference, the clock's next frame. */
const browserEnv = (): GlideEnv => {
  const doc = typeof document === 'undefined' ? null : document as Document & { startViewTransition?: (cb: () => Promise<void>) => unknown };
  let timer = 0;
  return {
    transition: doc?.startViewTransition ? (apply) => { doc.startViewTransition!(apply); } : undefined,
    still: () => !doc || doc.visibilityState !== 'visible' || (typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches),
    drawn: () => new Promise<void>((res) => {
      const off = clock.on('tags', () => { off(); res(); }, 1e6);
      clock.invalidate('look');
      setTimeout(() => { off(); res(); }, 200);   // (no frame comes where nothing is drawn yet)
    }),
    ease: () => { if (!doc) return; const r = doc.documentElement; r.classList.add('look-glide'); clearTimeout(timer); timer = window.setTimeout(() => r.classList.remove('look-glide'), GLIDE_MS + 60); },
  };
};

export const lookGlide = createLookGlide(browserEnv());
