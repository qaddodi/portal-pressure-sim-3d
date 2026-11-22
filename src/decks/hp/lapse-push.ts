// The slow push of a time-lapse (2D presenter.js `pushTo`, `pushEnd`, `figView`): while the days run the camera drifts from the slide's own framing to `lapse.cam`, one even glide
// that gathers speed over its first fifth and settles over its last (cam-arc.js driftEase), as long as the days. What the slide shows when its days are not played (Back, a jump
// back) is the framing the days end on. The camera is the scene's (sceneApi.goTo, with the curve of its own); this file says where to, and when.
import { sceneApi } from '../../scene/api.ts';
import type { Shot } from '../../scene/camera/shots.ts';
import { driftEase } from '../../ui/deck/lapse-next.ts';
import { useUi } from '../../ui/ui-store.ts';

import { clock, type TimerId } from '../../clock/frame.ts';
const room = () => { const r = useUi.getState().boxes.free; return r.w > 0 && r.h > 0 ? r : null; };

let waiting: TimerId | null = null;
const STILL_POLL_MS = 40;

/** Stops a push that has not begun (the camera was still on its way to the slide's framing). A push under way is not stopped: the next slide's move takes over from where it is. */
export function cancelPush(): void { if (waiting) { clock.cancel(waiting); waiting = null; } }

/**
 * The push begins once the camera has landed on the slide's own framing (a push begun while it still glides would stop it dead and turn it: a zigzag), and takes what is left of the days
 * (`endAt`, a `clock.now()` time) so the two end together.
 */
export function startPush(shot: Shot, endAt: number): void {
  cancelPush();
  const go = () => {
    waiting = null;
    const r = room();
    if (!r) return;
    if (sceneApi.cameraMoving && clock.now() < endAt - 1500) { waiting = clock.after(go, STILL_POLL_MS); return; }
    sceneApi.goTo(shot, r, Math.max(300, endAt - clock.now()), driftEase);
  };
  go();
}

/** The days have ended (or Next ran them out): what is left of the push takes `ms`, the glide carrying the speed it has on and coming to rest (2D pushEnd); with no push begun it is one eased move there. */
export function endPush(shot: Shot, ms?: number): void {
  cancelPush();
  const r = room();
  if (r) sceneApi.goTo(shot, r, ms);
}

/** A slide whose days are not played (Back, a jump back): the figure shows the framing the days end on, in the one eased move. */
export const showPushEnd = (shot: Shot): void => endPush(shot);

/** The push of one slide's days to `shot`, as the lapse player takes it (hp/lapse.ts `Push`). */
export const pushFor = (shot: Shot) => ({ start: (endAt: number) => startPush(shot, endAt), end: (ms?: number) => endPush(shot, ms), cancel: cancelPush });
