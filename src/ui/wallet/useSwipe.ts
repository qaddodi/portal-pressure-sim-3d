import { useMemo, useRef, type PointerEvent as RPE } from 'react';
import type { Gesture } from './wallet-machine.ts';

/** A press that is a control's own: it came down on a button, link or input that is NOT the element the handlers are on. (The wallet's strip IS a button carrying these handlers: its own press is the gesture, which
 *  is what the closest() test used to drop, so a touch or a click on the strip did nothing.) */
export function ownsPress(target: EventTarget | null, current: EventTarget | null): boolean {
  const hit = (target as Element | null)?.closest?.('button, a, input') ?? null;
  return !!hit && hit !== current;
}

/** Pointer handlers that report a finished movement (distance and time) once. A press on a button or a link keeps the press for itself. */
export function useGesture(onEnd: (g: Gesture, e: RPE) => void) {
  const start = useRef<{ x: number; y: number; t: number; id: number } | null>(null);
  const end = useRef(onEnd); end.current = onEnd;
  return useMemo(() => ({
    onPointerDown: (e: RPE) => {
      if (ownsPress(e.target, e.currentTarget)) { start.current = null; return; }
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
