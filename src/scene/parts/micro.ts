// The lobule and sinusoid 3D views: when they are built, primed and uploaded.
// Part of CelScene (scene.ts): these methods are mixed into the class, so `this` is the scene. Moved from scene.ts as they were.
import { span } from '../../boot/spans.ts';
import { whenQuiet } from '../../clock/idle.ts';
import { setWeldWanter } from '../lobule/weld-want.ts';
import { type Object3D } from 'three';
import { Sinusoid3D } from '../micro3d/sinusoid3d.ts';
import { Lobule3D } from '../micro3d/lobule3d.ts';
import { DiveBlood } from '../micro3d/dive-blood.ts';
import type { CelScene } from '../scene.ts';
import { scenePart } from './define.ts';
import { SLICE_MS } from './shared.ts';

export const microPart = scenePart<CelScene>()({
  /** The roots whose never-drawn geometries are uploaded ahead of their first frame. */
  get uploadRoots(): Object3D[] { return [this.scene]; },
  get microBuilt(): boolean { return this.micro !== null; },
  /** A lost graphics context came back: the lobule's collagen atlas keeps no pixels on the page once uploaded (Plan 31c), so it is painted again. */
  contextRestored(): void { this.micro?.lobule.contextRestored(); },
  get sinus3d(): Sinusoid3D { return this.buildMicro().sinus; },
  get lobule3d(): Lobule3D { return this.buildMicro().lobule; },
  /** The two 3D views' constructors, which make every one of their materials (and none of their geometry): done under the splash, before the warm-up, so their 21 programs are compiled with the rest and the
   *  idle slices that follow only fill in meshes (L3, 21 Nov). The constructors are cheap (about 50 ms on a laptop); the meshes are the slow part, and they are L4's steps. */
  constructMicro(): void { this.buildMicro(); },
  buildMicro(): { sinus: Sinusoid3D; lobule: Lobule3D } {
    if (this.micro) return this.micro;
    const sinus = this.makeSinus();
    const lobule = span('build:lobule3d', () => new Lobule3D(this.lobule, this.shared, true));   // (it mounts itself under the Lobule's root: lobule/one-fade.ts)
    this.micro = { sinus, lobule };
    // (the dive's red cells: its material is the sinusoid's red cell program, compiled with the rest)
    this.diveBlood = new DiveBlood(this.shared, sinus, this.sinus, lobule, this.lobule.net, [this.sinFrame, this.sinus.group, sinus.group]);
    // (the weld plan is read in when the quiet ladder gets to it or a dive asks, not at boot: a dive waits for it behind the cue, which says how far it has come, and the
    // preparation goes on when it is in)
    lobule.onWeldProgress = (k) => { if (lobule.weldsWait) this.holdCue?.progress?.(k); };
    lobule.onWeldsSettled = () => { this.holdCue?.progress?.(null); this.resumeMicro(); };
    if (this.weldsWanted) lobule.wantWelds();
    if (this.microDpr) lobule.setDpr(this.microDpr);
    this.moving = true;
    this.onMicroBuilt?.();
    return this.micro;
  },
  makeSinus(): Sinusoid3D {
    if (this.microSinus) return this.microSinus;
    const sinus = span('build:sinusoid3d', () => new Sinusoid3D(this.sinus, this.shared)); this.sinus.group.add(sinus.group);
    return (this.microSinus = sinus);
  },
  /** The 3D parts are built AND their shapes prepared (the sinusoid's passes, micro3d/sinusoid-shape.ts): only then are they updated, drawn or shown. */
  get microReady(): boolean { return this.micro !== null && this.micro.sinus.shapeReady; },
  /** Ready and primed: the first shown frame builds nothing. */
  get microPrimedNow(): boolean { return this.microReady && this.microPrimed && this.microPrimed2; },
  /** Builds the two 3D parts and prepares the sinusoid's shapes in slices of their own, each a task of its own in an idle slot (a timer where the browser has no idle callback: Safari), so no slice lands inside a
   *  drawn frame: the construction of the lobule, then each pass of the shapes. The view change asks for it too (a dive straight after the load) and never builds anything itself: the dive frame stays off until
   *  `microReady`. Once. */
  buildMicroIdle(urgent = false): void {
    if (this.microPrimedNow || this.disposed) return;
    if (urgent) this.wantWelds();   // (a person is about to look: the weld plan is wanted now, whatever the quiet ladder was going to do)
    // (a job that ended without priming (a step threw: the slot marks it done) is made again, so one bad slice can never leave every later dive waiting on a job that will not run)
    if (this.microJob?.done) this.microJob = null;
    // (many small steps per slice up to SLICE_MS, one slot with the rest of the page's background work: clock/idle.ts)
    this.microJob ??= whenQuiet(() => this.microStep(), { tag: 'micro', budgetMs: SLICE_MS, label: () => this.microWhat });
    // (a view change: the user is waiting for it. The slot never runs an unrushed job under a live clock hold, so the job must be rushed whether the dive made it or Stage's boot call did.
    //  Before, only a job that already existed was rushed: a dive that was the first caller made an unrushed one, which waited behind the screen's own holds: the black first dive, 22 Nov)
    if (urgent) this.microJob.rush();
  },
  wantWelds(): void { this.weldsWanted = true; this.micro?.lobule.wantWelds(); },
  /** The quiet ladder's call (boot/warm.ts rung `welds`) comes here while this scene is the page's. */
  takeWeldCalls(): void { setWeldWanter(() => this.wantWelds()); },
  /** The weld plan came (or is known to be missing): the micro views' preparation goes on, rushed when a dive waits for it. */
  resumeMicro(): void { if (!this.disposed && !this.microPrimedNow) this.buildMicroIdle(this.heldDive !== null); },
  /** One small step of the micro views' preparation; true when everything is built and primed. */
  microStep(): boolean {
    {
      if (this.disposed) return true;
      if (!this.micro) { this.microWhat = this.microSinus ? 'lobule constructor' : 'sinusoid constructor'; if (!this.microSinus) this.makeSinus(); else this.buildMicro(); }   // (one constructor a step)
      else if (!this.micro.sinus.shapeReady) { this.microWhat = 'sinusoid shapes'; this.micro.sinus.prepareShapeStep(); }
      else if (this.micro.lobule.weldsWait) {
        // (the vessels are built once, welded, so they wait for the plan: ask for it if a person is waiting, and stand down; the job is made again when the plan is in,
        // `resumeMicro`. No slice spins on a download.)
        this.microWhat = 'weld plan'; if (this.weldsWanted) this.micro.lobule.wantWelds();
        this.microJob = null; return true;
      }
      else if ((this.microWhat = 'lobule vessels', this.micro.lobule.prepareVessels())) { /* (the lobule's vessel meshes, a slice of their own) */ }
      else if (!this.microPrimed) {   // (what the lobule's first shown frame would build: built now, hidden; the tiles in steps of their own, then the rest of the frame)
        this.microWhat = 'lobule tiles';
        if (!this.primeSnapped) { this.primeSnapped = true; this.microWhat = 'snap to the model'; this.snapMicroToModel(); this.microWhat = 'lobule tiles'; }
        if (this.micro.lobule.primeCells()) { this.microPrimed = true; this.microWhat = 'lobule first frame'; this.micro.lobule.update(true, 0, 0, 1, true); }
      }
      else if (!this.microPrimed2) {   // (the same for the sinusoid's tail, Kupffer cell, pores and colours: one keyed piece a step)
        const up = ++this.primeSinusAt;
        this.microWhat = `sinusoid piece ${up}`;
        this.micro.sinus.update(true, 1, true, up);
        if (up >= 4) this.microPrimed2 = true;
      }
      if (this.microReady && this.microPrimed && this.microPrimed2) { this.microJob = null; this.moving = true; this.releaseDive(); this.onMicroPrimed?.(); return true; }
      return false;
    }
  },
});
export type MicroPart = typeof microPart;
