// A vessel that comes and goes (a collateral opening or closing, an arterioportal shunt, the epigastric veins) never pops: it draws on along its flow
// and retracts back, as the 2D figure does (stage-tubes.js startExit). A change between solid and dotted (an open collateral that closes while
// potential collaterals are on) retracts the one and draws on the other. All of it is the shader's `reveal`, so nothing is rebuilt.
import { NETWORK_BY_ID, SEGMENT_OF, type Presence } from './network.ts';
import type { VesselObject } from './vessel-object.ts';
import { easeMove } from '../gesture/ease.ts';

/** How long each kind of vessel takes to draw on and to retract, ms, and the one curve they share: 2D's `easeInOut` (the quintic `easeMove`), never a straight line. Copied from 2D, which keeps them in
 *  stage-transitions.js (trackChanges, startExit: the Meso-Rex graft REX_GROW_MS 2600 in and 1200 out, a shunt 900 and 700, a caput vein or the caudate's own lane 1500 and 1100) and collateral-front.js (FRONT_MS 1150
 *  both ways: a collateral opens from its high-pressure end in "about a second"). */
export const PRESENCE_TIMES = { rex: { in: 2600, out: 1200 }, shunt: { in: 900, out: 700 }, collateral: { in: 1150, out: 1150 }, other: { in: 1500, out: 1100 } } as const;
/** The draw-on and retract times of the vessel `id`: by its kind, as 2D's. */
export function presenceMs(id: string): { in: number; out: number } {
  const v = NETWORK_BY_ID.get(id);
  if (!v) return PRESENCE_TIMES.other;
  if (id === 'REX') return PRESENCE_TIMES.rex;
  return v.kind === 'shunt' ? PRESENCE_TIMES.shunt : v.kind === 'collateral' ? PRESENCE_TIMES.collateral : PRESENCE_TIMES.other;
}

interface Track { obj: VesselObject; ms: { in: number; out: number }; /** the linear share of the time gone (0 not drawn, 1 whole): `amount` is its curve */ p: number; goal: Presence; shown: Presence; amount: number; /** its drawing is another clock's (the Circuit's change): this only keeps its state */ driven?: boolean }

/** THE SEGMENTS' OWN FRONT (Mohammad, 25 Nov: "the varices open from the coronary vein up the oesophagus and simultaneously the mid-oesophagus vein starts opening out of nothing and grows toward the azygos ... I want the opening to be realistic: coronary vein into
 *  varices then into azygous"). ROOT CAUSE: the engine cuts one collateral route in edges (network.ts SEGMENT_OF: C1a coronary vein to varices, C1b varices to azygos), each edge is a vessel, and each vessel drew on over its own 1150 ms from its OWN start, so
 *  the second began at the middle of the route, joined to nothing yet, as the first grew. A segment now has ONE front, along the whole run: the members' own progress is the front's (one `p`, one easeMove), and member i draws over its share of the run's length
 *  only after every member before it is whole, in flow order (the coronary vein, then the varices, then the azygos); it retracts the other way, the end of the run first. No piece ever draws from its end back toward the one that feeds it. A route that is
 *  one edge has no segment and is unchanged. Pure of any id: every route the engine splits gets it. */
interface Front { ids: readonly string[]; /** each member's share of the run's length, in flow order, and where it starts on the run (0 to 1) */ share: readonly number[]; from: readonly number[] }
const lengthOf = (pts: readonly (readonly number[])[]): number => { let l = 0; for (let i = 1; i < pts.length; i++) l += Math.hypot(pts[i]![0]! - pts[i - 1]![0]!, pts[i]![1]! - pts[i - 1]![1]!, (pts[i]![2] ?? 0) - (pts[i - 1]![2] ?? 0)); return l; };
/** The fronts of the routes the engine splits: the segment's members in flow order, and each one's span of the run (by the length it is drawn at). */
export function frontsOf(): Front[] {
  const seen = new Set<string>(), out: Front[] = [];
  for (const ids of SEGMENT_OF.values()) {
    if (seen.has(ids[0]!)) continue;
    for (const id of ids) seen.add(id);
    const ls = ids.map((id) => lengthOf(NETWORK_BY_ID.get(id)?.pts ?? [])), tot = ls.reduce((a, b) => a + b, 0);
    if (!(tot > 0)) continue;
    let at = 0;
    out.push({ ids, share: ls.map((l) => l / tot), from: ls.map((l) => { const a = at / tot; at += l; return a; }) });
  }
  return out;
}

