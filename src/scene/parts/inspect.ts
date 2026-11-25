// The inspector (the debug panel's window onto the figure): layers, vessel lists, marks, overlaps and wires.
// Part of CelScene (scene.ts): these methods are mixed into the class, so `this` is the scene. Moved from scene.ts as they were.
import { type Object3D, Mesh, MeshBasicMaterial, Group, SphereGeometry } from 'three';
import { NETWORK } from '../vessels/network.ts';
import { coursesOf, REST } from '../vessels/shape.ts';
import { type JoinsReport, joinsReport, WHY_COLOUR } from '../vessels/skin/join-report.ts';
import { type Overlap, findOverlaps } from '../vessels/overlaps.ts';
import { VESSEL_LAYER } from '../layers.ts';
import { clock } from '../../clock/frame.ts';
import type { CelScene } from '../scene.ts';
import { scenePart } from './define.ts';

export const inspectPart = scenePart<CelScene>()({
  /**
   * The parts of the figure the inspector can switch, each with the objects it stands for now (the vessels' tubes, the junction skins, the organs, what the disease puts
   * on the vessels, the devices, the Circuit's map, the lobule and the sinusoid).
   */
  inspectLayers(): readonly { id: string; label: string; objects: () => readonly Object3D[] }[] {
    const d = this.disease;
    return [
      { id: 'tubes', label: 'Vessel tubes', objects: () => this.vessels.map((o) => o.group) },
      { id: 'skins', label: 'Junction skins', objects: () => this.body.children.filter((c) => c.name.startsWith('skin:')) },
      { id: 'organs', label: 'Organs', objects: () => [d.organs.group] },
      { id: 'disease', label: 'Clots, plexus, bleed', objects: () => [d.clots.group, d.strands.group, d.bleed.group] },
      { id: 'devices', label: 'Catheter, procedures, probes', objects: () => [this.catheter.group, this.procs.group, this.probes.group] },
      { id: 'circuit', label: 'Circuit map', objects: () => [this.tubes.group, this.mapLayer.group] },
      { id: 'dive', label: 'Lobule and sinusoid', objects: () => [this.dive] },
    ];
  },
  /** Solo and mute by vessel id (`?inspect`, the panel's vessel list): with a solo set only those are drawn, a muted one never; a junction skin is drawn while any of its arms is. */
  setInspectVessels(solo: readonly string[], mute: readonly string[]): void { this.inspectSolo = new Set(solo); this.inspectMute = new Set(mute); this.moving = true; clock.invalidate('inspect'); },
  /** Every vessel the scene has (id, kind, label), and whether it is drawn now, for the panel's list. */
  inspectVesselList(): readonly { id: string; kind: string; label: string; drawn: boolean }[] {
    return NETWORK.map((v) => ({ id: v.id, kind: v.kind, label: v.label, drawn: this.presence.isDrawn(v.id) }));
  },
  /** What the junction skins did not weld (`?inspect`, the panel's Joins report): arms left out, nodes that kept tube joins, every unwelded tube end with its place. Read when asked, never per frame. */
  inspectJoinsReport(): JoinsReport {
    return joinsReport({
      endsOf: (id) => this.skins?.endsOf(id) ?? [false, false], dropped: this.skins?.dropped ?? [], fellBack: this.skins?.fellBack ?? [], built: this.skinNodes,
      circuitFellBack: this.circuitSkins?.fellBack ?? [], stateOf: (id) => this.shapes?.stateOf(id),
    });
  },
  /** Balls drawn over everything at `spots` (the inspector's markers), under the name `kind`; none (and the old ones gone) when `spots` is null. One set per kind. Returns how many. */
  putInspectMarks(kind: string, spots: readonly { at: readonly [number, number, number]; r: number; colour: string; name: string }[] | null): number {
    const old = this.inspectMarks.get(kind);
    if (old) { this.body.remove(old); old.traverse((c) => { if (c instanceof Mesh) { c.geometry.dispose(); (c.material as MeshBasicMaterial).dispose(); } }); this.inspectMarks.delete(kind); }
    if (spots) {
      const g = new Group(); g.name = `inspect-marks:${kind}`;
      for (const u of spots) {
        const m = new Mesh(new SphereGeometry(u.r, 12, 8), new MeshBasicMaterial({ color: u.colour, transparent: true, opacity: 0.8, depthTest: false, depthWrite: false }));
        m.position.set(u.at[0], u.at[1], u.at[2]); m.renderOrder = 999; m.name = u.name; g.add(m);
      }
      g.traverse((c) => c.layers.set(VESSEL_LAYER));
      this.body.add(g); this.inspectMarks.set(kind, g);
    }
    this.moving = true; clock.invalidate('inspect');
    return spots?.length ?? 0;
  },
  /**
   * Marks the unwelded ends in the figure (a ball at each, in the colour of its reason), or only those of vessel `only`; none when `on` is false. Built from the report
   * at the time of the call: press it again after a change. Returns how many.
   */
  setInspectMarks(on: boolean, only: string | null = null): number {
    if (!on) return this.putInspectMarks('unwelded', null);
    return this.putInspectMarks('unwelded', this.inspectJoinsReport().unwelded.filter((u) => !only || u.id === only)
      .map((u) => ({ at: u.pos, r: Math.max(u.radius * 1.5, 0.02), colour: WHY_COLOUR[u.why], name: `unwelded:${u.id}:${u.end}` })));
  },
  /** Every pair of drawn vessels whose tubes run through each other now (vessels/overlaps.ts), worst first. */
  inspectOverlaps(): readonly Overlap[] { return findOverlaps({ drawn: (id) => this.presence.isDrawn(id), stateOf: (id) => this.shapes?.stateOf(id) }); },
  /** Marks the overlaps (a hot-pink ball at the deepest point of each pair, or only the pair `pair`); none when `on` is false. Returns how many. */
  setInspectOverlapMarks(on: boolean, pair: readonly [string, string] | null = null): number {
    if (!on) return this.putInspectMarks('overlaps', null);
    return this.putInspectMarks('overlaps', this.inspectOverlaps().filter((o) => !pair || (o.a === pair[0] && o.b === pair[1]))
      .map((o) => ({ at: o.at, r: Math.max(o.limit * 0.9, 0.015), colour: '#ff2d95', name: `overlap:${o.a}:${o.b}` })));
  },
  /** Where each drawn vessel's id label goes: the middle of its main course, in the figure's own space, for the panel's labels. */
  inspectLabelPoints(): readonly { id: string; at: readonly [number, number, number] }[] {
    const out: { id: string; at: readonly [number, number, number] }[] = [];
    for (const v of NETWORK) {
      if (v.feeder || v.id.includes('~F') || !this.presence.isDrawn(v.id)) continue;
      const pts = coursesOf(v, this.shapes?.stateOf(v.id) ?? REST)[0]?.pts;
      const p = pts?.[Math.floor(pts.length / 2)];
      if (p) out.push({ id: v.id, at: [p[0], p[1], p[2]] });
    }
    return out;
  },
  /** Where a point of the figure lands on the canvas now (CSS px), and whether it is in front of the camera and inside the view. */
  inspectScreen(at: readonly [number, number, number], out: { x: number; y: number }): boolean {
    const v = this.body.localToWorld(this.labelV.set(at[0], at[1], at[2])).project(this.rig.camera);
    out.x = (v.x * 0.5 + 0.5) * this.rig.stageSize.w; out.y = (-v.y * 0.5 + 0.5) * this.rig.stageSize.h;
    return v.z > -1 && v.z < 1 && Math.abs(v.x) <= 1.05 && Math.abs(v.y) <= 1.05;
  },
  /** Shows or hides one of `inspectLayers` (drawn or not; what the scene itself shows and hides is not touched: the flag is put on for the draw and taken off after it). */
  setInspectShown(id: string, shown: boolean): void { if (shown) this.inspectHidden.delete(id); else this.inspectHidden.add(id); this.moving = true; clock.invalidate('inspect'); },
  isInspectShown(id: string): boolean { return !this.inspectHidden.has(id); },
  /** Draws one of `inspectLayers` as a wireframe (every mesh under it; a part built later, a skin rebuilt, is taken up on the next frame). */
  setInspectWire(id: string, on: boolean): void {
    if (on) this.inspectWired.add(id);
    else {
      this.inspectWired.delete(id);
      for (const l of this.inspectLayers()) if (l.id === id) for (const o of l.objects()) {
        o.traverse((c) => { if (c instanceof Mesh) for (const m of Array.isArray(c.material) ? c.material : [c.material]) if ((m as { wireframe?: boolean }).wireframe) { (m as { wireframe: boolean }).wireframe = false; } });
      }
    }
    this.moving = true; clock.invalidate('inspect');
  },
  /** Before the draw: the hidden layers' flags go off and the wired layers' materials are set; returns what puts the flags back, or null when the inspector asked for nothing. */
  inspectBegin(): (() => void) | null {
    if (!this.inspectHidden.size && !this.inspectWired.size && !this.inspectSolo.size && !this.inspectMute.size) return null;
    const back: Object3D[] = [];
    if (this.inspectSolo.size || this.inspectMute.size) {
      const shown = (id: string | undefined) => !!id && !this.inspectMute.has(id) && (!this.inspectSolo.size || this.inspectSolo.has(id));
      for (const o of this.vessels) if (o.group.visible && !shown(o.edge?.id)) { o.group.visible = false; back.push(o.group); }
      for (const s of this.skins?.drawnArms() ?? []) if (s.object.visible && !s.arms.some(shown)) { s.object.visible = false; back.push(s.object); }
    }
    for (const l of this.inspectLayers()) {
      const hide = this.inspectHidden.has(l.id), wire = this.inspectWired.has(l.id);
      if (!hide && !wire) continue;
      for (const o of l.objects()) {
        if (hide && o.visible) { o.visible = false; back.push(o); }
        if (wire) o.traverse((c) => { if (c instanceof Mesh) for (const m of Array.isArray(c.material) ? c.material : [c.material]) { const w = m as { wireframe?: boolean }; if (w.wireframe === false) w.wireframe = true; } });
      }
    }
    return () => { for (const o of back) o.visible = true; };
  },
});
export type InspectPart = typeof inspectPart;
