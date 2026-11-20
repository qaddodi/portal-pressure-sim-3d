// Where a time-lapse slide's days end the camera (2D presenter.js lapseCam), with no scene in it: planned from the copied slide alone, so a node test reads it.
import type { Shot } from '../../scene/camera/shots.ts';
import { camPlan } from './cams.ts';
import type { CopiedSlide } from './types.ts';

const sameShot = (a: Shot, b: Shot) => a.r === b.r && a.target[0] === b.target[0] && a.target[1] === b.target[1] && a.half[0] === b.half[0] && a.half[1] === b.half[1];

/**
 * Where a slide's days end the camera, or null (2D lapseCam, and pushTo's own conditions): the slide names `lapse.cam`, is not a visual or a catheter slide (those drive their own
 * camera), is on the anatomy (not the Circuit, not the lobule or sinusoid: a push is a move on the plate), and the framing is not the one it already has.
 */
export function pushShotOf(s: CopiedSlide): Shot | null {
  const cam = (s.lapse as { cam?: unknown } | null | undefined)?.cam;
  if (cam == null || s.visual || s.cath || s.view === 'circuit') return null;
  try {
    const end = camPlan(cam as CopiedSlide['cam']), own = camPlan(s.cam, s.view);
    if (end.kind !== 'body' || own.kind !== 'body') return null;
    return sameShot(end.shot, own.shot) ? null : end.shot;
  } catch { return null; }   // (a name neither app has: tests/deck-plan fails it; here the camera simply stays)
}
