// The TIPS and DIPS stent on the figure: the covered Viatorr as a device (bare open cells at the portal end, a graft, nested rings, a gold band and tab), laid on the shunt's own vessel, as wide as its lumen,
// pinched where the engine says (the waist mid stent, the end stenosis at the portal or the hepatic-vein end), and in only while the shunt is as wide as a stent (stentOpen: D >= 3 mm), eased in and out.
// The vessel itself narrows with it (the `narrow` attribute of the vessel's shader), so the lumen's colour shows the pinch exactly where the wires pinch. Rebuilt only when the stent's shape changes
// (an edit, a patient), never per frame; `update` only eases the amount.
import { Color, BufferAttribute, type BufferGeometry, CatmullRomCurve3, Group, Mesh, Vector3 } from 'three';
import type { CelShared } from '../../materials/cel.ts';
import type { Palette } from '../../palette.ts';
import { NETWORK_BY_ID, radiusOf, widthPx } from '../../vessels/network.ts';
import { vesselFit, type VesselFit } from './fit.ts';
import type { VesselObject } from '../../vessels/vessel-object.ts';
import { UNITS_PER_SCENE } from '../../frame2d.ts';
import { DeviceObject } from '../device-object.ts';
import { stentGraftEdge, stentGoldEdge, stentWireEdge } from './stent-look.ts';
import { DEVICE_SIDES, WIRE_SIDES, mergeTubes } from '../tube-rings.ts';
import { rawColor } from '../../materials/cel.ts';
import { bareHalfWidths, STENT_CHAMPAGNE, STENT_GLASS, STENT_FRONT_ALPHA, STENT_GOLD_ALPHA, stentCircuitLook } from './stent-look.ts';
import { buildStent, RING_STEPS, WIRE_MAX_R, type StentPaths, type StentSpec } from './stent-build.ts';
import { EDGES, STENT_SITES } from '../../../engine/hales/portal/topology.js';
import { endOf, endSiteOf, geomOf, kindOf, waistSpan } from '../../../engine/hales/portal/stent-geom.js';
import { stentOpen } from '../../../engine/hales/portal/stent-ease.js';
import { indexOf } from '../../../engine/vessel-data.ts';

const INSET = 2 / UNITS_PER_SCENE;   // the 2D draws the stent from 2 figure units in to 2 from the end (stage-transitions.js stentMesh)
const FADE_MS = 420;
const WIRE_RADIAL = WIRE_SIDES, GRAFT_RADIAL = DEVICE_SIDES, GOLD_RADIAL = WIRE_SIDES;
/** The 2D device's own alpha for the graft: nearly clear (stent-mesh.js graftAlpha, 0.86 lit, a tenth of that in the shade; the tube is lit from every side, so the mean). */
/** (The 2D graft is white where the light falls, 0.86, and a tenth of that in the shade; here, lit from every side, a milky sleeve over the lumen: the cover reads as a cover.) */
const GRAFT_ALPHA = 0.4;
/** The far wires of the weave, thinner and half seen (the 2D draws the back half at 0.5 and 0.12 of the front's strength), and the bright core along the near ones (the 2D's glint). */
/** How much of its look a ghost stent keeps. */
const GHOST_SHARE = 0.3;
/** The band and tab, faded with the rest (owner, 21 Nov 2026: option 4, "a bit faded"). */
const GOLD_ALPHA = STENT_GOLD_ALPHA;
const BACK_ALPHA = 0.18, FRONT_ALPHA = STENT_FRONT_ALPHA, GLINT_ALPHA = 0.4, BACK_R = 0.7, GLINT_R = 0.38;

interface Params { stentGeom?: unknown; stenosis?: unknown; thrombus?: unknown; stenosisSite?: unknown }
interface Frame { D: ArrayLike<number> }

const swap = (o: DeviceObject, g: BufferGeometry): void => {
  o.group.traverse((c) => { if ((c as Mesh).isMesh) { const m = c as Mesh; if (m.geometry !== g) { m.geometry.dispose(); m.geometry = g; } } });
};

