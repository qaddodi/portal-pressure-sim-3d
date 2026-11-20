import { CatmullRomCurve3, Group, Quaternion, SphereGeometry, Vector3 } from 'three';
import { CelObject, type CelShared } from './materials/cel.ts';
import type { Palette } from './palette.ts';
import { type Vec3, buildTube } from './anatomy/vessels.ts';
import { blob } from './anatomy/placeholder.ts';
import { catheterRoute } from './catheter-route.ts';
import { NETWORK_BY_ID } from './vessels/network.ts';

// The HVPG catheter (slice slides: route, free, wedge, hvpg). It enters from the right internal jugular vein, runs down the SVC through
// the right atrium and the IVC, turns into the right hepatic vein and stops there, the balloon on its tip. Centreline in scene units, the same map as the vessels (catheter-route.ts).

export const CATHETER_ROUTE: readonly Vec3[] = catheterRoute();
/** The vein the tip reads in (its lumen's radius, scene units): the catheter is about 0.3 of it, as in the 2D app (stage-cath.js: Rf * 0.26 to 0.34), and the balloon fills it. */
const VEIN_R = NETWORK_BY_ID.get('RHV_IVC')!.radius;
export const CATHETER_RADIUS = VEIN_R * 0.3;
/** Balloon size when fully inflated (ellipsoid radii along and across the catheter): across, most of the lumen. */
export const BALLOON_RADII: Vec3 = [VEIN_R * 1.3, VEIN_R * 0.9, VEIN_R * 0.9];

export interface CatheterState {
  /** How far the catheter has advanced along its route, 0 (not shown) to 1 (the tip in the right hepatic vein). */
  advance: number;
  /** Balloon inflation: 0 deflated (hidden), 1 wedged. */
  balloon: number;
}

export class Catheter {
  readonly group = new Group();
  readonly shaft: CelObject;
  readonly tip: CelObject;
  readonly balloonObj: CelObject;
  readonly curve: CatmullRomCurve3;
  readonly length: number;
  private state: CatheterState = { advance: 0, balloon: 0 };
  private readonly scratch = new Vector3();
  private readonly quat = new Quaternion();

  constructor(shared: CelShared) {
    const t = buildTube(CATHETER_ROUTE.map((p) => new Vector3(...p)), CATHETER_RADIUS, false);
    this.curve = t.curve;
    this.length = t.length;
    this.shaft = new CelObject(t.geometry, { tone: 'cath', bands: 2, spec: 1, px: 0.9, tubeTones: true }, shared);
    this.tip = new CelObject(new SphereGeometry(CATHETER_RADIUS, 12, 8), { tone: 'cath', bands: 2, spec: 1, px: 0.9 }, shared);
    this.balloonObj = new CelObject(blob(...BALLOON_RADII, 0, 0, 20), { tone: 'balloon', bands: 2, spec: 1, px: 1.1 }, shared);
    this.group.add(this.shaft.group, this.tip.group, this.balloonObj.group);
    this.set({ advance: 0, balloon: 0 });
  }

  get objects(): CelObject[] { return [this.shaft, this.tip, this.balloonObj]; }

  applyPalette(p: Palette): void { for (const o of this.objects) o.applyPalette(p); }

  /** Where the tip is now, for the pins the deck draws on it. */
  tipPosition(out = new Vector3()): Vector3 { return this.curve.getPointAt(Math.min(1, Math.max(0, this.state.advance)), out); }

  get current(): Readonly<CatheterState> { return this.state; }

  set(s: CatheterState): void {
    this.state = { advance: Math.min(1, Math.max(0, s.advance)), balloon: Math.min(1, Math.max(0, s.balloon)) };
    const a = this.state.advance;
    const showing = a > 0.001;
    this.shaft.group.visible = showing;
    this.tip.group.visible = showing;
    this.shaft.setReveal(a);
    if (showing) this.curve.getPointAt(a, this.tip.group.position);
    // the balloon sits on the distal end of the catheter, along its direction, and grows from nothing to full size
    const b = this.state.balloon;
    this.balloonObj.group.visible = showing && a >= 0.999 && b > 0.001;
    if (this.balloonObj.group.visible) {
      this.curve.getPointAt(1, this.scratch);
      const tangent = this.curve.getTangentAt(1);
      this.balloonObj.group.position.copy(this.scratch).addScaledVector(tangent, -BALLOON_RADII[0] * 0.6);
      this.quat.setFromUnitVectors(new Vector3(1, 0, 0), tangent);
      this.balloonObj.group.quaternion.copy(this.quat);
      this.balloonObj.group.scale.setScalar(b);
    }
  }
}
