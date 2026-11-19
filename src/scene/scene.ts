import { Color, type DataTexture, Mesh, MeshBasicMaterial, Raycaster, Scene, Vector2, Vector3, WebGLRenderer } from 'three';
import { BODY_PLATE_Z, ORGANS, VARICES, blob, bodyPlateGeometry } from './anatomy/placeholder.ts';
import { VESSELS, type VesselDef, buildVessel } from './anatomy/vessels.ts';
import { CameraRig } from './camera/rig.ts';
import type { Room } from './camera/room.ts';
import { SHOTS, type Shot, type ShotName } from './camera/shots.ts';
import { Catheter, type CatheterState } from './catheter.ts';
import { DEFAULT_FLOW_MODE, type FlowMarkMode, FlowMarks, markSpeed } from './flow.ts';
import { Highlight } from './highlight.ts';
import { CelObject, type CelShared, createShared } from './materials/cel.ts';
import { type LookId, PALETTES, type Palette } from './palette.ts';
import { EDGES } from '../engine/hales/portal/topology.js';
import { TEXTURE_WIDTH, indexOf } from '../engine/vessel-data.ts';

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
  readonly flow: FlowMarks;
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
    for (const def of VESSELS) this.addVessel(def);
    for (const v of VARICES) {
      const o = new CelObject(blob(v.r, v.r, v.r, 0, 0, 14), { tone: 'portal', bands: 2, spec: 1, px: 1 }, this.shared);
      o.group.position.set(0.48 + Math.cos(v.angle) * 0.12, v.y, -0.12 + Math.sin(v.angle) * 0.12);
      this.add(o);
    }
    this.catheter = new Catheter(this.shared);
    this.scene.add(this.catheter.group);
    this.objects.push(...this.catheter.objects);

    this.highlight = new Highlight(this.vessels, undefined, new Map(VESSELS.map((v) => [v.id, v.host])));
    this.flow = new FlowMarks(this.vessels);
    this.flow.setMode(opts.flowMode ?? DEFAULT_FLOW_MODE);
    this.applyLook(this.look);
  }

  private add(o: CelObject): void { this.objects.push(o); this.scene.add(o.group); }

  private addVessel(def: VesselDef): void {
    const built = buildVessel(def);
    const q = STUB_Q[def.id] ?? 1;
    const o = new CelObject(built.geometry, {
      tone: def.tone, bands: 2, spec: 1, px: 1.2,
      vessel: { index: indexOf(def.id), len: built.length, stubSpeed: markSpeed(q), radius: def.radius, baseD: BASE_D.get(def.id) ?? 1 },
    }, this.shared);
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
  dataChanged(): void { this.moving = true; }

  // ---- slide state ---------------------------------------------------------------------------

  goTo(shot: ShotName | Shot, room: Room, now: number, ms?: number): void { this.rig.goTo(shot, room, now, ms); this.moving = true; }

  setCatheter(s: CatheterState): void { this.catheter.set(s); this.moving = true; }

  /** The vessels a slide talks about (they carry flow marks in option A), by edge ID. The picked vessel is always included. */
  setNamedVessels(ids: readonly string[]): void {
    // a vein the engine cuts in pieces is one vein: naming any piece (or the host) names them all
    const hosts = new Set(ids.map((id) => VESSELS.find((v) => v.id === id)?.host ?? id));
    this.named = new Set(VESSELS.filter((v) => hosts.has(v.host)).map((v) => v.id));
    this.syncNamed();
  }
  private named = new Set<string>();
  private syncNamed(): void {
    const ids = new Set(this.named);
    const picked = this.highlight.picked;
    if (picked) { const host = VESSELS.find((v) => v.id === picked)?.host; for (const v of VESSELS) if (v.host === host) ids.add(v.id); }
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
    const needs = this.moving || camMoving || hiMoving || flowActive;
    this.moving = false;
    return needs;
  }

  render(gl: WebGLRenderer): void { gl.render(this.scene, this.rig.camera); }

  dispose(): void {
    for (const o of this.objects) o.dispose();
    this.plate.geometry.dispose();
    (this.plate.material as MeshBasicMaterial).dispose();
  }
}

export { SHOTS };
