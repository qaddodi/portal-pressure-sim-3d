// The dive from the body into the lobule and the sinusoid: what each frame of it steps, and what the two small views are fed.
// Part of CelScene (scene.ts): these methods are mixed into the class, so `this` is the scene. Moved from scene.ts as they were.
import { cutUniform, fieldSoft } from '../camera/dive.ts';
import { fieldWide } from '../lobule/field.ts';
import { ORGAN_CUT } from '../organs/layer.ts';
import { effectiveDistance } from '../camera/room.ts';
import { type LobuleHit, bloodBeat, bloodSpeed, lobuleModel, sinusoidTargets, type BloodBeat, type LobuleLayers } from '../lobule/index.ts';
import { LOBULE_SCALE, SIN_SCALE, sinusoidWorld } from '../lobule/frames.ts';
import { lobuleShot } from '../lobule/shots.ts';
import { shortSide } from '../sinusoid/portrait.ts';
import { diveShare, isPortrait, restScale } from '../sinusoid/index.ts';
import { framePoint, measureScreen } from '../sinusoid/portrait.ts';
import { U as SIN_UNIT } from '../sinusoid/view.ts';
import { clock } from '../../clock/frame.ts';
import type { CelScene } from '../scene.ts';
import { scenePart } from './define.ts';
import { SIN_SHOW_FROM, DIVE_IN, DIVE_OUT, FIGURE_FRONT_Z, FRONT_MARGIN, _bA, _bB, _bE0, _bE1, _bEnds } from './shared.ts';
import { diveBlur } from '../post-dof.ts';

const FOCUS_NOW = { band: 0, whole: 0 };

