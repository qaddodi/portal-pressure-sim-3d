import { Color, type DataTexture, Mesh, MeshBasicMaterial, Raycaster, Scene, Vector2, Vector3, WebGLRenderer } from 'three';
import { BODY_PLATE_Z, ORGANS, VARICES, blob, bodyPlateGeometry } from './anatomy/placeholder.ts';
import { buildVessel } from './anatomy/vessels.ts';
import { NETWORK, type NetVessel, presenceOf } from './vessels/network.ts';
import { PresenceTracks } from './vessels/presence-track.ts';
import { VesselObject } from './vessels/vessel-object.ts';
import { LensField } from './lenses/field.ts';
import type { LensId } from './lenses/model.ts';
import { BloodMarks, type BloodOptions } from './blood/marks.ts';
import { CameraRig } from './camera/rig.ts';
import type { Room } from './camera/room.ts';
import { SHOTS, type Shot, type ShotName } from './camera/shots.ts';
import { Catheter, type CatheterState } from './catheter.ts';
import { DEFAULT_FLOW_MODE, type FlowMarkMode, markSpeed } from './flow.ts';
import { Highlight } from './highlight.ts';
import { CelObject, type CelShared, createShared } from './materials/cel.ts';
import { type LookId, PALETTES, type Palette } from './palette.ts';
import { EDGES } from '../engine/hales/portal/topology.js';
import { TEXTURE_WIDTH, indexOf } from '../engine/vessel-data.ts';
import { latest } from '../engine/store.ts';

// The cel-shaded scene for the HVPG slice, as plain three.js so the clock (src/clock/) owns the one frame loop and the R3F Stage is
// only the canvas around it. Order inside a frame, set by the clock: engine frame, tweens, camera, render, tag positions.
//   scene.update(now)  steps the highlight, flow marks, camera tween and catheter; returns true while anything moves (draw another frame)
//   scene.render(gl)   draws
// Nothing here starts its own loop.

/** Baseline engine flows (mL/s, topology Q) the scene shows until an engine frame binds real data. */
const STUB_Q: Record<string, number> = {
  V_SPL: 5, SV_MID: 5, SV_CONF: 6.7, SMV_CONF: 10, LGV_CONF: 1.6, PV_TRUNK: 18.3, PVH_R: 11, PVH_L: 7.3,
  RHV_IVC: 9, MHV_IVC: 8.2, LHV_IVC: 7, IVC_IS: 34.3, IVCS_RA: 59.3, SVC_RA: 24,
};

/** Healthy diameter of every topology edge (mm), the reference the engine's live diameter swells against. */
const BASE_D = new Map<string, number>((EDGES as { id: string; d?: number }[]).map((e) => [e.id, e.d ?? 1]));

export interface SceneOptions {
  look?: LookId;
  phone?: boolean;
  flowMode?: FlowMarkMode;
  reduceMotion?: boolean;
}

export class CelScene {
  readonly scene = new Scene();
  readonly rig: CameraRig;
  readonly shared: CelShared = createShared();
  readonly objects: CelObject[] = [];
  readonly vessels: CelObject[] = [];
  readonly catheter: Catheter;
  readonly highlight: Highlight;
  readonly flow: BloodMarks;
  /** The colour lens (src/scene/lenses/): what colour every vein wears, crossfaded on the clock. */
  readonly lens = new LensField();
  private presence!: PresenceTracks;
  private collateralsOn = false;
  private readonly plate: Mesh;
  private readonly byEdge = new Map<string, CelObject>();
  private look: LookId;
  private phone: boolean;
  private lastNow = -1;
  private width = 1;
  private height = 1;
  private moving = true; // the first frame always draws

  constructor(opts: SceneOptions = {}) {
    this.look = opts.look ?? 'light';
    this.phone = !!opts.phone;
    this.rig = new CameraRig('title', undefined, opts.reduceMotion);

    this.plate = new Mesh(bodyPlateGeometry(), new MeshBasicMaterial({ color: PALETTES[this.look].body }));
    this.plate.position.z = BODY_PLATE_Z;
    this.scene.add(this.plate);

    for (const def of ORGANS) {
      const o = new CelObject(def.geometry(), { tone: def.tone, bands: 3, spec: 0, px: def.px }, this.shared);
      if (def.position) o.group.position.set(...def.position);
      if (def.rotation) o.group.rotation.set(...def.rotation);
      this.add(o);
    }
    for (const def of NETWORK) this.addVessel(def);
    for (const v of VARICES) {
      const o = new CelObject(blob(v.r, v.r, v.r, 0, 0, 14), { tone: 'portal', bands: 2, spec: 1, px: 1 }, this.shared);
      o.group.position.set(0.48 + Math.cos(v.angle) * 0.12, v.y, -0.12 + Math.sin(v.angle) * 0.12);
      this.add(o);
    }
    this.catheter = new Catheter(this.shared);
    this.scene.add(this.catheter.group);
    this.objects.push(...this.catheter.objects);

    this.highlight = new Highlight(this.vessels, undefined, new Map(NETWORK.map((v) => [v.id, v.host])));
    this.flow = new BloodMarks(this.vessels);
    this.presence = new PresenceTracks(this.vessels as VesselObject[]);
    this.flow.setMode(opts.flowMode ?? DEFAULT_FLOW_MODE);
    this.lens.setContext({ healthy: null, ref: null });
    this.applyLook(this.look);
  }

