// The disease layer: what the engine frame feeds it, and the endoscope's scope ring.
// Part of CelScene (scene.ts): these methods are mixed into the class, so `this` is the scene. Moved from scene.ts as they were.
import { recruitFrac } from '../vessels/network.ts';
import type { latest } from '../../engine/store.ts';
import { type DiseaseParams } from '../disease/index.ts';
import type { ScopeRingScreen } from '../disease/scope-ring.ts';
import { clock } from '../../clock/frame.ts';
import type { CelScene } from '../scene.ts';
import { scenePart } from './define.ts';

export const diseasePart = scenePart<CelScene>()({
  /** The patient's disease into the organ and disease layers (src/scene/disease/): the newest frame, the patient's parameters, the healthy pressures. */
  feedDisease(f: NonNullable<typeof latest.frame>, first: boolean): void {
    this.disease.feed(f as never, (this.src.shown() ?? null) as DiseaseParams | null, (this.src.reference()?.P as ArrayLike<number> | undefined) ?? null, {
      instant: first,   // (a new patient eases: the organs, the disease and the collaterals glide from the old patient to the new, never swap; only the very first frame is at once)
      presence: (id) => (this.presence.isDrawn(id) ? 1 : 0),
      recruit: (id, fr) => recruitFrac(id, fr as never),
    }, false);
  },
  /** The scope ring on the varices: stands or not (it eases), its dashes closed into a line while its lens is open (disease/scope-ring.ts). */
  setScopeRing(on: boolean, open: boolean): void { this.disease.scopeRing.set(on, open); this.moving = true; clock.invalidate('scope-ring'); },
  /** The ring's place on the screen now (CSS px; centre and radius, the badge's): null while it is not drawn (the Circuit, a dive, not yet in). Valid after the camera's update. */
  scopeRingScreen(out: ScopeRingScreen): ScopeRingScreen | null {
    const r = this.disease.scopeRing;
    if (r.alpha < 0.05) return null;
    this.camRight.setFromMatrixColumn(this.rig.camera.matrixWorld, 0);
    return r.screen((p, o) => this.rig.project(p, o), (p) => this.body.localToWorld(p.clone()), this.camRight, out);
  },
  /** Where the exam the Tests card is about stands on the screen now, CSS px (a probe's gate or tip); null with no probe up. */
  testFocus(out: { x: number; y: number }): { x: number; y: number } | null {
    const p = this.probes.focus(this.focusP);
    return p ? this.rig.project(this.body.localToWorld(p.clone()), out) : null;
  },
});
export type DiseasePart = typeof diseasePart;
