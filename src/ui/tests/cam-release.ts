// Giving the camera back (owner, 21 Nov, iPhone: opened EUS-PPG on the Endoscopy tab, closed the Tests card before the scope came, and the camera stayed on the EUS framing, springing back there
// whenever he moved it). Root cause: a runner (EUS-PPG, the IR pane's catheter, Watch row and PPG) claims the camera as it plays (a shot per step, a follow of the tip) and gives it back only in its
// own `onEnd`; a run that is STOPPED (the card closes, a new patient, another control stops the procedure layer) never reaches `onEnd`, so the claim, and the framing, were left behind.
// Every runner now gives the camera back through this one function from its `onStop` (scene/procedures/layer.ts PlayOptions.onStop, called by `stop()`), and the same function ends a run that
// finishes. In another view (a view change is what stopped it) the new view's own move stands: only the follow ends.
import { sceneApi } from '../../scene/api.ts';
import { useShell } from '../shell/store.ts';
import { useUi } from '../ui-store.ts';
import { freeRoom } from '../shell/room.ts';
import { cutRoom } from './room.ts';
import { reframeSlide } from '../deck/scene-link.ts';

/** End a follow of the tip and ease the camera back to whoever owns it underneath (never a snap): in a talk the slide's own framing (scene-link caches the shot it sent, so it is told), else free play on the body. */
export function releaseCamera(): void {
  sceneApi.follow(null);
  if (reframeSlide()) return;   // (integration review I4: 'play' here threw away the slide's framing, and the talk never put it back until the next slide)
  if (useShell.getState().view !== 'anatomic') return;
  const { vp, device } = useUi.getState();
  sceneApi.goTo('play', cutRoom(freeRoom(vp, device)));
}
