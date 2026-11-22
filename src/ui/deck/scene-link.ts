// The talk drives the scene: the shot of the slide on show (fitted into the room the cards leave free), the room alone when a card moves,
// and the HVPG catheter, run on the 2D app's one clock (cath-clock.ts: hvpg-clock.js's route, balloon and column on one script time, the same time the tracing card reads, so the balloon fills and the
// trace steps in the same frame). The scene never reads the deck; this is the only place that tells it.

import { sceneApi } from '../../scene/api.ts';
import { clock, type Hold } from '../../clock/frame.ts';
import { easeArrive } from '../../clock/tween.ts';
import { useUi } from '../ui-store.ts';
import { DOCK_MS } from '../cards/dock.ts';
import { viewAt, cathPlace } from './presenter-machine.ts';
import { makeCathClock, aimCath, stepCath, poseAt, cathScript, rankOf, ARRIVE_MS, readTaken, type CathPose } from './cath-clock.ts';
import { tipCloseShot, closeUpOf } from './cath-shot.ts';
import type { Shot, ShotName } from '../../scene/camera/shots.ts';
import { DEFAULT_LENS, type LensId } from '../../scene/lenses/model.ts';
import type { CathState } from '../../decks/schema.ts';

/** The time the catheter takes to come in from the neck: the route's leg at the travel speed (hvpg-clock.js legMs, 3.4 s), after its 300 ms of stillness. procs-link.ts waits this long before the blocked vein's pushes. */
export { ARRIVE_MS };

let reframe: (() => void) | null = null;
/** The camera was taken by someone else during the talk (a Tests run that gave it back, integration review I4): the slide's own framing comes back, eased. False when no talk is linked. */
export function reframeSlide(): boolean { if (!reframe) return false; reframe(); return true; }

/** THE one way a talk gives the camera a room (Mohammad, 22 Nov: the slide arriving, the card tucked and untucked, a resize and a turn of the phone must all frame the figure the same, and so label it the same).
 *  Always a refit: the zoom is a pure function of the shot and the room the cards leave NOW. A room change that only panned kept the zoom of whichever room the slide's own move had been fitted to, and
 *  the cards of a slide settle after that move (they arrive one at a time, the data card's height lands a beat late), so the slide came up fitted to a room it no longer had (larger, cropped, other names)
 *  while an untuck, which refits, framed it right. Free play's cards and sheets still only pan (Shell.tsx, 20 Nov: opening a card never zooms the figure out). */
export function frameRoom(room: Parameters<typeof sceneApi.setRoom>[0], ms?: number, ease?: (k: number) => number, homeTurn = false): void { sceneApi.setRoom(room, ms, homeTurn, true, ease); }

