import { useEffect, useRef, type RefObject } from 'react';
import { attachSheetSwipe } from './sheet-swipe.ts';
import './sheet-swipe.css';   // (what a pulled sheet and its grab bar look like; kept out of node tests, which import sheet-swipe.ts alone)

/** Wires a sheet's swipe-down-to-close (sheet-swipe.ts) to its element for as long as it is mounted. `enabled` and `onClose` are read when they are needed, so a new closure does not rewire it. */
export function useSheetSwipe(ref: RefObject<HTMLElement | null>, onClose: () => void, enabled: () => boolean = () => true, on = true, prop?: 'translate' | 'transform'): void {
  const live = useRef({ onClose, enabled });
  live.current = { onClose, enabled };
  useEffect(() => {
    const el = ref.current;
    if (!el || !on) return;
    return attachSheetSwipe(el, { onClose: () => live.current.onClose(), enabled: () => live.current.enabled(), ...(prop ? { prop } : {}) });
  }, [ref, on, prop]);
}

/** The shell's frames are a bottom sheet on a phone: `.sh-root[data-bottom="true"][data-mode="free"]` (shell.css). */
export const frameIsSheet = (el: HTMLElement | null): boolean => { const r = el?.closest<HTMLElement>('.sh-root'); return !!r && r.dataset.bottom === 'true' && r.dataset.mode === 'free'; };

/** The phone's layout (the thumb dock): what makes a popover or a search sheet a sheet that can be pulled down. */
export const onPhone = (): boolean => typeof document !== 'undefined' && document.documentElement.classList.contains('thumb-ui');
