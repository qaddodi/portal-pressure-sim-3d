// A stent in a vein the model has no device for (a slide's `stented`: the right hepatic vein, the IVC). The 2D app draws the same mesh over the middle of the vein
// (stage-venous.js VST_SPAN 0.25 to 0.75): the open cells alone, end to end, no graft, as wide as the vein's lumen, coming in whole on its own clock (1100 ms in, 660 out) and
// going out the same way. It is the TIPS stent's own wire builder (stent-build.ts) laid on the vein's own course; nothing narrows (the vein is not the shunt).
import { CatmullRomCurve3, Group, Vector3 } from 'three';
import type { CelShared } from '../../materials/cel.ts';
import type { Palette } from '../../palette.ts';
import { courseOf, NETWORK_BY_ID, radiusOf, widthPx } from '../../vessels/network.ts';
import { UNITS_PER_SCENE } from '../../frame2d.ts';
import { DeviceObject } from '../device-object.ts';
import { mergeTubes } from '../tube-rings.ts';
import { buildStent, WIRE_MAX_R, type StentSpec } from './stent-build.ts';
import { indexOf } from '../../../engine/vessel-data.ts';

/** The stretch of the vein the stent covers, as shares of its length (stage-venous.js VST_SPAN). */
export const VEIN_STENT_SPAN: readonly [number, number] = [0.25, 0.75];
export const VEIN_STENT_IN_MS = 1100, VEIN_STENT_OUT_MS = 660;
const WIRE_RADIAL = 6;
/** The vein's diameter when no frame has come yet (mm). */
const D_DEFAULT = 8;

/** Whether the scene has a vein of this edge id to put a stent in (the course is its own). */
export const canStent = (id: string): boolean => NETWORK_BY_ID.has(id);

export class VeinStent {
  readonly group = new Group();
  readonly id: string;
  readonly wires: DeviceObject;
  readonly objects: DeviceObject[];
  /** how much of the stent is shown now (0 gone, 1 whole) and where it is going */
  amount = 0; goal = 0;
  private readonly curve: CatmullRomCurve3;
  private readonly L: number;
  private key = '';
  private dirty = false;
  private lastPalette: Palette | null = null;

  constructor(id: string, shared: CelShared) {
    this.id = id;
    this.curve = new CatmullRomCurve3(courseOf(id).map((p) => new Vector3(...p)), false, 'centripetal');
    this.L = this.curve.getLength();
    this.wires = new DeviceObject(mergeTubes([], WIRE_RADIAL), 'stentWire', shared, { px: 0.7, order: 3 }, 'ink');
    this.objects = [this.wires];
    this.group.add(this.wires.group);
    this.group.visible = false;
  }

  applyPalette(p: Palette): void { this.lastPalette = p; for (const o of this.objects) o.applyPalette(p); }
  setPhone(phone: boolean): void { for (const o of this.objects) o.setPhone(phone); }

  /** The spec the stent is built from at this vein diameter (mm): the middle stretch of the vein's course, the lumen's radius less a hair so it sits in the wall. */
  specFor(dMm: number): StentSpec {
    const edge = NETWORK_BY_ID.get(this.id)!, L = this.L, [a, b] = VEIN_STENT_SPAN, s0 = a * L, A = (b - a) * L, curve = this.curve;
    const R = Math.max(1.2 / UNITS_PER_SCENE, radiusOf(widthPx(edge as never, Math.max(dMm, 1))) - 0.25 / UNITS_PER_SCENE);
    return {
      at: (t, out) => curve.getPointAt(Math.min(1, Math.max(0, (s0 + t) / L)), out),
      tan: (t, out) => curve.getTangentAt(Math.min(1, Math.max(0, (s0 + t) / L)), out),
      A, R, lenCm: 8, geom: { len: 8, waist: 0, trans: 0, red: 0 }, s: 0, site: 0, covered: false,
    };
  }

  /** Whether the stent should be shown. Returns true when something changed that needs a frame. */
  want(on: boolean, instant = false): boolean {
    const goal = on ? 1 : 0;
    if (goal === this.goal && !(instant && this.amount !== goal)) return false;
    this.goal = goal;
    if (instant) this.amount = goal;
    if (goal && !this.key) this.build(D_DEFAULT);
    this.apply(); this.dirty = true;
    return true;
  }

  /** The engine's newest frame: the stent is as wide as the vein is now (rebuilt only when that moves a quarter of a mm). */
  sync(frame: { D: ArrayLike<number> } | null): boolean {
    if (!frame || !this.goal) return false;
    const dq = Math.round((frame.D[indexOf(this.id)] || D_DEFAULT) * 4) / 4;
    if (this.key === dq.toFixed(2)) return false;
    this.build(dq); this.dirty = true;
    return true;
  }

  private build(d: number): void {
    this.key = d.toFixed(2);
    const p = buildStent(this.specFor(d));
    const g = mergeTubes(p.wires.map((w) => w.map((r) => ({ ...r, r: Math.min(p.wireR, WIRE_MAX_R) }))), WIRE_RADIAL);
    this.wires.group.traverse((c) => { const m = c as { isMesh?: boolean; geometry?: { dispose(): void } }; if (m.isMesh) { m.geometry!.dispose(); (m as unknown as { geometry: unknown }).geometry = g; } });
    this.apply();
  }

  private apply(): void {
    const a = this.amount * this.amount * (3 - 2 * this.amount);   // (easeInOut, as the 2D stent's strength is)
    this.group.visible = a > 0.002 && !!this.key;
    this.wires.setAlpha(a);
    if (this.lastPalette) for (const o of this.objects) o.applyPalette(this.lastPalette);
  }

  /** Eases the amount. True while it moves (or draws once more). */
  update(dtMs: number): boolean {
    let moving = this.dirty; this.dirty = false;
    if (this.amount !== this.goal) {
      const k = Math.min(1, dtMs / (this.goal ? VEIN_STENT_IN_MS : VEIN_STENT_OUT_MS)), d = this.goal - this.amount;
      this.amount = Math.abs(d) <= k ? this.goal : this.amount + Math.sign(d) * k;
      this.apply(); moving = true;
    }
    return moving;
  }

  /** Fade with the figure (the Circuit takes the body away). */
  setFade(f: number): void { for (const o of this.objects) o.setFade(f); }

  dispose(): void { for (const o of this.objects) o.dispose(); }
}
