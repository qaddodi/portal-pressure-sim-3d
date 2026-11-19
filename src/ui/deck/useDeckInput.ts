import { useEffect } from 'react';
import { useUi } from '../ui-store.ts';
import { keyMove } from './presenter-machine.ts';

/** Keys that move through the talk. A control that uses the key itself (a button given Space, a field) keeps it. */
export function useDeckInput() {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
      if (t?.closest?.('button, a') && (e.key === ' ' || e.key === 'Enter')) return;
      const m = keyMove(e.key, e.shiftKey);
      if (!m) return;
      e.preventDefault();
      useUi.getState().move(m);
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, []);
}