export class StentDevice {
  readonly group = new Group();
  readonly id: 'TIPS' | 'DIPS';
  readonly graft: DeviceObject; readonly back: DeviceObject; readonly wires: DeviceObject; readonly glint: DeviceObject; readonly gold: DeviceObject;
  readonly objects: DeviceObject[];
  /** how much of the stent is shown now (0 gone, 1 whole) and where it is going */
  amount = 0; goal = 0;
  /** what the last build was made of, for tests and the bracket */
  paths: StentPaths | null = null;
  private key = '';
  /** the shunt's diameter the stent was last built at (mm, quarter steps): the bare stretch's real length in the Circuit is read against it */
  private dq = 8;
  private geom: StentSpec['geom'] | null = null;
  private lastR = 0;
  private readonly curve: CatmullRomCurve3;
  private readonly L: number;
  private readonly fitOf: VesselFit;
  private vessel: VesselObject | null = null;
  private lastPalette: Palette | null = null;
  private dirty = false;

  constructor(id: 'TIPS' | 'DIPS', shared: CelShared) {
    this.id = id;
    this.fitOf = vesselFit(id);
    const pts = this.fitOf.pts.map((p) => new Vector3(...p));   // (the vessel's own drawn course: its depth, not the tier's)
    this.curve = new CatmullRomCurve3(pts, false, 'centripetal');
    this.L = this.curve.getLength();
    const empty = mergeTubes([], WIRE_RADIAL);
    this.graft = new DeviceObject(empty.clone(), 'graft', shared, { px: 0.8, order: 1, spec: 0, shadow: 1 }, stentGraftEdge);
    this.graft.setGlass(STENT_GLASS.fill, STENT_GLASS.rim);
    this.back = new DeviceObject(empty.clone(), 'stentWire', shared, { px: 0.3, order: 2 }, 'none');
    this.wires = new DeviceObject(empty.clone(), 'stentGlint', shared, { px: 0.4, order: 3 }, stentWireEdge);
    this.glint = new DeviceObject(empty.clone(), 'stentGlint', shared, { px: 0, order: 4, spec: 0 }, 'ink');
    this.gold = new DeviceObject(empty.clone(), 'gold', shared, { px: 0.6, order: 5 }, stentGoldEdge);
    this.objects = [this.graft, this.back, this.wires, this.glint, this.gold];
    for (const o of this.objects) { o.park(); this.group.add(o.group); }
  }

  /** The shunt's vessel: it carries the narrowing. */
  bindVessel(v: VesselObject): void {
    this.vessel = v; this.paintCircuit();
    const g = v.toonMesh.geometry;
    if (!g.getAttribute('narrow')) g.setAttribute('narrow', new BufferAttribute(new Float32Array(g.getAttribute('position').count), 1));
  }

  applyPalette(p: Palette): void { this.lastPalette = p; for (const o of this.objects) o.applyPalette(p); this.paintWire(); this.paintCircuit(); }
  /** The front wires wear the one champagne in every look (stent-look.ts). */
  private paintWire(): void { (this.wires.toon.uniforms.color!.value as Color).copy(rawColor(STENT_CHAMPAGNE)); }
  /** The Circuit draws this stent on the shunt's own tube: it takes the colours and strengths from the same table as the 3D device, so the two views cannot differ. */
  private paintCircuit(): void { if (this.vessel && this.lastPalette) { const l = stentCircuitLook(this.lastPalette); this.vessel.setStentLook(l.wire, l.wireA, l.gold, l.goldA); } }
  setPhone(phone: boolean): void { for (const o of this.objects) o.setPhone(phone); }

  /** The spec the stent is built from, for these params and this live diameter (mm). */
  specFor(params: Params | null, dMm: number): StentSpec {
    const e = (EDGES as { id: string; shunt?: string }[]).find((x) => x.id === this.id)!;
    const kind = kindOf(e) as string, edge = NETWORK_BY_ID.get(this.id)!;
    const geom = geomOf(params, this.id, kind) as StentSpec['geom'];
    const site = (STENT_SITES as Record<string, number>)[endSiteOf(params, this.id) as string] ?? STENT_SITES.distal;
    const R = Math.max(1.2 / UNITS_PER_SCENE, radiusOf(widthPx(edge as never, Math.max(dMm, 1))) - 0.25 / UNITS_PER_SCENE);
    const A = Math.max(0.01, this.L - 2 * INSET), curve = this.curve, L = this.L;
    return {
      at: (a, out) => curve.getPointAt(Math.min(1, Math.max(0, (INSET + a) / L)), out),
      tan: (a, out) => curve.getTangentAt(Math.min(1, Math.max(0, (INSET + a) / L)), out),
      A, R, lenCm: 8, geom, s: endOf(params, this.id) as number, site, covered: true,
      fit: (a) => this.fitOf.at(Math.min(1, Math.max(0, (INSET + a) / L))),
    };
  }

