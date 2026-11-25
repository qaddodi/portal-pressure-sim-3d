// Which vessels are on the figure and how they look: presence, stumps, caudate veins, the named ones, the cava, highlights and pins.
// Part of CelScene (scene.ts): these methods are mixed into the class, so `this` is the scene. Moved from scene.ts as they were.
import { Vector3, Vector2, Plane } from 'three';
import { feederLive, NETWORK, presenceOf, NETWORK_BY_ID } from '../vessels/network.ts';
import { originsOf } from '../vessels/starts.ts';
import { PresenceTracks } from '../vessels/presence-track.ts';
import { caudateShownFor, CAUDATE_VEIN_ID, CAUDATE_WHEN } from '../vessels/caudate-veins.ts';
import { DIVIDED, stumpOf, PV_START } from '../vessels/divide.ts';
import { SEWN_IDS, seamsFor } from '../vessels/seams.ts';
import { VesselObject } from '../vessels/vessel-object.ts';
import { IVC_EDGES } from '../anatomy/source.ts';
import { FLOW_FADE_MS } from '../flow.ts';
import type { latest } from '../../engine/store.ts';
import { type DiseaseParams } from '../disease/index.ts';
import { clock } from '../../clock/frame.ts';
import { fadeRate } from '../../clock/ease.ts';
import type { CelScene } from '../scene.ts';
import { scenePart } from './define.ts';
import { ORIGIN_FED, LUMBAR_ID } from './shared.ts';

