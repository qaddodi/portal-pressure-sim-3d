// The one "a press outside closes it" rule of the menus (surface/kinds.ts closesOnOutsidePress): a press that lands outside the surface and outside the control that opened it
// closes it. A press on the opener is the opener's own business (it toggles). The listener is the window's, in the capture phase, so it runs before a scrim's own handler.
import { useEffect, useRef, type RefObject } from 'react';

/** While `open`, a press outside every box in `inside` and outside the `opener` selector calls `onPress` (read when it fires, so a new closure does not rewire it). */
export function useOutsidePress(open: boolean, inside: readonly RefObject<Element | null>[], onPress: () => void, opener?: string): void {
  const live = useRef({ inside, onPress, opener });
  live.current = { inside, onPress, opener };
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Element | null, l = live.current;
      if (l.inside.some((r) => r.current?.contains(t as Node))) return;
      if (l.opener && t?.closest?.(l.opener)) return;
      l.onPress();
    };
    window.addEventListener('pointerdown', away, true);
    return () => window.removeEventListener('pointerdown', away, true);
  }, [open]);
}