export class PresenceTracks {
  private tracks = new Map<string, Track>();
  private fronts: Front[] = frontsOf();
  /** vessels start shown; the first `set` of each moves them to where they belong without animating (instant) */
  constructor(objects: readonly VesselObject[]) {
    for (const o of objects) if (o.edge) this.tracks.set(o.edge.id, { obj: o, ms: presenceMs(o.edge.id), p: 1, goal: 'shown', shown: 'shown', amount: 1 });
  }

  /** Where a vessel should be. `instant` settles it at once (a new patient, the first frame). */
  set(id: string, goal: Presence, instant = false): boolean {
    const t = this.tracks.get(id);
    if (!t || (t.goal === goal && !instant)) return false;
    t.goal = goal;
    if (t.driven) { t.shown = goal; t.p = goal === 'hidden' ? 0 : 1; t.amount = t.p; return true; }   // (its reveal and visibility are `drive`n, never eased here)
    if (instant) { t.shown = goal; t.p = goal === 'hidden' ? 0 : 1; t.amount = t.p; this.apply(t); }
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
  /** How far a vessel is drawn on while it is a SHOWN one (a dotted ghost and a retracted one count 0): what a start that carries on from it is solid by, eased with its drawing on and off. */
  solidAmountOf(id: string): number { const t = this.tracks.get(id); return !t || t.shown !== 'shown' ? 0 : t.amount; }
  stateOf(id: string): Presence { return this.tracks.get(id)?.goal ?? 'hidden'; }
  isDrawn(id: string): boolean { const t = this.tracks.get(id); return !!t && t.shown !== 'hidden' && t.amount > 0.001; }

  private apply(t: Track): void {
    const o = t.obj, vis = t.shown !== 'hidden' && t.amount > 0.001;
    o.group.visible = vis;
    o.setDotted(t.shown === 'ghost');
    o.setReveal(t.amount);
  }

  /** Returns true while anything is drawing on or retracting. A vessel draws on over its kind's `in` time and retracts over its `out` time (PRESENCE_TIMES), both on 2D's easeInOut: the share of the time gone moves
   *  straight, and what is drawn is its curve, so one that turns round half way (a collateral that closes as it opens) turns from where it is, never from a jump. */
  step(dtMs: number): boolean {
    let moving = false;
    const stepped: Track[] = [];
    for (const t of this.tracks.values()) {
      if (t.driven) continue;
      if (t.shown === t.goal) {
        const want = t.goal === 'hidden' ? 0 : 1;
        if (t.p === want) continue;
        const k = dtMs / (want > t.p ? t.ms.in : t.ms.out);
        t.p = Math.abs(want - t.p) <= k ? want : t.p + Math.sign(want - t.p) * k;
      } else if (t.p > 0) {
        // the vessel as it is retracts first
        t.p = Math.max(0, t.p - dtMs / t.ms.out);
        if (t.p === 0) { t.shown = t.goal; }
      } else { t.shown = t.goal; }
      t.amount = easeMove(t.p);
      stepped.push(t);
      moving = true;
    }
    this.alongFronts(stepped);
    for (const t of stepped) this.apply(t);
    return moving;
  }

  /** A segment's members draw as one run: the front is the first member's eased progress (all of a segment's members move together), and each member shows the part of the run's length that falls in its own span. */
  private alongFronts(stepped: readonly Track[]): void {
    for (const f of this.fronts) {
      const ts = f.ids.map((id) => this.tracks.get(id));
      if (ts.some((t) => !t || t.driven) || !ts.some((t) => stepped.includes(t!))) continue;
      const front = easeMove(ts[0]!.p);
      ts.forEach((t, i) => { t!.amount = Math.min(1, Math.max(0, (front - f.from[i]!) / f.share[i]!)); });
    }
  }
}
