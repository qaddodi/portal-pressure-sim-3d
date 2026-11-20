// A vessel that comes and goes (a collateral opening or closing, an arterioportal shunt, the epigastric veins) never pops: it draws on along its flow
// and retracts back, as the 2D figure does (stage-tubes.js startExit). A change between solid and dotted (an open collateral that closes while
// potential collaterals are on) retracts the one and draws on the other. All of it is the shader's `reveal`, so nothing is rebuilt.
import type { Presence } from './network.ts';
import type { VesselObject } from './vessel-object.ts';

export const PRESENCE_MS = 320;

interface Track { obj: VesselObject; goal: Presence; shown: Presence; amount: number; /** its drawing is another clock's (the Circuit's change): this only keeps its state */ driven?: boolean }

export class PresenceTracks {
  private tracks = new Map<string, Track>();
  /** vessels start shown; the first `set` of each moves them to where they belong without animating (instant) */
  constructor(objects: readonly VesselObject[]) {
    for (const o of objects) if (o.edge) this.tracks.set(o.edge.id, { obj: o, goal: 'shown', shown: 'shown', amount: 1 });
  }

  /** Where a vessel should be. `instant` settles it at once (a new patient, the first frame). */
  set(id: string, goal: Presence, instant = false): boolean {
    const t = this.tracks.get(id);
    if (!t || (t.goal === goal && !instant)) return false;
    t.goal = goal;
    if (t.driven) { t.shown = goal; t.amount = goal === 'hidden' ? 0 : 1; return true; }   // (its reveal and visibility are `drive`n, never eased here)
    if (instant) { t.shown = goal; t.amount = goal === 'hidden' ? 0 : 1; this.apply(t); }
    return true;
  }
  /** Hands a vessel's drawing to another clock (the Circuit's change grows the liver's branches with the camera's glide): from here `drive` writes its reveal, this keeps only its state. */
  own(ids: Iterable<string>): void { for (const id of ids) { const t = this.tracks.get(id); if (t) t.driven = true; } }
  /** Draws a driven vessel `amount` of the way along its flow (0 not at all, 1 whole). */
  drive(id: string, amount: number): void {
    const t = this.tracks.get(id);
    if (!t?.driven) return;
    t.obj.group.visible = amount > 0.002;
    t.obj.setReveal(amount);
  }
  /** How far a vessel is drawn on (0 not at all, 1 whole): what its retracting and drawing on have reached. */
  amountOf(id: string): number { const t = this.tracks.get(id); return !t || t.shown === 'hidden' ? 0 : t.amount; }
  stateOf(id: string): Presence { return this.tracks.get(id)?.goal ?? 'hidden'; }
  isDrawn(id: string): boolean { const t = this.tracks.get(id); return !!t && t.shown !== 'hidden' && t.amount > 0.001; }

  private apply(t: Track): void {
    const o = t.obj, vis = t.shown !== 'hidden' && t.amount > 0.001;
    o.group.visible = vis;
    o.setDotted(t.shown === 'ghost');
    o.setReveal(t.amount);
  }

  /** Returns true while anything is drawing on or retracting. */
  step(dtMs: number): boolean {
    const k = Math.min(1, dtMs / PRESENCE_MS);
    let moving = false;
    for (const t of this.tracks.values()) {
      if (t.driven) continue;
      if (t.shown === t.goal) {
        const want = t.goal === 'hidden' ? 0 : 1;
        if (t.amount === want) continue;
        t.amount = Math.abs(want - t.amount) <= k ? want : t.amount + Math.sign(want - t.amount) * k;
      } else if (t.amount > 0) {
        // the vessel as it is retracts first
        t.amount = Math.max(0, t.amount - k);
        if (t.amount === 0) { t.shown = t.goal; }
      } else { t.shown = t.goal; }
      this.apply(t);
      moving = true;
    }
    return moving;
  }
}
