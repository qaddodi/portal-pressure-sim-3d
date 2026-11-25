// The camera: moves to a shot, the held dive, anchors, size and the caps that keep the figure on screen.
// Part of CelScene (scene.ts): these methods are mixed into the class, so `this` is the scene. Moved from scene.ts as they were.
import { waitCue } from '../../ui/shell/wait-cue.ts';
import { Vector3 } from 'three';
import { courseOf, MAPPED } from '../vessels/network.ts';
import { VesselObject } from '../vessels/vessel-object.ts';
import { type Room } from '../camera/room.ts';
import { type ShotName, type Shot } from '../camera/shots.ts';
import { clock } from '../../clock/frame.ts';
import type { CelScene } from '../scene.ts';
import { scenePart } from './define.ts';
import { ANCHORS } from './shared.ts';

export const cameraPart = scenePart<CelScene>()({
  // ---- slide state ---------------------------------------------------------------------------

  /** Every camera move of the app comes here. A move INTO the lobule or the sinusoid waits until their 3D parts are built and primed (`heldDive`): a dive is never begun toward something that
   *  cannot be drawn. The body stays as it stands meanwhile (the build is rushed, a second or so at most on a phone, often nothing), then the dive starts from where the camera is. A newer move replaces a waiting one.
   *  It always lands on the liver's one place (`LIVER_POINT`, the lobule's anchor), whatever zoom and pan the hand had: the place is never chosen from the camera (23 Nov, docs/approved/dive.md); the rig
   *  carries the hand home with the dive's own share (camera/rig.ts startDiveHand). */
  goTo(shot: ShotName | Shot, room: Room, now: number, ms?: number, ease?: (k: number) => number): void {
    if ((this.figureView === 'lobule' || this.figureView === 'sinusoid') && !this.microPrimedNow) { this.hold({ shot, room, ms, ease }); this.buildMicroIdle(true); return; }
    this.hold(null);
    this.rig.goTo(shot, room, now, ms, false, ease ?? null); this.moving = true;
  },
  /** The boot reveal (boot/ready.ts, splash plan A2): the camera a little closer than rest while the splash is up, and the glide home as it lifts. Only the body view settles; any other start just fades. */
  primeReveal(k: number): void { if (this.figureView === 'body' && this.rig.primeSettle(k)) this.moving = true; },
  playReveal(now: number, ms: number, ease: (k: number) => number): void { if (this.figureView === 'body' && this.rig.settle(now, ms, ease)) this.moving = true; },
  get diveHeld(): boolean { return this.heldDive !== null; },
  hold(h: { shot: ShotName | Shot; room: Room; ms?: number; ease?: (k: number) => number } | null): void {
    this.heldDive = h;
    if (h) { this.holdCue ??= waitCue(this.figureView === 'sinusoid' ? 'the sinusoid' : 'the lobule'); if (this.micro?.lobule.weldsWait) this.holdCue.progress?.(this.micro.lobule.weldsProgress); }
    else { this.holdCue?.(); this.holdCue = null; }
  },
  /** The cards changed room while a dive waits: it will land in the new one. */
  holdRoom(room: Room): void { if (this.heldDive) this.heldDive.room = room; },
  /** Every change of the free room (a card landing, the dock gliding, the phone turning) comes here, the twin of `goTo`: the room alone, from where the camera is.
   *  While a dive waits for its parts the camera has ONE pending move, the dive, so the room only goes into it (it lands in the newest room) and the camera stands still.
   *  Before, each card that settled while the lobule was still building refitted the BODY to its room (a slight zoom in, then out, once per card) and the dive then
   *  started from that: the "zoom in, zoom out, then jump into the lobule" of 25 Nov (tests/camera-one-owner.test.ts). */
  setRoom(room: Room, now: number, ms?: number, homeTurn = false, refit = false, ease: ((k: number) => number) | null = null): void {
    if (this.heldDive) { this.holdRoom(room); return; }
    this.rig.setRoom(room, now, ms, homeTurn, refit, ease); this.moving = true;
  },
  /** The micro views are ready: a waiting dive starts now (only while its view is still the one asked for: a tap back to the body in the meantime replaced it). */
  releaseDive(): void {
    const h = this.heldDive;
    if (!h || !this.microPrimedNow) return;
    this.hold(null);
    if (this.figureView === 'lobule' || this.figureView === 'sinusoid') this.goTo(h.shot, h.room, clock.now(), h.ms, h.ease);
  },
  /** The hand's zoom over the shot's own framing (1 = as framed). */
  get handZoom(): number { return this.rig.handZoom; },
  /** Scene point of a named place, for tags and pins: a point on the 2D figure's own vessel, carried by the one map (frame2d.ts), so a tag sits on the vein. */
  anchor(name: 'tip' | 'ra' | 'ivc' | 'rhv' | 'pv' | 'spleen', out = new Vector3()): Vector3 {
    if (name === 'tip') return this.catheter.curve.getPointAt(1, out);
    const [id, at] = ANCHORS[name];
    const c = courseOf(id), p = c[Math.round(at * (c.length - 1))]!;
    return out.set(p[0], p[1], p[2]);
  },
  // ---- the frame -----------------------------------------------------------------------------

  resize(width: number, height: number): void {
    this.width = width; this.height = height;
    this.shared.res.value.set(width, height);
    this.rig.resize(width, height);
    this.moving = true;
  },
  /** The Circuit rounds the ends no other drawn vessel meets (a collateral that opens covers its own join again; a closed one leaves a clean end). Only when the set of drawn vessels changes. */
  updateCaps(): void {
    let sig = 17;
    for (const v of MAPPED) sig = (sig * 31 + (this.presence.stateOf(v.id) === 'shown' ? 1 : 0)) | 0;
    if (sig === this.capSig) return;
    this.capSig = sig;
    const shown = (id: string) => this.presence.stateOf(id) === 'shown';
    const free = (node: string, self: string) => !(this.stationsOf.get(node) ?? []).some((e) => e !== self && shown(e));
    for (const v of MAPPED) { const o = this.byEdge.get(v.id) as VesselObject | undefined; if (o && shown(v.id)) o.setCircCap(free(v.from, v.id) ? 1 : 0, free(v.to, v.id) ? 1 : 0); }
  },
});
export type CameraPart = typeof cameraPart;
