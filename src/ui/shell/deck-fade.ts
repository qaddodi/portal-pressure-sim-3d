// The top bar and the dock fade away for a talk and back (owner: nothing pops). They used to fade as wholes (`opacity` on .topbar and .vdock), but a backdrop blur sees nothing past an ancestor
// with opacity < 1 (it is a backdrop root), so every frosted face inside them lost its blur on the first frame of the fade. Now the wholes stay opaque and each part fades by itself: the glass
// faces (which keep their own blur while their own opacity falls) and every glass-free part that is a child of something holding glass. CSS (chrome-3d.css) sets the resting state, 0 in a talk;
// this plays the way there and back on the compositor, in the commit that changes the mode (a layout effect, so no frame is drawn at the new state first).
import { D_SURFACE } from '../a11y/motion.ts';

/** The frosted faces the glass list gives the top bar and the dock (glass.css): the patient and figure pills' faces, the actions pill, the view switch, the dock's and the view pill's faces. */
export const FROSTED = '.tb-face, .vd-face, .vp-face, .topbar .float-pill:not(.has-face):not(.tb-id), .topbar #viewSeg';
/** What fades: a part with no glass inside it whose parent holds glass (a glass face itself, or the words and buttons beside one). A part that holds glass never fades, so its glass keeps its blur. */
export const FADERS = `:is(.topbar, .vdock):has(${FROSTED}) > :not(:has(${FROSTED})), :is(.topbar, .vdock) :has(${FROSTED}) > :not(:has(${FROSTED}))`;

const ID = 'deck-fade';
export function fadeChrome(root: ParentNode, away: boolean): void {
  for (const el of root.querySelectorAll<HTMLElement>(FADERS)) {
    el.getAnimations?.().forEach((a) => { if (a.id === ID) a.cancel(); });
    if (!el.animate) continue;
    const a = el.animate({ opacity: away ? [1, 0] : [0, 1] }, { duration: D_SURFACE, easing: 'cubic-bezier(.2, .8, .2, 1)', fill: away ? 'forwards' : 'none' });
    a.id = ID;
  }
}
