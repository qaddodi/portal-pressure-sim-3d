// Procedures and probes on the figure: the catheter, the wedge, the devices a procedure puts on, and the probe vessels.
// Part of CelScene (scene.ts): these methods are mixed into the class, so `this` is the scene. Moved from scene.ts as they were.
import { Vector3 } from 'three';
import { VesselObject } from '../vessels/vessel-object.ts';
import { type CatheterState } from '../catheter.ts';
import { clock } from '../../clock/frame.ts';
import type { CelScene } from '../scene.ts';
import { scenePart } from './define.ts';

export const proceduresPart = scenePart<CelScene>()({
  /** The HVPG's amber column: a tint on the vessels upstream of the balloon (their own shader), thinning toward the branch tips. Eases with the column (one eased number from the procedure's clock). */
  syncWedge(): void {
    const w = this.procs.wedgeTint(), now = new Set<string>();
    if (w) for (const o of this.vessels) {
      const id = o.edge?.id, p = id ? w.pieces.get(id) : undefined;
      if (!id || !p) continue;
      (o as VesselObject).setWedge(w.amount, p.d0, p.slope, w.front, w.frontSoft, w.behind, p.fade, w.color); now.add(id);
    }
    for (const id of this.wedgeSet) if (!now.has(id)) (this.vessels.find((o) => o.edge?.id === id) as VesselObject | undefined)?.setWedge(0, 0, 0, -1, 0.02, 0.02, 0);
    this.wedgeSet = now;
  },
  /** The deck's catheter (route, free, wedge, hvpg): drawn by the procedure layer on the HVPG route of the 2D figure, so it is the same device the Tests card plays. The slice catheter keeps the state
   *  (the labels read its tip) and draws nothing. */
  /** The EUS-PPG's two targets in the world, for the cards that point to them: `tip` the hepatic vein's (the HV card), `ahead` the portal vein's (the PV card, 2D's `ahead`). */
  eusTargets(tip: Vector3, ahead: Vector3): boolean {
    this.probes.scope.targetAt(1, tip); this.probes.scope.targetAt(0, ahead);
    this.body.localToWorld(tip); this.body.localToWorld(ahead);
    return true;
  },
  /** The two points a measurement's cards point to (proc-anim.js `at`: 'tip' and 'ahead'), in the world: the EUS-PPG's targets, or the procedure's catheter tip and the point just ahead of it. False with none out. */
  procPoints(kind: string, tip: Vector3, ahead: Vector3): boolean {
    if (kind === 'eus') return this.eusTargets(tip, ahead);
    if (!this.procs.tipPosition(tip) || !this.procs.aheadPosition(ahead)) return false;
    this.body.localToWorld(tip); this.body.localToWorld(ahead);
    return true;
  },
  setCatheter(s: CatheterState & { ring?: 'free' | 'wedge' | 'bad' | null; column?: number; clock?: number; read?: boolean }): void {
    this.catheterRead = s.read ?? true;
    // (the still column fills after the balloon is up and the WHVP pill comes after the column, 2D cathTo: the labels read the slice's balloon as "wedged" at 0.999, so it says so only once the column is full)
    const col = s.column ?? s.balloon;
    this.catheter.set({ advance: s.advance, balloon: col >= 0.999 ? s.balloon : Math.min(s.balloon, 0.99) });
    this.catheter.group.visible = false;
    this.procs.showHvpgState(s.advance, s.balloon, s.ring ?? null, s.clock ?? clock.now(), col);
    this.moving = true;
  },
  /** What every vessel is doing now, for the debug page (`pps.vessels()` on `?debug`): which are drawn, with what fade, reveal, caps and widths, and why one is not. */
  probeVessels(): Record<string, unknown>[] {
    const rows: Record<string, unknown>[] = [];
    const row = (o: VesselObject, extra: Record<string, unknown>) => {
      const u = o.toon.uniforms;
      const v = (n: string) => { const x = (u[n] as { value: unknown } | undefined)?.value; return x && typeof x === 'object' && 'toArray' in x ? (x as { toArray(): number[] }).toArray().map((n2) => +n2.toFixed(3)) : x; };
      rows.push({ id: o.edge?.id, visible: o.group.visible, fade: v('fade'), reveal: v('reveal'), circT: v('circT'), circW: v('circW'),
        circCap: v('circCap'), circRow: v('circRow'), len: v('len'), radius: v('radius'), transparent: o.toon.transparent, ...extra });
    };
    for (const o of this.vessels) row(o as VesselObject, { kind: 'vessel', presence: this.presence.stateOf(o.edge?.id ?? ''), drawn: this.vesselDrawn(o.edge?.id ?? '') });
    this.tubes.objects.forEach((o, i) => row(o, { kind: 'tube', tube: this.tubes.ids[i]?.id }));
    rows.push({ id: '*', fadeNow: this.fadeNow, circBoost: this.circuit.shared.circBoost.value, circPerPx: this.circuit.shared.circPerPx.value,
      t: this.circuit.t, rr: this.circuit.rr, bodyVisible: this.body.visible, view: this.figureView });
    return rows;
  },
});
export type ProceduresPart = typeof proceduresPart;
