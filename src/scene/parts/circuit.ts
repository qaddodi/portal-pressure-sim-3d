// The Circuit view: the body's vessels flown onto a flat map, its resistors, stations and the liver that grows on it.
// Part of CelScene (scene.ts): these methods are mixed into the class, so `this` is the scene. Moved from scene.ts as they were.
import { Vector3 } from 'three';
import { SKIN_CIRC_IN } from '../vessels/skin/types.ts';
import { hasVessel, indexOf } from '../../engine/vessel-data.ts';
import type { latest } from '../../engine/store.ts';
import { clock } from '../../clock/frame.ts';
import { growOf, flatOf } from '../circuit/grow.ts';
import { mapToScene, turnScenePt } from '../circuit/map.ts';
import { mapRamp } from '../circuit/map-layer.ts';
import { circSkinsOn } from '../circuit/peel.ts';
import { circuitBounds } from '../circuit/shots.ts';
import { CIRCUIT_NODES } from '../circuit/data.copied.ts';
import { type ResKey, resRatio, RES_KINDS } from '../circuit/res-model.ts';
import { mapPxPerUnit, circBoostOf } from '../circuit/map.ts';
import type { CelScene } from '../scene.ts';
import { scenePart } from './define.ts';
import { CIRC_MID } from './shared.ts';

