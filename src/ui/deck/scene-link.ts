// The talk drives the scene: the shot of the slide on show (fitted into the room the cards leave free), the room alone when a card moves,
// and the catheter's advance and balloon, tweened on the clock. The scene never reads the deck; this is the only place that tells it.

import { sceneApi } from '../../scene/api.ts';
import { clock } from '../../clock/frame.ts';
import { Tweened, easeInOutCubic, easeArrive } from '../../clock/tween.ts';
import { useUi } from '../ui-store.ts';
import { viewAt, catheterAt } from './presenter-machine.ts';
import type { Shot, ShotName } from '../../scene/camera/shots.ts';
import type { LensId } from '../../scene/lenses/model.ts';

/** The catheter's route is a slow, readable move (it is the lesson); the balloon is quicker. */
export const ADVANCE_MS = 2600;
export const BALLOON_MS = 900;

export function linkScene(): () => void {
  const advance = new Tweened(0, 'catheter-advance');
  const balloon = new Tweened(0, 'catheter-balloon');
  let pending = true;
  let shot: ShotName | Shot | null = null;
  let lens: LensId | null = null;

  const offClock = clock.on('tween', () => {
    const moving = advance.moving || balloon.moving;
    if (!moving && !pending) return;
    sceneApi.setCatheter({ advance: advance.value, balloon: balloon.value });
    pending = moving;
  }, 0);

  const sync = (stepped = false) => {
    const { stops, pos, boxes } = useUi.getState();
    if (!stops.length) return;
    const v = viewAt(stops, pos);
    const cath = catheterAt(stops, pos);
    if (advance.target !== cath.advance) advance.to(cath.advance, { ms: ADVANCE_MS, ease: easeInOutCubic });
    if (balloon.target !== cath.balloon) balloon.to(cath.balloon, { ms: BALLOON_MS, ease: easeArrive });
    pending = true;
    const room = boxes.free;
    if (room.w <= 0 || room.h <= 0) return;   // the cards have not been measured yet: no room to frame in
    if (v.shot !== shot) {
      shot = v.shot;
      // a ported slide says its own view and its lens; the slice's slides are the body. A Circuit slide frames its region of the map and draws the resistors it names.
      if (v.scene?.view === 'circuit') sceneApi.showCircuit(room, { box: v.scene.circuit?.box ?? null, kMax: v.scene.circuit?.kMax ?? null, resistors: (v.scene.circuit?.resistors ?? []) as never, caudate: !!v.scene.circuit?.caudate });
      else sceneApi.showShot(v.scene ? v.scene.view : 'body', v.shot, room);
    } else sceneApi.setRoom(room, undefined, stepped);   // a step on to a slide with the same shot still brings the viewer's turn home
    if (v.scene && v.scene.lens !== lens) { lens = v.scene.lens; sceneApi.setLens(lens); }
  };

  sync();
  const off = useUi.subscribe((s, prev) => { if (s.pos !== prev.pos || s.boxes.free !== prev.boxes.free || s.stops !== prev.stops) sync(s.pos !== prev.pos || s.stops !== prev.stops); });
  return () => { off(); offClock(); advance.dispose(); balloon.dispose(); };
}