  private add(o: CelObject): void { this.objects.push(o); this.scene.add(o.group); }

  private addVessel(def: NetVessel): void {
    const built = buildVessel({ ...def, tone: def.tone === 'artery' ? 'portal' : def.tone });
    const q = STUB_Q[def.id] ?? 1;
    const o = new VesselObject(built.geometry, {
      tone: def.tone, artery: def.tone === 'artery', lensIndex: indexOf(def.id), widthKind: def.widthKind, bands: 2, spec: 1, px: def.kind === 'liver' ? 0.9 : def.tone === 'artery' ? 1 : 1.2,
      vessel: { index: indexOf(def.id), len: built.length, stubSpeed: markSpeed(q), radius: def.radius, baseD: def.baseD },
    }, this.shared, this.lens.shared);
    o.edge = { id: def.id, from: def.from, to: def.to, length: built.length };
    this.add(o);
    this.vessels.push(o);
    this.byEdge.set(def.id, o);
  }

  // ---- looks ---------------------------------------------------------------------------------

  get currentLook(): LookId { return this.look; }
  get palette(): Palette { return PALETTES[this.look]; }

  applyLook(look: LookId): void {
    this.look = look;
    const p = PALETTES[look];
    (this.plate.material as MeshBasicMaterial).color.set(p.body);
    for (const o of this.objects) { o.applyPalette(p); o.setPhone(this.phone); }
    this.lens.setLook(look);
    this.moving = true;
  }

  /** The canvas ground, for the renderer's clear colour. */
  get background(): Color { return new Color(PALETTES[this.look].bg); }

  setPhone(phone: boolean): void {
    this.phone = phone;
    for (const o of this.objects) o.setPhone(phone);
    this.moving = true;
  }

  // ---- engine data ---------------------------------------------------------------------------

  /** Reads flow, pressure and diameter from the engine's per-vessel texture (src/engine/vessel-data.ts) from now on; null goes back to the stub. */
  bindData(texture: DataTexture | null): void {
    for (const o of this.vessels) o.setUseData(!!texture);
    if (texture) {
      this.shared.vdata.value = texture;
      this.shared.vdataSize.value.set(TEXTURE_WIDTH, 1);
    }
    this.moving = true;
  }

  /** Call after the texture's data changed, so the next frame draws. */
  dataChanged(): void {
    const f = latest.frame;
    this.lens.onFrame(f);
    if (f) this.syncPresence(f, !this.sawFrame);
    this.sawFrame = !!f;
    this.moving = true;
  }
  private sawFrame = false;

  /** Which vessels are drawn now (a collateral opens by its flow and size; the 2D figure's rules, network.ts presenceOf). */
  private syncPresence(f: NonNullable<typeof latest.frame>, instant: boolean): void {
    for (const v of NETWORK) this.presence.set(v.id, presenceOf(v, f, { collaterals: this.collateralsOn }), instant || f.jump);
    this.flow.setDrawn((id) => this.presence.stateOf(id) === 'shown', (id) => this.presence.stateOf(id) === 'shown' && NETWORK.some((v) => v.id === id && v.kind === 'collateral'));
  }

  // ---- lens and blood ------------------------------------------------------------------------