export const circuitPart = scenePart<CelScene>()({
  // ---- the Circuit ---------------------------------------------------------------------------

  /** Stand the map upright (flow bottom to top) or lay it wide. With the map not showing the turn is laid at once. */
  setCircuitUpright(on: boolean, now = clock.now()): void {
    if (this.circuit.t === 0 && !this.circuit.toCircuit) this.circuit.snapTurn(on); else this.circuit.setUpright(on, now);
    if (this.figureView === 'circuit') this.rig.setBounds(circuitBounds(on));
    this.moving = true;
  },
  /** The resistors a slide asks for ('rLiver', 'rColl', 'rGut'): their zigzags and readings show on the map. An empty list clears them. */
  setResistors(keys: readonly ResKey[]): void {
    this.resWant = new Set(keys);
    this.syncCircuitData(this.src.frame());
    this.moving = true;
  },
  /** The resistors showing now and their ratios against the healthy liver (for the captions). */
  get resistorsNow(): Readonly<Partial<Record<ResKey, number>>> { return this.resNow; },
  /** The engine's newest frame into the map's own parts: the resistors' ratios, and the custom shunts that are open (routed once each). */
  syncCircuitData(f: typeof latest.frame): void {
    const ref = this.src.reference(), healthy = ref ? { P: ref.P, Q: ref.Q } : null;
    const next: Partial<Record<ResKey, number>> = {};
    if (f && healthy) for (const key of this.resWant) { const r = resRatio(RES_KINDS[key], { P: f.Pf ?? f.P, Q: f.Qf ?? f.Q }, healthy, this.src.shown()); if (r != null) next[key] = r; }
    this.resNow = next;
    const cs = ((this.src.shown() as { customShunts?: Record<string, number> } | null)?.customShunts) ?? {};
    const open: Record<string, number> = {};
    for (const id of Object.keys(cs)) if (cs[id]! > 0 && (!f || !hasVessel(id) || (f.D[indexOf(id)] ?? 0) > 0)) open[id] = cs[id]!;
    this.openShunts = open;
    if (this.tubes.routeOpen(open).length) this.moving = true;
  },
  /** A map point (units) on the canvas now, turned with the map and seen through the camera (CSS px). */
  mapPoint(x: number, y: number, out = { x: 0, y: 0 }): { x: number; y: number } {
    const p = mapToScene(x, y), q = turnScenePt(p[0], p[1], this.circuit.rr);
    return this.rig.project(this.tmpMap.set(q[0], q[1], p[2]), out);
  },
  /** Pixels a map unit takes on the canvas now (the map's scale as the camera and the hand's zoom make it). */
  mapScale(): number {
    const a = this.mapPoint(CIRC_MID[0], CIRC_MID[1]), ax = a.x, ay = a.y, b = this.mapPoint(CIRC_MID[0] + 100, CIRC_MID[1]);
    return Math.hypot(b.x - ax, b.y - ay) / 100;
  },
  /** Whether a station's dot is on (a vessel at it is drawn). */
  stationOn(id: string): boolean { return (this.stationsOf.get(id) ?? []).some((e) => this.presence.stateOf(e) === 'shown'); },
  /** Whether a vessel is drawn solid now. */
  vesselDrawn(id: string): boolean { return this.presence.stateOf(id) === 'shown'; },
  /** A station's place in the scene on the map as it stands (turned with the map); for the labels. Null for a name the map does not have. */
  circuitStation(id: string, out = new Vector3()): Vector3 | null {
    const s = CIRCUIT_NODES[id];
    if (!s) return null;
    const p = mapToScene(s.at[0], s.at[1]), q = turnScenePt(p[0], p[1], this.circuit.rr);
    return out.set(q[0], q[1], p[2]);
  },
  /** The map's size on the screen now: 2D's circBoost (the lines widen as it is zoomed out, 1 to 1.75) and the map units under one CSS pixel (the floor of every line's width). */
  circuitScale(): void {
    const cam = this.rig.camera, h = this.rig.stageSize.h, sc = mapPxPerUnit(h, cam.projectionMatrix.elements[5]!, cam.position.distanceTo(this.mapPt));
    this.circuit.shared.circBoost.value = circBoostOf(sc);
    this.circuit.shared.circPerPx.value = sc > 0 ? Math.min(40, 1 / sc) : 1;
  },
  /** The liver's own branches (portal venules, sinusoids, hepatic venules) draw on along their flow as the body turns into the map, and back, on the change's eased share (circuit/grow.ts). */
  growLiver(t: number): void {
    if (t === this.lastGrow) return;
    this.lastGrow = t;
    for (const id of this.grownIds) {
      const g = growOf(id, t) ?? 0;
      this.presence.drive(id, g);
      this.vesselObject(id)?.setFlat(flatOf(g));
    }
  },
  /** The change and the turn, the organs leaving, the map coming in and its stations' dots. */
  stepCircuit(now: number, dt: number): boolean {
    const moving = this.circuit.update(now), t = this.circuit.t;
    const fade = 1 - t;
    if (fade !== this.lastFade) {
      this.lastFade = fade;
      for (const o of [...this.leaving, ...this.disease.organs.objects]) o.group.visible = fade > 0.001;
      this.pushFades();   // (the fades are composed in one place: the leaving objects, the fans' visibility)
      this.disease.setFade(Math.min(fade, this.fadeNow));
    }
    this.mapLayer.set(mapRamp(t), this.circuit.rr, t);
    // the map's junction skins: drawn only over the end of the change, turned with the map (they are built on the unturned map; the tubes turn in their shader)
    if (this.circuitSkins) {
      const rot = this.circuit.shared.circRot.value, on = circSkinsOn(t, SKIN_CIRC_IN), key = `${on ? 1 : 0}|${rot.x}|${rot.y}`;
      if (key !== this.circuitSkinKey) { this.circuitSkinKey = key; this.circuitSkins.show(on); this.circuitSkins.setTurn(rot.x, rot.y); }
    }
    this.procs.setFade(fade);
    const ramp = mapRamp(t);
    this.growLiver(t);
    const tubesMoving = this.tubes.update(dt, { ramp, t, body: this.fadeNow, drawn: (id) => this.vesselDrawn(id), caudPin: this.caudPin, open: this.openShunts });
    this.resistors.setAlpha(ramp, t);
    let resMoving = false;
    if (ramp > 0) { this.resistors.set(this.resNow, this.mapScale()); resMoving = this.resistors.step(dt); this.mapLayer.setScale(this.mapScale()); }
    let dots = false;
    if (t > 0) dots = this.mapLayer.stepDots((id) => (this.stationsOf.get(id) ?? []).some((e) => this.presence.stateOf(e) === 'shown'), Math.min(1, dt / 280));
    return moving || dots || tubesMoving || resMoving;
  },
});
export type CircuitPart = typeof circuitPart;
