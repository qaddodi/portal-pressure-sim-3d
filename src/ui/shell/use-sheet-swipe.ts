import { useEffect, useRef, type RefObject } from 'react';
import { attachSheetSwipe } from './sheet-swipe.ts';
import './sheet-swipe.css';   // (what a pulled sheet and its grab bar look like; kept out of node tests, which import sheet-swipe.ts alone)

/** Wires a sheet's swipe-down-to-close (sheet-swipe.ts) to its element for as long as it is mounted. `enabled` and `onClose` are read when they are needed, so a new closure does not rewire it. */
export function useSheetSwipe(ref: RefObject<HTMLElement | null>, onClose: () => void, enabled: () => boolean = () => true, on = true, prop?: 'translate' | 'transform'): void {
  const live = useRef({ onClose, enabled });
  live.current = { onClose, enabled };
  // A sheet that is in the page only while it is shown (the patient menu, a settings menu) has no element when the hook first runs, and a swipe wired once at mount never found it (owner, 23 Nov, iPad upright:
  // "when I swipe it down, it doesn't close"). So after every render the hook looks at the element it is given and wires the swipe to whichever one is there, and unwires it when it is gone.
  const wired = useRef<{ el: HTMLElement; prop: string | undefined; off: () => void } | null>(null);
  useEffect(() => {
    const el = on ? ref.current : null, w = wired.current;
    if (w && w.el === el && w.prop === prop) return;
    w?.off(); wired.current = null;
    if (el) wired.current = { el, prop, off: attachSheetSwipe(el, { onClose: () => live.current.onClose(), enabled: () => live.current.enabled(), ...(prop ? { prop } : {}) }) };
  });
  useEffect(() => () => { wired.current?.off(); wired.current = null; }, []);
}

/** The shell's frames are a bottom sheet on a phone: `.sh-root[data-bottom="true"][data-mode="free"]` (shell.css). */
export const frameIsSheet = (el: HTMLElement | null): boolean => { const r = el?.closest<HTMLElement>('.sh-root'); return !!r && r.dataset.bottom === 'true' && r.dataset.mode === 'free'; };

/** The phone's layout (the thumb dock): what makes a popover or a search sheet a sheet that can be pulled down. */
export const onPhone = (): boolean => typeof document !== 'undefined' && document.documentElement.classList.contains('thumb-ui');