  /** The engine's newest frame and the patient's params: in or out, and the shape. Returns true when something changed that needs a frame. */
  sync(frame: Frame | null, params: Params | null, instant = false): boolean {
    if (!frame) return false;
    const k = indexOf(this.id), D = frame.D[k] ?? 0;
    const goal = stentOpen(frame as never, k) ? 1 : 0;
    let moved = false;
    if (goal !== this.goal) { this.goal = goal; moved = true; }
    if (instant) { this.amount = goal; moved = true; }
    // the shape: rebuilt only when it changes (diameter on the engine's own half-mm step, the waist and the end stenosis)
    const dq = Math.round(D * 4) / 4;
    this.dq = dq;
    const spec = this.specFor(params, dq);
    this.geom = spec.geom; this.lastR = spec.R;   // (the waist's bracket follows the params at once, as the card's picture does)
    const key = [dq.toFixed(2), spec.geom.len, spec.geom.waist, spec.geom.trans, spec.geom.red.toFixed(4), spec.s.toFixed(4), spec.site.toFixed(3)].join('|');
    if (goal && key !== this.key) { this.key = key; this.rebuild(spec); moved = true; }
    if (moved) this.dirty = true;
    return moved;
  }

  private rebuild(spec: StentSpec): void {
    const p = (this.paths = buildStent(spec));
    const wr = Math.min(p.wireR, WIRE_MAX_R), near = p.wires.map((w) => w.slice(0, RING_STEPS + 1)), far = p.wires.map((w) => w.slice(RING_STEPS));
    swap(this.wires, mergeTubes(near.map((w) => w.map((r) => ({ ...r, r: wr }))), WIRE_RADIAL));
    swap(this.back, mergeTubes(far.map((w) => w.map((r) => ({ ...r, r: wr * BACK_R }))), WIRE_RADIAL));
    swap(this.glint, mergeTubes(near.map((w) => w.map((r) => ({ ...r, r: wr * GLINT_R }))), WIRE_RADIAL));
    swap(this.graft, mergeTubes([p.graft], GRAFT_RADIAL));
    this.graft.setShadowRadius(p.graft.reduce((s, r) => s + r.r, 0) / Math.max(1, p.graft.length));   // (the sleeve's mean radius: the shadow keeps its proportions)
    swap(this.gold, mergeTubes([p.band.map((r) => ({ ...r, r: wr * 2.2 })), p.tab.map((r) => ({ ...r, r: wr * 1.8 }))], GOLD_RADIAL));
    this.narrowVessel(spec, p);
    this.apply();
  }

  /** The vessel narrows with the stent: the shader shrinks the tube by `narrow` at each vertex, by its place along the stent. */
  private narrowVessel(spec: StentSpec, p: StentPaths): void {
    const g = this.vessel?.toonMesh.geometry; if (!g) return;
    const nar = g.getAttribute('narrow') as BufferAttribute | undefined, uv = g.getAttribute('uv') as BufferAttribute;
    if (!nar) return;
    for (let i = 0; i < nar.count; i++) {
      const a = uv.getX(i) * this.L - INSET;
      if (a < 0 || a > spec.A) { nar.setX(i, 0); continue; }
      const f = (a / spec.A) * (p.profile.length - 1), i0 = Math.min(p.profile.length - 2, Math.floor(f)), r = p.profile[i0]! + (p.profile[i0 + 1]! - p.profile[i0]!) * (f - i0);
      nar.setX(i, 1 - r);
    }
    nar.needsUpdate = true;
  }

  /** A slide that asks whether to place the stent draws it as a ghost (capture 52ef8e63, TIPS complete 3): its share of the full look, eased on the stent's own clock. */
  setGhost(on: boolean, instant = false): void { this.ghostGoal = on ? GHOST_SHARE : 1; if (instant) this.ghost = this.ghostGoal; this.dirty = true; }
  private ghost = 1;
  private ghostGoal = 1;

