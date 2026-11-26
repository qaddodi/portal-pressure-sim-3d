// Watching a treatment the case has already done (Mohammad, 26 Nov: "we have EUS glue of gastric varix animation"): a stop's Look closer that plays the figure's own procedure choreography (the slides'
// EUS coils and glue: the echoendoscope down to the fundus, the needle into the varix, the coil and the cyanoacrylate cast) on the patient the stop stands on. Nothing is changed in the patient: the
// course did it on the day (the model the stop kept already has the varix obliterated), so nothing is asked, and nothing waits on the model. The camera follows the scope as the slides' does and goes
// back to the stop's own shot when the run ends; leaving the stop (Continue, the bar, the end of the case) stops it. The scope itself is the figure's (scene/devices/probes), driven by the run.
import { Vector3 } from 'three';
import { sceneApi } from '../../scene/api.ts';
import { useUi } from '../ui-store.ts';
import { viewRoom } from '../shell/room.ts';
import { cutRoom } from '../tests/room.ts';
import { tipShot } from '../deck/procs-plan.ts';
import { useCase } from './store.ts';
import { showShot } from './shot.ts';

const V = new Vector3();
let kindOn = '', shotAt = '';

/** The camera follows the scope as a slide's does: the way in as one glide behind the tip, then a close shot where it works. */
function camera(shot: string, kind: string): void {
  if (!shot || shot === shotAt) return;
  const tip = sceneApi.procedure.tip(V);
  if (!tip) return;
  const { vp, device } = useUi.getState(), room = cutRoom(viewRoom('anatomic', vp, device));
  shotAt = shot;
  if (shot === 'way') { sceneApi.follow([tip.x, tip.y, tip.z]); return; }
  const sh = tipShot(shot, tip, kind);
  if (!sh) return;
  sceneApi.follow(null);
  sceneApi.goTo(sh, room, 1100);
}

/** Stop what is playing (a stop is left, the case ends, or the same look is pressed again). */
export function stopWatch(): void {
  if (!kindOn) return;
  kindOn = ''; shotAt = '';
  sceneApi.follow(null);
  if (sceneApi.procedure.playing) sceneApi.procedure.stop();
}

/** Play `kind` (a procedure of the scene's: 'eusglue') on the figure, from its start to its end, at the stop the case is at. */
export function watchProcedure(kind: string): void {
  stopWatch();
  kindOn = kind; shotAt = '';
  sceneApi.procedure.play(kind, {
    onFrame: (r) => { if (kindOn === kind) camera(String(r.shot || ''), kind); },
    onEnd: () => {
      if (kindOn !== kind) return;
      kindOn = ''; shotAt = '';
      sceneApi.follow(null);
      const s = useCase.getState(), stop = s.phase === 'stop' ? s.stops[s.at] : null;
      if (stop) showShot(stop.shot);   // (back to the stop's own framing)
    },
    // (stopped before its end by something else on the figure: the camera is theirs now)
    onStop: () => { if (kindOn === kind) { kindOn = ''; shotAt = ''; sceneApi.follow(null); } },
  });
}

// A run belongs to the stop it was started at: the case leaving the stop (on the way, at another stop, ended, left) ends it.
useCase.subscribe((s, was) => { if (kindOn && (s.at !== was.at || s.phase !== was.phase)) stopWatch(); });