export const divePart = scenePart<CelScene>()({
  /** Outline these organs (organ ids: liver, spleen, heart, bowel, colon, duodenum, kidney-l...); [] clears. */
  /** The lobule's tapped part gets a halo (null lets it go). */
  markLobule(hit: LobuleHit | null): void { this.lobule.setMark(hit); this.moving = true; },
  /** Whether the camera is in, or on its way into or out of, the liver (the lobule, the sinusoid, or a view change still flying): the only time the dive's fade, window and field apply. */
  /** The camera is in a small view or on its way between it and the body (in either direction): the body's readout callouts stand aside until it has settled back. */
  get diving(): boolean { return this.inDive(); },
  inDive(): boolean { return this.figureView === 'lobule' || this.figureView === 'sinusoid' || this.hideLeftBehind; },
  /** The sinusoid's tissue is one opaque plane to every edge of the screen once the camera has landed on it (the lobule is then hidden: nothing of the lobule is ever seen through or around it). While the
   *  camera flies between the lobule and the sinusoid (the view being left stays drawn until it lands) the tissue comes in over the lobule by how far the dive has gone (the pose's own distance: the
   *  shots' `r`, blended geometrically, whatever the room and the screen), as 2D's zoom does it. */
  stepSinusDive(): void {
    // (only while the camera is really flying: a dive share kept past the landing would hold the tissue dim, its detail, names and arrows away)
    const flying = this.hideLeftBehind && this.sinus.isVisible && this.rig.isMoving;
    const share = flying ? diveShare(this.rig.pose.shot.r, 2.5 * LOBULE_SCALE, 3 * SIN_SCALE) : null;
    this.sinus.setDive(share);
    // (the same rule as the lobule in the liver: nothing of the sinusoid is drawn until the dive is close to landing. Before, its frame was up for the whole flight and a line of it
    //  showed over the zoomed-out lobule. Every part of it fades in from SIN_SHOW_FROM or later (the 3D parts grow out from the lumen from 0.3, sinusoid3d REVEAL_FROM), so hiding it below that never pops.)
    const sv = share == null || share >= SIN_SHOW_FROM;
    if (this.sinFrame.visible !== sv) { this.sinFrame.visible = sv; this.moving = true; }
  },
  /** The dive's cutaway window in the organs' wash and the field's focus: both are functions of the camera's distance to the place dived to, so the way in and the way out are one picture run both ways,
   *  however the move is reversed, held or resized by a card (camera/dive.ts). Nothing changes at rest: every body shot is outside the window. */
  stepCutaway(): void {
    const cam = this.rig.camera, d = this.inDive() ? cam.position.distanceTo(this.livePoint) : Infinity;
    const p = this.divePt.copy(this.livePoint).project(cam);
    // (owner, 20 Nov: no cut-out. The circular window drew a dark-ringed disc in the liver with nothing in it; the body now dissolves evenly over the lobules' field, which
    //  fills the screen from the moment the camera is inside. The window stays shut: cutUniform at an infinite distance.)
    cutUniform(Infinity, p.x, p.y, cam.aspect, this.cutArr, this.diveIn());
    const was = ORGAN_CUT.value.z;
    ORGAN_CUT.value.set(this.cutArr[0], this.cutArr[1], this.cutArr[2], this.cutArr[3]);
    // (held soft over a lobule the move only passes through: its neighbours never resolve on the way to the sinusoid or back, scene passHold)
    const soft = fieldSoft(d, this.lobuleRest());
    this.lobule.field.setSoft(soft + this.passHold.value * (1 - soft));
    this.lobule.field.setWide(fieldWide(d, this.lobuleRest()));   // (from afar the field reaches every edge: the liver's inside is lobules throughout the dive)
    if (was !== this.cutArr[2] && (was > -1 || this.cutArr[2] > -1)) this.moving = true;
  },
  /** The dive's blur this frame: `band` the sinusoid's focus band (0 when it is not drawn; it fills the band's points, render.ts), `whole` the one blur over the whole screen,
   *  a function of the camera's distance (post-dof.ts diveBlur: the Anatomy <-> Lobule move, held at its peak over a lobule the move only passes through). The band draws
   *  the stronger of the two at its uniform level, so the hold hands over to the sinusoid's focus pull without a step. Reused object: read it at once. */
  focusNow(): { band: number; whole: number } {
    const o = FOCUS_NOW;
    o.band = (this.figureView === 'sinusoid' || this.sinus.diveShareNow != null) && this.microReady ? this.micro!.sinus.focusBand(_bA, _bB, _bE0, _bE1, _bEnds) : 0;
    const d = this.rig.camera.position.distanceTo(this.livePoint);
    o.whole = this.figureView !== 'circuit' && this.inDive() ? diveBlur(d, this.lobuleRest(), this.diveIn(), DIVE_OUT, this.passHold.value) : 0;
    return o;
  },
  stepPortrait(): void {
    const r = this.rig.targetRoom, st = this.rig.stageSize, p = isPortrait(st.w, st.h);   // (2D's rule on the stage: ensureGeo(W, H))
    if (p !== this.portrait) {
      this.portrait = p;
      this.sinus.setPortrait(p);
      this.moving = true;
    }
    // what the view needs of the screen to lay its end arrows and run its traffic as 2D does: px per µm along the flow (the hand's zoom included), the room's length and the canvas's along it
    const short = shortSide(p, r), s = this.rig.stageSize;
    // (measured on the screen, not modelled: where the sinusoid's middle and a point 10 µm down the flow land, against the free room's middle)
    if (!this.sinus.isVisible) return;   // (nothing of the view is read while it is away)
    // (the plane keeps its own frame; the camera's roll turns it on screen)
    const o = this.rig.project(this.sinusPt.set(...sinusoidWorld([0, 0, 0])), this.scrO), a = this.rig.project(this.sinusPt.set(...sinusoidWorld(framePoint(10, 0, SIN_UNIT, 0))), this.scrA);
    const m = measureScreen(o, a, this.rig.roomCentre());
    this.sinus.revealCentre.x = o.x; this.sinus.revealCentre.y = o.y;   // (where the sinusoid's reveal in the dive spreads from: its middle on the screen)
    this.sinus.setScreen(m.k > 0 ? m.k : restScale(short) * this.rig.handZoom, p ? r.h : r.w, p ? s.h : s.w, m.k > 0 ? m.centreUm : 0);
  },
  get isPortrait(): boolean { return this.portrait; },
  lobuleRest(): number {
    const r = this.rig.fitRoom, key = `${r.w}x${r.h}x${this.height}x${this.width}`;
    if (key !== this.restKey) { this.restKey = key; this.restD = effectiveDistance(lobuleShot('lobule'), r, this.height, this.width); }
    return this.restD;
  },
  /** Where the body is gone: before the camera reaches the figure's front on its way to the lobule (so it never flies through anything drawn), and never nearer than twice the
   *  distance the lobule lands at in this room or DIVE_IN, so the body is always gone on landing, whatever the screen. */
  diveIn(): number { return Math.max(DIVE_IN, 2 * this.lobuleRest(), this.frontAt()); },
  /** The camera's distance from the lobule's place when it reaches the figure's front plane (FIGURE_FRONT_Z), along the line it comes in on now, with FRONT_MARGIN. */
  frontAt(): number {
    const c = this.rig.camera.position, l = this.livePoint, d = c.distanceTo(l);
    // (the line's slope toward the plate: 1 head on; a camera turned well round is held to a slope of 0.3, so the body still goes in good time)
    const along = d > 0 ? Math.max(0.3, (c.z - l.z) / d) : 1;
    return (FRONT_MARGIN * Math.max(0, FIGURE_FRONT_Z - l.z)) / along;
  },
  /** How much of the body is drawn now (1 whole, 0 gone): for tests and tags. */
  get bodyShown(): number { return this.fadeNow; },
  /** The model's state into the small views (from the engine's newest frame, the healthy reference and the patient's parameters); `snap` shows it at once. */
  /** The hidden views take the patient's state before the priming pass: it builds what the first shown frame would, and the first shown frame (feedViews snaps the same model) then finds every key unchanged. Before,
   *  the priming saw the views' default state and the entry's frame rebuilt the cells, the wall's colours and the tail for the patient's (tens of ms on a laptop, a stall on an iPhone). */
  snapMicroToModel(): void {
    const f = this.src.frame();
    if (!f) return;
    const shown = this.src.shown();   // (the shown pressures and flows, as every reading is: not the instant's beat)
    const m = lobuleModel({ P: f.Pf ?? f.P, Q: f.Qf ?? f.Q, params: shown ?? undefined, metrics: f.metrics }, this.src.reference(), shown);
    const beat = this.liveBeat(f);
    this.lobule.snapModel(m, beat ?? undefined); this.sinus.snapTargets(sinusoidTargets(m), beat ? bloodSpeed(beat.flow, beat.rev, m.zone.sin) : undefined); this.feedSinusInk();
  },
  /** The sinusoids' blood at this beat of the heart, from the live frame's beat-by-beat flows: the blood's speed is the one thing
   *  in the lobule and the sinusoid that pulses (right heart failure, tricuspid regurgitation, constriction); every reading,
   *  colour and width stays on the shown, steady numbers. Null when no beat is running (a held moment: a pinned slide state,
   *  Compare's Then view; a stopped clock; a time-lapse of days, whose flows are one instant of the heart): the blood then runs at the shown mean. */
  liveBeat(f: { Q: ArrayLike<number>; running?: boolean; clock?: string; pulsing?: boolean }): BloodBeat | null {
    if (f !== this.src.liveFrame() || !f.running || f.clock !== 'hemo' || !f.pulsing) return null;
    return bloodBeat(f.Q, this.src.reference());
  },
  feedViews(snap: boolean): void {
    const f = this.src.frame();
    if (!f) return;
    const m = lobuleModel({ P: f.Pf ?? f.P, Q: f.Qf ?? f.Q, params: this.src.shown() ?? undefined, metrics: f.metrics }, this.src.reference(), this.src.shown());
    const beat = this.liveBeat(f), live = beat ? bloodSpeed(beat.flow, beat.rev, m.zone.sin) : undefined;
    if (this.figureView === 'lobule') snap ? this.lobule.snapModel(m, beat ?? undefined) : this.lobule.setModel(m, beat ?? undefined);
    else if (this.figureView === 'sinusoid') {
      snap ? this.sinus.snapTargets(sinusoidTargets(m), live) : this.sinus.setTargets(sinusoidTargets(m), live);
      this.lobule.snapModel(m, beat ?? undefined);   // (the lobule is hidden; it keeps the model the sinusoid's colour is worked out from)
      this.feedSinusInk();
    }
  },
  /** The sinusoid reads the lobule's model under the FIGURE's lens (it applies its own fallback, lenses/in-view.ts), not the lobule's. */
  feedSinusInk(): void { const c = this.lobule.inkContext(); if (c) this.sinus.setInk(c, this.lobule.askedLens); },
  setLobuleLayers(l: Partial<LobuleLayers>): void { this.lobule.setLayers(l); this.moving = true; },
  /** The wedge's wash (a slide that says `wash`): amber from the central vein along the sinusoids, counted from `landedAtMs` in both small views. Off clears it. */
  setWash(on: boolean, landedAtMs = clock.now()): void {
    if (on) { this.lobule.startWash(landedAtMs); this.sinus.startWash(landedAtMs); } else { this.lobule.stopWash(); this.sinus.stopWash(); }
    this.moving = true;
  },
});
export type DivePart = typeof divePart;
