// The figure dims and comes back (2D: `view.classList.add('pz-out')`, putHealthy's `view.style.opacity = '.22'`): a new patient is put in, or a talk ends, under a dimmed figure, so nobody is
// ever seen turning into somebody else. A wash of the page's own colour over the figure and its labels (under the cards and the chrome), eased in and out; nothing here moves per frame.
// `.22` is the 2D figure's own level: the wash carries the rest (1 - .22).
import { fadeMs } from '../a11y/motion.ts';
import { D_SURFACE, EASE_ARRIVE } from '../motion.ts';

export const DIP_LEVEL = 0.78;
/** How the dip lifts again (2D putHealthy: the dim lifts over 260 ms). */
export const DIP_OUT_MS = 260;

let node: HTMLDivElement | null = null;
let anim: Animation | null = null;
let level = 0;
let holder: unknown = null;

function el(): HTMLDivElement | null {
  if (typeof document === 'undefined') return null;
  if (node && node.isConnected) return node;
  const e = document.createElement('div');
  e.className = 'dk-dip';
  e.setAttribute('aria-hidden', 'true');
  e.style.cssText = `position:fixed;inset:0;z-index:9;pointer-events:none;background:var(--stage-bg);opacity:${level}`;
  document.body.append(e);
  return (node = e);
}

/** Ease the wash to `to` (0 clear, DIP_LEVEL dimmed) over `ms`, from wherever it stands; resolves when it has landed. */
function ease(to: number, ms: number): Promise<void> {
  const e = el();
  if (!e || typeof e.animate !== 'function') { level = to; return Promise.resolve(); }
  const from = level;
  anim?.cancel();
  e.style.opacity = String(from);
  const a = (anim = e.animate([{ opacity: from }, { opacity: to }], { duration: ms, easing: EASE_ARRIVE, fill: 'forwards' }));
  // (a retarget in mid-flight starts from the level it had reached, read here once)
  level = to;
  return a.finished.then(() => { if (anim === a) { e.style.opacity = String(to); a.cancel(); anim = null; } }, () => undefined);
}

/** The wash comes in over D_SURFACE (Reduce Motion too: it is a fade). `who` keeps it until it lets go (a newer holder takes over). Resolves when it is dim. */
export function dipIn(who: unknown = null, ms = fadeMs(D_SURFACE)): Promise<void> {
  holder = who;
  const e = el();
  if (e && anim) { try { level = Number(getComputedStyle(e).opacity) || level; } catch { /* keep */ } }
  return ease(DIP_LEVEL, ms);
}

/** The wash lifts, when `who` still holds it (a newer dip keeps it dim: its own lift is what ends it). Resolves when it is clear. */
export function dipOut(who: unknown = null, ms = fadeMs(DIP_OUT_MS)): Promise<void> {
  if (holder !== who && holder !== null) return Promise.resolve();
  holder = null;
  const e = el();
  if (e && anim) { try { level = Number(getComputedStyle(e).opacity) || level; } catch { /* keep */ } }
  return ease(0, ms);
}

/** Whether the figure is dimmed (or dimming) now. */
export const dipped = (): boolean => level > 0;
