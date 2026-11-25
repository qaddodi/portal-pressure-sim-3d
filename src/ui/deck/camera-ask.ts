// What the camera is asked for at a step of a talk: the view, the framing and whether the HVPG chase camera is on. The one place that works it out: scene-link.ts tells the scene, and
// the every-slide camera test (tests/camera-every-slide-helpers.ts) flies the same asks, so a rule here is a rule of every deck on every screen.
//
// A case card (Mohammad, 25 Nov, "Do it"): while the card is up the camera stands back on the whole figure, fitted to the patient coming in (camera/whole.ts: the organs and the water he will
// hold), in the room the card leaves; the patient loads as it goes, so the reader watches him change. Swipe or Next is then one move from the fit to where the slide looks. (Before, 20 to 24
// Nov, the camera kept the last slide's framing behind the card and moved on Next.) Coming out of the lobule, the zoom out is the dive out.
import type { View } from './presenter-machine.ts';
import { tipCloseShot, closeUpOf } from './cath-shot.ts';
import type { CathState } from '../../decks/schema.ts';
import type { Shot, ShotName } from '../../scene/camera/shots.ts';

export interface CameraAsk {
  view: 'body' | 'lobule' | 'sinusoid' | 'circuit';
  shot: ShotName | Shot;
  /** the HVPG chase camera, on while a body slide has the catheter out */
  chase: boolean;
  /** the framing is the step's own (a slide's time), not a catheter close-up (the hand's glide) */
  own: boolean;
}

export function cameraAsk(v: View, at: CathState | null): CameraAsk {
  if (v.words === 'case') return { view: 'body', shot: 'play', chase: false, own: true };
  const view = (v.scene ? v.scene.view : 'body') as CameraAsk['view'], body = view === 'body' && !v.slide?.visual;
  // (the catheter's own shots: the tip close up, the balloon just behind it and the vein ahead (2D cathFocus 'tip', both). The route step keeps the slide's own, the whole way in)
  const close = body ? closeUpOf(at) : null;
  const shot = (close ? tipCloseShot(close) : null) ?? v.shot;
  return { view, shot, chase: body && at !== null, own: shot === v.shot };
}
