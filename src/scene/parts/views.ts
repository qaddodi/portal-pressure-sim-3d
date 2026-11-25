// Which view the figure shows (body, Circuit, lobule, sinusoid), and how the body and its vessels fade as the view changes.
// Part of CelScene (scene.ts): these methods are mixed into the class, so `this` is the scene. Moved from scene.ts as they were.
import { PLATE_BOUNDS, FIGURE_Z } from '../anatomy/placeholder.ts';
import { NETWORK_BY_ID } from '../vessels/network.ts';
import { LIVE_FLOOR } from '../vessels/feeder-live.ts';
import { bakedCircuitPending } from '../vessels/skin/baked.ts';
import { CelObject } from '../materials/cel.ts';
import type { Vec3 } from '../anatomy/vessels.ts';
import { sinusoidBox } from '../lobule/shots.ts';
import { clock } from '../../clock/frame.ts';
import { circuitBounds } from '../circuit/shots.ts';
import type { CelScene } from '../scene.ts';
import { scenePart } from './define.ts';
import { type FigureView, lobuleCorners, DIVE_READY_MS, bodyFade } from './shared.ts';

export const viewsPart = scenePart<CelScene>()({
  // ---- the figure's view: body, lobule, sinusoid ---------------------------------------------

  get view(): FigureView { return this.figureView; },
  /** Show the body, the lobule or the sinusoid: the others are hidden and cost nothing (nothing is built or compiled here; the views were made at start). The camera is the caller's. */
  setView(v: FigureView, now = clock.now()): void {
    const wasCircuit = this.figureView === 'circuit', wasSinusoid = this.figureView === 'sinusoid';
    this.figureView = v;
    { const f = this.src.frame(); if (wasCircuit !== (v === 'circuit') && f) this.syncPresence(f, false); }   // (the liver's beds are drawn on the map only: they draw on as the body turns into it, and draw back as it returns)
    this.rig.setSubject(v === 'lobule' ? lobuleCorners() : v === 'sinusoid' ? (sinusoidBox() as Vec3[]) : null);
    // the view being left stays drawn until the camera has landed on the new one (nothing pops while it flies); then it is hidden
    this.body.visible ||= v === 'body' || v === 'circuit';
    // the body turns into the map (or back) on the camera's own clock, from wherever it stands
    if (v === 'circuit') { if (this.circuit.t === 0) this.circuit.snapTurn(this.circuit.upright); }
    this.circuit.go(v === 'circuit', now);
    if (v === 'circuit' && bakedCircuitPending()) { this.circuitJob?.cancel(); this.fetchCircuitSkins(); }   // (the Circuit's file is wanted now: it is fetched and its skins built at once, not in the background)
    this.rig.setBounds(v === 'circuit' ? circuitBounds(this.circuit.upright) : { ...PLATE_BOUNDS, z: FIGURE_Z });
    // (the lobule is what lies between the body and the sinusoid: a move that has the sinusoid at either end passes through it, so it is on for the flight whichever view is the other end.
    //  Before, only a move TO the lobule turned it on: sinusoid <-> body (a talk's slide change) drew the sinusoid dissolving over nothing, a black gap, and then the body fading in from the dark)
    // (the idle slices normally finished long before; a dive straight after the load asks for them here, and waits: the dive frame is off until `microReady`, nothing is
    // built in this frame)
    if (v === 'lobule' || v === 'sinusoid') this.buildMicroIdle(true);
    else this.hold(null);   // (a dive still waiting for its parts is dropped by any move out of them)
    if (v === 'lobule' || v === 'sinusoid' || wasSinusoid) this.lobule.setVisible(true);
    if (v === 'sinusoid') this.sinus.setVisible(true);
    // (the dive frame is not switched on here: fadeBody shows it only once the camera is through the liver's surface and the body is dissolving, so the lobule is never seen on or through the liver)
    this.hideLeftBehind = true;
    if (v !== 'body') this.feedViews(true);
    this.moving = true;
  },
  settleViews(): void {
    const v = this.figureView;
    this.body.visible = v === 'body' || v === 'circuit' || this.fadeNow > 0;
    this.lobule.setVisible(v === 'lobule'); this.sinus.setVisible(v === 'sinusoid');
    this.dive.visible = (v === 'lobule' || v === 'sinusoid') && this.microReady;
    this.hideLeftBehind = false;
  },
  /** The body dissolves as the camera goes into the liver and comes back as it leaves (a function of the camera's distance to the lobule's place, so the dive in and the way out are the same picture run both ways). */
  fadeBody(): void {
    // the dive's effects belong to a dive (or to the lobule and the sinusoid): a close-up of the body at rest (a deck's zoom on the liver) is outside every dive and never fades the organs or opens the window
    // (and only as far as the dive's own parts can be drawn: `diveReady` is 0 until they are built, then eases to 1. With goTo holding every dive until they are, this is the second guard, for a
    //  camera that reaches the liver by any other road: the body is never dissolved into nothing, so no timing can show the bare ground, the black screen of 22 Nov)
    if (this.microReady && this.diveReady.target !== 1) { if (this.inDive() && this.figureView !== 'body') this.diveReady.to(1, { ms: DIVE_READY_MS }); else this.diveReady.snap(1); }
    const f0 = this.inDive() ? bodyFade(this.rig.camera.position.distanceTo(this.livePoint), this.diveIn()) : 1;
    const f = 1 - (1 - f0) * this.diveReady.value;
    // the lobule and the sinusoid live inside the liver: drawn only once the body has begun to dissolve (the camera is through the surface) or when one of them is the view at rest.
    // Before, the dive frame was on for the whole flight, so the see-through liver showed the lobule on its surface and the two fought in the wash (the dive's flicker).
    const dv = this.figureView === 'lobule' || this.figureView === 'sinusoid' ? (!this.hideLeftBehind || f < 1) : this.hideLeftBehind && f < 1;
    const dvr = dv && this.microReady && this.diveReady.value > 0;   // (nothing of the dive is shown before its parts and their shapes are built: they are built in idle slices, never in a frame)
    if (this.dive.visible !== dvr) { this.dive.visible = dvr; this.moving = true; }
    if (f === this.fadeNow || (Math.abs(f - this.fadeNow) < 1e-3 && f > 0 && f < 1)) return;
    this.fadeNow = f;
    this.pushFades();
    this.disease.setFade(Math.min(f, this.lastFade));
    this.body.visible = f > 0 || this.figureView === 'body';
    this.moving = true;
  },
  /** What an object's `fade` is: ONE value composed of everything that dissolves it (before, the dive's dissolve and the Circuit's change both wrote the uniform and the last writer won): the dive's
   *  dissolve of the body, the Circuit's change for what leaves with the organs (1 - t), and a conditional tributary group's own `live`. (A fan's Circuit fade, 2D's 1 - 2 * T0, is the vertex shader's.) */
  composeFade(o: CelObject): number {
    let f = this.fadeNow;
    if (this.leavingSet.has(o)) f = Math.min(f, this.lastFade);
    const id = this.fans.get(o);
    if (id !== undefined) f = Math.min(f, this.feeders.liveOf(id));
    return f;
  },
  /**
   * Writes the composed fade to every object (only a change reaches it: the dive, the Circuit's change, the model's `live`). A tributary group is drawn only while it has
   * something to show and the change has not taken it (the shader fades it out by the half-way point).
   */
  pushFades(): void {
    let changed = false;
    for (const o of this.objects) { const f = this.composeFade(o); if (o.fade !== f) { o.setFade(f); changed = true; } }
    const half = this.circuit.t < 0.5;
    for (const [o, id] of this.fans) {
      const vis = half && (!NETWORK_BY_ID.get(id)!.feeder?.when || this.feeders.liveOf(id) > LIVE_FLOOR);
      if (o.group.visible !== vis) { o.group.visible = vis; changed = true; }
    }
    if (changed) this.moving = true;
  },
});
export type ViewsPart = typeof viewsPart;