export function linkScene(): () => void {
  const cc = makeCathClock(), pose: CathPose = { advance: 0, balloon: 0, column: 0 };
  let readWas = false, place: CathState | null = null, drawn = false, hold: Hold | null = null;
  let shot: ShotName | Shot | null = null;
  // the lens (2D start() sets pressure; each slide sets its own with slideLens; a stop returns to pressure): a slide that says none, and the title, stand on pressure, never on the last slide's
  let lens: LensId | null = null;
  cathScript.on = true; cathScript.t = 0;

  // the catheter: one frame, one time. Runs before the card systems (order -10) so the trace card reads this frame's time, not the last one's.
  const offClock = clock.on('tween', (f) => {
    const moving = stepCath(cc, f.dt);
    cathScript.t = cc.clk.t;
    const rd = readTaken(cc.clk.t);
    if (moving || !drawn || rd !== readWas) {
      readWas = rd;
      poseAt(cc.clk.t, pose);
      sceneApi.setCatheter({ advance: pose.advance, balloon: pose.balloon, column: pose.column, read: rd });
      drawn = true;
    }
    if (!moving && hold) { hold.release(); hold = null; }
  }, -10);

  // the data card's dock as the last sync saw it: a change of it is a room change that refits, whether or not a glide announced it (a drag that lands fully shut or open has no glide, so no hint)
  let dockWas = useUi.getState().dockShown;
  let owed = false;   // a step on to a new slide waited for its cards' final room and is still to be told to the camera
  const sync = (stepped = false) => {
    const { stops, pos, boxes, dockShown } = useUi.getState();
    const dockMoved = dockShown !== dockWas; dockWas = dockShown;
    if (!stops.length) return;
    const v = viewAt(stops, pos);
    const at = cathPlace(stops, pos);
    if (at !== place || !drawn) {
      aimCath(cc, at, Math.abs(rankOf(at) - rankOf(place)) > 1);
      place = at; drawn = false;
      if (cc.clk.t !== cc.clk.goal && !hold) hold = clock.hold('catheter');
      clock.invalidate('catheter');
    }
    // (a visual over the figure keeps the colours already showing: 2D `lensDone = !!s.visual`)
    const wantLens = v.slide?.visual ? lens ?? DEFAULT_LENS : v.scene?.lens ?? DEFAULT_LENS;
    if (wantLens !== lens) { lens = wantLens; sceneApi.setLens(lens); }
    const room = boxes.free;
    if (room.w <= 0 || room.h <= 0) return;   // the cards have not been measured yet: no room to frame in
    // the room belongs to another slide (its cards are still being measured, stepped down or fitted): the slide's move waits for its own final room, so the camera goes there once, never to an early one and on to the final
    if (boxes.stop != null && boxes.stop !== pos.stop) { owed = owed || stepped; return; }
    if (owed) { stepped = true; owed = false; }
    // The catheter's own shots: the tip close up, the balloon just behind it and the vein ahead (2D cathFocus 'tip', both). The route step keeps the slide's own (the whole way in).
    const view = v.scene ? v.scene.view : 'body', close = view === 'body' && !v.slide?.visual ? closeUpOf(at) : null;
    const want = (close ? tipCloseShot(close) : null) ?? v.shot;
    if (want !== shot) {
      shot = want;
      // a ported slide says its own view and its lens; the slice's slides are the body. A Circuit slide frames its region of the map and draws the resistors it names.
      if (v.scene?.view === 'circuit') sceneApi.showCircuit(room, { box: v.scene.circuit?.box ?? null, kMax: v.scene.circuit?.kMax ?? null, resistors: (v.scene.circuit?.resistors ?? []) as never, caudate: !!v.scene.circuit?.caudate });
      else sceneApi.showShot(v.scene ? v.scene.view : 'body', want, room, want === v.shot);   // (the slide's own framing takes a slide's time; the catheter's tip close-ups keep the hand's glide)
    } else if (stepped || !sceneApi.roomIs(room)) { if (dockMoved && !stepped) frameRoom(room, DOCK_MS, easeArrive); else frameRoom(room, undefined, undefined, stepped); }   // (a step on to a slide with the same shot still brings the viewer's turn home; a dock glide that has landed where it told the camera to go asks for nothing more)
  };

  sync();
  reframe = () => { shot = null; sync(); };   // (forget the shot it last sent: the camera is no longer on it)
  // a dock glide has set off: the figure reframes for where the card is going, in the glide's own time, not once it has landed (2D presenter-zoom.js dockTo: layout() then reframe(ms))
  const offHint = useUi.subscribe((s, prev) => { const h = s.roomHint; if (h && h !== prev.roomHint && h.free.w > 0 && h.free.h > 0) frameRoom(h.free, h.ms, easeArrive); });   // (refit: the card tucked or came back, so the figure is fitted to the room it now has, in or out, as 2D's reframe(ms))
  const off = useUi.subscribe((s, prev) => { if (s.pos !== prev.pos || s.boxes.free !== prev.boxes.free || s.boxes.stop !== prev.boxes.stop || s.stops !== prev.stops) sync(s.pos !== prev.pos || s.stops !== prev.stops); });
  // (leaving the talk takes the catheter out: it never stays on the free figure)
  return () => { reframe = null; off(); offHint(); offClock(); hold?.release(); if (lens && lens !== DEFAULT_LENS) sceneApi.setLens(DEFAULT_LENS); cathScript.on = false; cathScript.t = 0; sceneApi.setCatheter({ advance: 0, balloon: 0, column: 0 }); };
}