  private apply(): void {
    const a = this.amount * this.ghost;
    for (const o of this.objects) o.present();   // (the stent's own eased share is the whole fade: a part leaves the list when it reaches nothing)
    const w = this.paths ? 1 : 0;
    this.graft.setAlpha(w * a * GRAFT_ALPHA); this.back.setAlpha(w * a * BACK_ALPHA); this.wires.setAlpha(w * a * FRONT_ALPHA); this.glint.setAlpha(w * a * GLINT_ALPHA); this.gold.setAlpha(w * a * GOLD_ALPHA);
    this.graft.setShadowAlpha(a);   // (the sleeve is nearly clear, its shadow is not: it follows the stent's own share)
    if (this.lastPalette) { for (const o of this.objects) o.applyPalette(this.lastPalette); this.paintWire(); }
    // the Circuit draws the stent on the shunt's own tube (the device is the body's, and fades with it): the same share, so both ease with the stent's own clock
    this.vessel?.setStent(this.paths ? a : 0, INSET / this.L, 1 - INSET / this.L, this.paths && this.paths.bareEnd < this.paths.graftEnd ? bareHalfWidths(this.dq) : 0);
    if (!this.paths) return;
    // the vessel's own narrowing eases with the stent: it is only there while the stent is
    if (a < 0.999 && this.vessel) { /* the vessel keeps the narrowing while it fades; the stent leaves with the vessel */ }
  }

  /** The waist's bracket (labels/waist-bracket.ts): the scene points where its flat floor starts and ends on the stent's axis (written into `a` and `b`), the stent's radius, and how much shows
   *  (the waist's own ramp times the stent's amount, so it eases with both). Null with no stent built. */
  waistMark(a: Vector3, b: Vector3): { r: number; shown: number } | null {
    const g = this.geom;
    if (!g || !this.paths) return null;
    const sp = waistSpan(g) as { a1: number; b1: number }, A = Math.max(0.01, this.L - 2 * INSET);
    this.curve.getPointAt(Math.min(1, Math.max(0, (INSET + sp.a1 * A) / this.L)), a);
    this.curve.getPointAt(Math.min(1, Math.max(0, (INSET + sp.b1 * A) / this.L)), b);
    return { r: this.lastR, shown: this.amount * Math.min(1, Math.max(0, ((g.red || 0) - 0.004) / 0.03)) };
  }

  /** The waist's own stretch of the stent's axis (the curve, not the chord between its ends): `out.length` points from where the flat floor starts
   *  to where it ends, equally spaced along the curve (the bracket follows it). */
  waistAxis(out: Vector3[]): boolean {
    const g = this.geom;
    if (!g || !this.paths || out.length < 2) return false;
    const sp = waistSpan(g) as { a1: number; b1: number }, A = Math.max(0.01, this.L - 2 * INSET), k = out.length - 1;
    for (let i = 0; i <= k; i++) {
      const at = sp.a1 + (sp.b1 - sp.a1) * (i / k);
      this.curve.getPointAt(Math.min(1, Math.max(0, (INSET + at * A) / this.L)), out[i]!);
    }
    return true;
  }

  /** Eases the amount. True while it moves (or draws once more). */
  update(dtMs: number): boolean {
    let moving = this.dirty; this.dirty = false;
    if (this.ghost !== this.ghostGoal) {
      const k = Math.min(1, dtMs / FADE_MS) * (1 - GHOST_SHARE);
      this.ghost = Math.abs(this.ghostGoal - this.ghost) <= k ? this.ghostGoal : this.ghost + Math.sign(this.ghostGoal - this.ghost) * k;
      this.apply(); moving = true;
    }
    if (this.amount !== this.goal) {
      const k = Math.min(1, dtMs / FADE_MS);
      this.amount = Math.abs(this.goal - this.amount) <= k ? this.goal : this.amount + Math.sign(this.goal - this.amount) * k;
      this.apply(); moving = true;
    }
    return moving;
  }

  dispose(): void { for (const o of this.objects) o.dispose(); }
}
