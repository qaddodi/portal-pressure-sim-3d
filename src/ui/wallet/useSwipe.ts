import { useMemo, useRef, type PointerEvent as RPE } from 'react';
import type { Gesture } from './wallet-machine.ts';

/** Pointer handlers that report a finished movement (distance and time) once. A press on a button or a link keeps the press for itself. */
export function useGesture(onEnd: (g: Gesture, e: RPE) => void) {
  const start = useRef<{ x: number; y: number; t: number; id: number } | null>(null);
  const end = useRef(onEnd); end.current = onEnd;
  return useMemo(() => ({
    onPointerDown: (e: RPE) => {
      if ((e.target as HTMLElement).closest?.('button, a, input')) { start.current = null; return; }
      start.current = { x: e.clientX, y: e.clientY, t: e.timeStamp, id: e.pointerId };
    },
    onPointerUp: (e: RPE) => {
      const s = start.current; start.current = null;
      if (!s || s.id !== e.pointerId) return;
      end.current({ dx: e.clientX - s.x, dy: e.clientY - s.y, ms: e.timeStamp - s.t }, e);
    },
    onPointerCancel: () => { start.current = null; },
  }), []);
}
