// The talk drives the scene: the shot of the slide on show (fitted into the room the cards leave free), the room alone when a card moves,
// and the HVPG catheter, run on the 2D app's one clock (cath-clock.ts: hvpg-clock.js's route, balloon and column on one script time, the same time the tracing card reads, so the balloon fills and the
// trace steps in the same frame). The scene never reads the deck; this is the only place that tells it.

import { sceneApi } from '../../scene/api.ts';
import { clock, type Hold } from '../../clock/frame.ts';
import { easeArrive } from '../../clock/tween.ts';
import { useUi } from '../ui-store.ts';
import { viewAt, cathPlace } from './presenter-machine.ts';
import { makeCathClock, aimCath, stepCath, poseAt, cathScript, rankOf, ARRIVE_MS, type CathPose } from './cath-clock.ts';
import { tipCloseShot, closeUpOf } from './cath-shot.ts';
import type { Shot, ShotName } from '../../scene/camera/shots.ts';
import type { LensId } from '../../scene/lenses/model.ts';
import type { CathState } from '../../decks/schema.ts';

/** The time the catheter takes to come in from the neck: the route's leg at the travel speed (hvpg-clock.js legMs, 3.4 s), after its 300 ms of stillness. procs-link.ts waits this long before the blocked vein's pushes. */
export { ARRIVE_MS };

export function linkScene(): () => void {
  const cc = makeCathClock(), pose: CathPose = { advance: 0, balloon: 0, column: 0 };
  let place: CathState | null = null, drawn = false, hold: Hold | null = null;
  let shot: ShotName | Shot | null = null;
  let lens: LensId | null = null;
  cathScript.on = true; cathScript.t = 0;

  // the catheter: one frame, one time. Runs before the card systems (order -10) so the trace card reads this frame's time, not the last one's.
  const offClock = clock.on('tween', (f) => {
    const moving = stepCath(cc, f.dt);
    cathScript.t = cc.clk.t;
    if (moving || !drawn) {
      poseAt(cc.clk.t, pose);
      sceneApi.setCatheter({ advance: pose.advance, balloon: pose.balloon, column: pose.column });
      drawn = true;
    }
    if (!moving && hold) { hold.release(); hold = null; }
  }, -10);

  const sync = (stepped = false) => {
    const { stops, pos, boxes } = useUi.getState();
    if (!stops.length) return;
    const v = viewAt(stops, pos);
    const at = cathPlace(stops, pos);
    if (at !== place || !drawn) {
      aimCath(cc, at, Math.abs(rankOf(at) - rankOf(place)) > 1);
      place = at; drawn = false;
      if (cc.clk.t !== cc.clk.goal && !hold) hold = clock.hold('catheter');
      clock.invalidate('catheter');
    }
    const room = boxes.free;
    if (room.w <= 0 || room.h <= 0) return;   // the cards have not been measured yet: no room to frame in
    // The catheter's own shots: the tip close up, the balloon just behind it and the vein ahead (2D cathFocus 'tip', both). The route step keeps the slide's own (the whole way in).
    const view = v.scene ? v.scene.view : 'body', close = view === 'body' && !v.slide?.visual ? closeUpOf(at) : null;
    const want = (close ? tipCloseShot(close) : null) ?? v.shot;
    if (want !== shot) {
      shot = want;
      // a ported slide says its own view and its lens; the slice's slides are the body. A Circuit slide frames its region of the map and draws the resistors it names.
      if (v.scene?.view === 'circuit') sceneApi.showCircuit(room, { box: v.scene.circuit?.box ?? null, kMax: v.scene.circuit?.kMax ?? null, resistors: (v.scene.circuit?.resistors ?? []) as never, caudate: !!v.scene.circuit?.caudate });
      else sceneApi.showShot(v.scene ? v.scene.view : 'body', want, room, want === v.shot);   // (the slide's own framing takes a slide's time; the catheter's tip close-ups keep the hand's glide)
    } else if (stepped || !sceneApi.roomIs(room)) sceneApi.setRoom(room, undefined, stepped);   // (a dock glide that has landed where it told the camera to go asks for nothing more)   // a step on to a slide with the same shot still brings the viewer's turn home
    if (v.scene && v.scene.lens !== lens) { lens = v.scene.lens; sceneApi.setLens(lens); }
  };

  sync();
  // a dock glide has set off: the figure reframes for where the card is going, in the glide's own time, not once it has landed (2D presenter-zoom.js dockTo: layout() then reframe(ms))
  const offHint = useUi.subscribe((s, prev) => { const h = s.roomHint; if (h && h !== prev.roomHint && h.free.w > 0 && h.free.h > 0) sceneApi.setRoom(h.free, h.ms, false, false, easeArrive); });
  const off = useUi.subscribe((s, prev) => { if (s.pos !== prev.pos || s.boxes.free !== prev.boxes.free || s.stops !== prev.stops) sync(s.pos !== prev.pos || s.stops !== prev.stops); });
  // (leaving the talk takes the catheter out: it never stays on the free figure)
  return () => { off(); offHint(); offClock(); hold?.release(); cathScript.on = false; cathScript.t = 0; sceneApi.setCatheter({ advance: 0, balloon: 0, column: 0 }); };
}