export const vesselsPart = scenePart<CelScene>()({
  /** A fading tip with a collateral attached is solid as far as that collateral is drawn on: its start alpha follows the collateral's amount, so it eases in and out with it
   *  (the azygos's start with the ascending lumbar vein, the coronary vein's with the varices). */
  syncTipJoins(): void {
    for (const t of this.tipFades) if (t.connect.length && t.o.setTipJoined(Math.max(...t.connect.map((c) => this.presence.solidAmountOf(c))))) this.moving = true;
  },
  /** The divided veins (vessels/divide.ts): the splenic vein under a Warren shunt, the portal trunk under a portocaval one, opening and closing with the shunt's drawing on and off. */
  /** A start that carries on from a vessel that is drawn on and off (the azygos's from the ascending lumbar vein, starts.ts RUNS_INTO) takes that vessel's live width into its own only as far
   *  as it is drawn: with it closed the start keeps its width, and it eases with the drawing. */
  syncMateK(): void {
    for (const v of ORIGIN_FED) {
      const o = this.byEdge.get(v.id) as VesselObject | undefined;
      if (o && o.setMateK(Math.max(...originsOf(v.id).map((c) => this.presence.solidAmountOf(c))), 1)) this.moving = true;
    }
  },
  /** Whether the vein `shunt` divides is divided now (a drawn shunt, and not a side-to-side portocaval): the junction skin of that state is the one without the vein's start (skin/plain.ts `leave`). */
  dividedNow(shunt: string): boolean {
    const d = DIVIDED.find(([s]) => s === shunt);
    if (!d) return false;
    const presence = this.presence as PresenceTracks | undefined;   // (the skins are first built in the constructor, before the presence tracks are: nothing is drawn yet)
    if (!presence) return false;
    const side = !!(this.src.shown() as { portocavalSide?: boolean } | null)?.portocavalSide;
    return stumpOf(shunt, d[1], presence.amountOf(shunt), d[1] === PV_START && side)[2] > 0;
  },
  syncStumps(): void {
    const side = !!(this.src.shown() as { portocavalSide?: boolean } | null)?.portocavalSide;
    for (const [shunt, vein] of DIVIDED) {
      const o = this.byEdge.get(vein) as VesselObject | undefined;
      if (!o) continue;
      const [cut, tie, k] = stumpOf(shunt, vein, this.presence.amountOf(shunt), vein === PV_START && side);
      if (o.setStump(cut, tie, k)) this.moving = true;
    }
    // the stitch rings at a surgical shunt's sewn ends: where the shunt is drawn at all (they ease with its drawing on, as the tube does)
    for (const id of SEWN_IDS) {
      const o = this.byEdge.get(id) as VesselObject | undefined;
      if (!o) continue;
      const [a, b] = seamsFor(id, side);
      if (o.setSeam(a, b)) this.moving = true;
    }
  },
  /** The caudate lobe and its short veins (2D stage.js caud): drawn while a slide is about them or the disease says so (caudate-veins.ts caudateShownFor), eased in and out; the lobe has grown as far as its veins carry the liver's outflow
   *  (twice the healthy flow to four times, feederLive 'caudate'); a stent through the lobe (the DIPS) takes the veins' place, the lobe stays alone. */
  setCaudate(lobe: boolean, veins: boolean): void {
    this.caudLobe = lobe; this.caudVeins = veins;
    { const f = this.src.frame(); if (f) this.syncCaudate(f, false); }
    this.moving = true; clock.invalidate('caudate');
  },
  syncCaudate(f: NonNullable<typeof latest.frame>, instant: boolean): void {
    const live = feederLive({ host: 'CAUD', when: 'caudate' }, f, this.healthyQ);
    const shown = caudateShownFor(live, (this.src.params() ?? null) as DiseaseParams | null, { lobe: this.caudLobe, veins: this.caudVeins });   // (a slide's pin, or the disease: Budd-Chiari, the IVC web; eased on the same 0 to 1)
    this.disease.organs.setCaudate(shown.lobe, live, instant);
    this.feeders.set(CAUDATE_VEIN_ID, shown.lobe && shown.veins && this.presence.stateOf('DIPS') !== 'shown' ? 1 : 0, instant);
  },
  /** Which vessels are drawn now (a collateral opens by its flow and size; the 2D figure's rules, network.ts presenceOf). */
  syncPresence(f: NonNullable<typeof latest.frame>, instant: boolean): void {
    for (const v of NETWORK) this.presence.set(v.id, presenceOf(v, f, { collaterals: this.collateralsOn, circuit: this.figureView === 'circuit' }, this.healthyQ), instant);
    for (const v of NETWORK) if (v.feeder && v.feeder.when !== CAUDATE_WHEN) this.feeders.set(v.id, feederLive(v.feeder, f, this.healthyQ), instant);
    this.syncCaudate(f, instant);
    this.pushFades();
    this.shapes.onFrame(f as never, clock.now(), this.healthyQ, instant);
    this.syncTipJoins();
    this.syncMateK();
    const rexOn = this.presence.stateOf('REX') === 'shown';
    if (rexOn !== this.procs.isRexUnder) this.procs.setRexUnder(rexOn, (id) => this.vesselObject(id));
    this.flow.setDrawn((id) => this.presence.stateOf(id) === 'shown', (id) => this.presence.stateOf(id) === 'shown' && NETWORK.some((v) => v.id === id && v.kind === 'collateral'));
  },
  /** The vessels a slide talks about (they carry flow marks in option A), by edge ID. The picked vessel is always included. */
  setNamedVessels(ids: readonly string[]): void {
    // a vein the engine cuts in pieces is one vein: naming any piece (or the host) names them all
    const hosts = new Set(ids.map((id) => NETWORK.find((v) => v.id === id)?.host ?? id));
    this.named = new Set(NETWORK.filter((v) => hosts.has(v.host)).map((v) => v.id));
    this.syncNamed();
  },
  syncNamed(): void {
    const ids = new Set(this.named);
    const picked = this.highlight.picked;
    if (picked) { const host = NETWORK.find((v) => v.id === picked)?.host; if (host) for (const v of NETWORK) if (v.host === host) ids.add(v.id); }
    // (the cava is whole only when the cava itself is named or picked: naming the lumbar collateral, which is drawn like the cava, raises its own tone and never the
    // cava's: the whole cava is opaque and hid the arteries that cross it, Mohammad 20 Nov)
    this.cavaE.to([...ids].some((id) => IVC_EDGES.has(id)) ? 1 : 0, fadeRate(FLOW_FADE_MS));
    this.lumbarE.to(ids.has(LUMBAR_ID) ? 1 : 0, fadeRate(FLOW_FADE_MS));
    this.moving = true;
  },
  /** What the cava's ease writes: the cava's own objects (the lumbar collateral at its own share) and the joins that follow the cava's. */
  applyCava(): void {
    const whole = this.cavaE.value, lumbar = this.lumbarE.value;
    for (const o of this.cava) o.setWholeShare(o.edge?.id === LUMBAR_ID ? lumbar : whole);
    for (const o of this.ivcJoins) o.setIvcWhole(whole);
    for (const o of this.hvJoins) o.setCavaEndWhole(whole);
    for (const o of this.cavaCuts) o.setCavaJoinWhole(whole);
  },
  /** Light a set of vessels at once (the shunt's valid targets); an empty list puts them out. */
  markVessels(ids: readonly string[]): void { this.highlight.setOnly(ids); this.moving = true; },
  /** The shunt's target under the pointer stands out a little more than the lit others (2D shuntGlow); null lets it go. */
  hoverVessel(id: string | null): void { this.highlight.setHover(id); this.moving = true; },
  /** The shunt's dashed guide, from the middle of vessel `src` to the canvas point (x, y); null (or no src) takes it away. */
  setShuntGuide(src: string | null, x: number, y: number, color: string): void {
    const v = src ? NETWORK_BY_ID.get(src) : null;
    if (!v || !v.pts.length) { if (this.shuntGuide.shown) { this.shuntGuide.hide(); this.moving = true; } return; }
    let total = 0;
    for (let i = 1; i < v.pts.length; i++) total += Math.hypot(v.pts[i]![0] - v.pts[i - 1]![0], v.pts[i]![1] - v.pts[i - 1]![1], v.pts[i]![2] - v.pts[i - 1]![2]);
    let at = 0; const a = new Vector3(...(v.pts[0] as [number, number, number]));
    for (let i = 1; i < v.pts.length; i++) {
      const p0 = v.pts[i - 1]!, p1 = v.pts[i]!, l = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
      if (at + l >= total / 2 && l > 0) { const k = (total / 2 - at) / l; a.set(p0[0] + (p1[0] - p0[0]) * k, p0[1] + (p1[1] - p0[1]) * k, p0[2] + (p1[2] - p0[2]) * k); break; }
      at += l;
    }
    this.shuntRay.setFromCamera(new Vector2((x / this.width) * 2 - 1, -(y / this.height) * 2 + 1), this.rig.camera);
    const b = this.shuntRay.ray.intersectPlane(new Plane(new Vector3(0, 0, 1), -a.z), new Vector3());
    if (!b) return;
    const p0 = this.rig.project(a, { x: 0, y: 0 }), p1 = this.rig.project(a.clone().add(new Vector3(0.1, 0, 0)), { x: 0, y: 0 });
    this.shuntGuide.set(a, b, Math.hypot(p1.x - p0.x, p1.y - p0.y) / 0.1, color);
    this.moving = true;
  },
  /** The tapped organ gets a heavy outline (the selection's mark); [] puts it out. */
  selectOrgans(ids: readonly string[]): void { this.pins.select(ids); this.moving = true; },
  pinOrgans(ids: readonly string[], normalSpleen = false): void { this.pins.set(ids); this.pins.setNormalOutline(normalSpleen); this.moving = true; },
  /** Free play: pick a vessel by edge ID (or clear it with null). */
  pick(id: string | null): void { this.highlight.set(id); this.syncNamed(); },
  /** A slide is about the caudate lobe: the caudate's own lane shows in the Circuit (2D: stage-outlines.js pinOrgans). */
  setCaudatePin(on: boolean): void { this.caudPin = on; this.moving = true; },
});
export type VesselsPart = typeof vesselsPart;