  /** Colour the veins by a lens (the Layers menu's ten, a deck's 'system' and 'since', or 'neutral' for the plain anatomy). */
  setLens(lens: LensId, now: number, instant = false): void { this.lens.setLens(lens, now, instant); this.moving = true; }
  /** The healthy patient at rest (the engine's `healthyProfile`): the reference the change, congestion, velocity and direction lenses compare to. */
  setHealthy(h: { P: ArrayLike<number>; Q: ArrayLike<number>; D: ArrayLike<number> }): void {
    this.lens.setContext({ healthy: { Q: h.Q, D: h.D, P: h.P }, ref: Float32Array.from(h.P) });
    this.moving = true;
  }
  /** The Blood menu: chevrons on or off, key routes only, and potential collaterals (dotted routes). */
  setBlood(o: Partial<BloodOptions> & { collaterals?: boolean }): void {
    if (o.collaterals !== undefined && o.collaterals !== this.collateralsOn) {
      this.collateralsOn = o.collaterals;
      if (latest.frame) this.syncPresence(latest.frame, false);
    }
    this.flow.setOptions({ chevrons: o.chevrons, keyChevrons: o.keyChevrons, presenting: o.presenting } as Partial<BloodOptions>);
    this.moving = true;
  }

  // ---- slide state ---------------------------------------------------------------------------

  goTo(shot: ShotName | Shot, room: Room, now: number, ms?: number): void { this.rig.goTo(shot, room, now, ms); this.moving = true; }

  setCatheter(s: CatheterState): void { this.catheter.set(s); this.moving = true; }

  /** The vessels a slide talks about (they carry flow marks in option A), by edge ID. The picked vessel is always included. */
  setNamedVessels(ids: readonly string[]): void {
    // a vein the engine cuts in pieces is one vein: naming any piece (or the host) names them all
    const hosts = new Set(ids.map((id) => NETWORK.find((v) => v.id === id)?.host ?? id));
    this.named = new Set(NETWORK.filter((v) => hosts.has(v.host)).map((v) => v.id));
    this.syncNamed();
  }
  private named = new Set<string>();
  private syncNamed(): void {
    const ids = new Set(this.named);
    const picked = this.highlight.picked;
    if (picked) { const host = NETWORK.find((v) => v.id === picked)?.host; for (const v of NETWORK) if (v.host === host) ids.add(v.id); }
    this.flow.setNamed(ids);
    this.moving = true;
  }

  /** Free play: pick a vessel by edge ID (or clear it with null). */
  pick(id: string | null): void { this.highlight.set(id); this.syncNamed(); }

  setFlowMode(mode: FlowMarkMode): void { this.flow.setMode(mode); this.moving = true; }

  /** The vessel whose body a pointer ray hits first, for tap-to-pick. */
  pickAt(x: number, y: number, raycaster: Raycaster): string | null {
    raycaster.setFromCamera(new Vector2((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1), this.rig.camera);
    const hits = raycaster.intersectObjects(this.vessels.map((v) => v.toonMesh), false);
    for (const h of hits) {
      const o = this.vessels.find((v) => v.toonMesh === h.object);
      if (o) return o.edge!.id;
    }
    return null;
  }

  /** Scene point of a named place, for tags and pins. Valid names: tip, ra, ivc, rhv, pv. */
  anchor(name: 'tip' | 'ra' | 'ivc' | 'rhv' | 'pv' | 'spleen', out = new Vector3()): Vector3 {
    switch (name) {
      case 'tip': return this.catheter.curve.getPointAt(1, out);
      case 'ra': return out.set(-0.35, 2.4, -0.5);
      case 'ivc': return out.set(-0.4, 0.2, -0.6);
      case 'rhv': return out.set(-0.95, 1.4, -0.45);
      case 'pv': return out.set(-0.2, 0.62, 0.7);
      case 'spleen': return out.set(1.9, 1.0, -0.45);
    }
  }

  // ---- the frame -----------------------------------------------------------------------------

  resize(width: number, height: number): void {
    this.width = width; this.height = height;
    this.shared.res.value.set(width, height);
    this.rig.resize(width, height);
    this.moving = true;
  }

  /** Steps everything on the clock. Returns true while the scene moves, so the clock asks for another frame; false means draw nothing. */
  update(now: number): boolean {
    const dt = this.lastNow < 0 ? 16 : Math.min(100, now - this.lastNow);
    this.lastNow = now;
    this.shared.time.value = (now / 1000) % 1000;
    const camMoving = this.rig.update(now);
    const hiMoving = this.highlight.step(dt);
    const flowActive = this.flow.step(now, dt);
    const lensMoving = this.lens.step(now);
    const presMoving = this.presence.step(dt);
    const needs = this.moving || camMoving || hiMoving || flowActive || lensMoving || presMoving;
    this.moving = false;
    return needs;
  }

  render(gl: WebGLRenderer): void { gl.render(this.scene, this.rig.camera); }

  dispose(): void {
    this.lens.dispose();
    for (const o of this.objects) o.dispose();
    this.plate.geometry.dispose();
    (this.plate.material as MeshBasicMaterial).dispose();
  }
}

export { SHOTS };
