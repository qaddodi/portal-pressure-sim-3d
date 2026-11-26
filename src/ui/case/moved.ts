// Whether the learner has moved the figure since the stop's shot was taken (docs/approved/play-the-case.md: "once you move the figure, it offers Back to this view"): a turn, a pan or a pinch
// on the figure, the wheel, a zoom button, or another view. Nothing is read from the camera: what the hand did is enough, and a camera that eases to the shot by itself is not a move.
import { useEffect, useState } from 'react';
import { useShell } from '../shell/store.ts';
import type { ViewId } from '../shell/views.ts';

/** a drag shorter than this is a tap (the gestures' own slop for a touch, scene/gesture/controller.ts) */
const SLOP = 8;

/** True once the figure has been moved at the stop `key` (its shot's view `view`); `reset` takes it back to false (Back to this view). Listens only while `on`. */
export function useFigureMoved(key: string, view: ViewId | null, on: boolean): [boolean, () => void] {
  const [moved, setMoved] = useState(false);
  const shown = useShell((s) => s.view);
  useEffect(() => { setMoved(false); }, [key]);
  useEffect(() => { if (on && view && shown !== view) setMoved(true); }, [on, view, shown]);
  useEffect(() => {
    if (!on || typeof document === 'undefined') return;
    const stage = document.querySelector('.stage-root');
    let down: { x: number; y: number } | null = null;
    const pd = (e: Event) => { const p = e as PointerEvent; down = { x: p.clientX, y: p.clientY }; };
    const pm = (e: Event) => { const p = e as PointerEvent; if (down && Math.abs(p.clientX - down.x) + Math.abs(p.clientY - down.y) > SLOP) { down = null; setMoved(true); } };
    const pu = () => { down = null; };
    const wheel = () => setMoved(true);
    const zoom = (e: Event) => { if ((e.target as Element | null)?.closest?.('.zoom-pill')) setMoved(true); };
    stage?.addEventListener('pointerdown', pd); stage?.addEventListener('pointermove', pm); stage?.addEventListener('pointerup', pu); stage?.addEventListener('pointercancel', pu);
    stage?.addEventListener('wheel', wheel, { passive: true });
    document.addEventListener('click', zoom, true);
    return () => {
      stage?.removeEventListener('pointerdown', pd); stage?.removeEventListener('pointermove', pm); stage?.removeEventListener('pointerup', pu); stage?.removeEventListener('pointercancel', pu);
      stage?.removeEventListener('wheel', wheel);
      document.removeEventListener('click', zoom, true);
    };
  }, [on]);
  return [moved, () => setMoved(false)];
}
