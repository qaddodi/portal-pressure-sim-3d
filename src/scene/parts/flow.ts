// The blood's flow marks and cells: their options and mode.
// Part of CelScene (scene.ts): these methods are mixed into the class, so `this` is the scene. Moved from scene.ts as they were.
import { type BloodOptions } from '../blood/marks.ts';
import { type FlowMarkMode } from '../flow.ts';
import type { CelScene } from '../scene.ts';
import { scenePart } from './define.ts';

export const flowPart = scenePart<CelScene>()({
  /** The Blood menu: chevrons on or off, key routes only, and potential collaterals (dotted routes). */
  setBlood(o: Partial<BloodOptions> & { collaterals?: boolean; keyStreaks?: boolean }): void {
    if (o.keyStreaks !== undefined) this.blood.routes.setKeyOnly(o.keyStreaks);
    if (o.collaterals !== undefined && o.collaterals !== this.collateralsOn) {
      this.collateralsOn = o.collaterals;
      { const f = this.src.frame(); if (f) this.syncPresence(f, false); }
    }
    const patch: Partial<BloodOptions> = {};
    if (o.chevrons !== undefined) patch.chevrons = o.chevrons;
    if (o.keyChevrons !== undefined) patch.keyChevrons = o.keyChevrons;
    if (o.presenting !== undefined) patch.presenting = o.presenting;
    this.flow.setOptions(patch);
    this.bloodOpts = { chevrons: o.chevrons ?? this.bloodOpts.chevrons, keyChevrons: (o.keyChevrons ?? this.bloodOpts.keyChevrons) || !!o.presenting };
    this.sinus.setBlood(this.bloodOpts);
    this.moving = true;
  },
  /** (The 2D app has one style of flow head; the four options of the first slice are gone. Kept for the views that still take a mode.) */
  setFlowMode(mode: FlowMarkMode): void { this.sinus.setFlowMode(mode); this.moving = true; },
});
export type FlowPart = typeof flowPart;
