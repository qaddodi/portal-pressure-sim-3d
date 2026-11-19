// Keeps each vessel's shape where the 2D figure has it: a collateral coils as it opens and its strands fan out as far as their varix is big (stage-tubes.js), a
// fan of tributaries thins and thickens as its rule comes on. The positions are rewritten in place (VesselObject.reshape), and only while a shape moves.
import { type NetVessel, type PresenceFrame, collateralOpen, feederLive, recruitFrac } from './network.ts';
import { CoilState, LOOK_SITE, varixGrowth, varixSize, varixSpreadK } from './coil.ts';
import { REST, type ShapeState, coursesOf, tubularOf } from './shape.ts';
import { buildTubes } from './tubes.ts';
import { BEAD_SITE, varixBead } from './varix-bead.copied.js';
import { bandsStep } from './band-ease.copied.js';
import { slicesFor } from '../circuit/geometry.ts';
import type { VesselObject } from './vessel-object.ts';

const VARIX_CHANNELS: Record<string, 'VAR' | 'GV'> = { C1a: 'VAR', C1b: 'VAR', C2: 'GV' };
const VARIX_MEAN_MS = 2000, VARIX_JUMP_MM = 1.5;

export interface ShapeFrame extends PresenceFrame { metrics?: { varix?: { d?: number; present?: boolean }; gastricVarix?: { d?: number; present?: boolean } }; bands?: number }

interface Item { v: NetVessel; obj: VesselObject; coil: CoilState; state: ShapeState; tubular: number[]; shown: number; spread: number; live: number; strandsOn: boolean; bead: number; built: string }

const keyOf = (s: ShapeState) => `${s.wig.toFixed(2)}|${s.spr.toFixed(3)}|${s.rec.toFixed(2)}|${s.bead.toFixed(2)}|${s.bands.toFixed(2)}|${s.strandsOn ? 1 : 0}|${s.live.toFixed(2)}`;

export class ShapeTracks {
  private items: Item[] = [];
  /** the bands the model counts, and the count drawn (it follows in a moment, band-ease.js: a strand a band closes fades out rather than vanishing in a frame) */
  private bandsGoal = 0;
  private bandsShown: number | null = null;
  /** the running mean of each varix's diameter (a pulse of the beat averages out; a real change is followed within two seconds) */
  private mean: Record<'VAR' | 'GV', { m: number | null; at: number }> = { VAR: { m: null, at: 0 }, GV: { m: null, at: 0 } };

  constructor(vessels: readonly NetVessel[], objects: ReadonlyMap<string, VesselObject>) {
    for (const v of vessels) {
      const obj = objects.get(v.id), p = v.plan;
      if (!obj || !p) continue;
      if (p.kind === 'coil' && !p.coils && !LOOK_SITE[v.id] && !p.strands) continue;
      if (p.kind === 'coil' && !p.coils && !p.strands) continue;
      this.items.push({ v, obj, coil: new CoilState(), state: { ...REST }, tubular: tubularOf(v, slicesFor(v.id)), shown: 0, spread: 1, live: 1, strandsOn: false, bead: 0, built: keyOf(REST) });
    }
  }

  /** The vessels that have a shape to keep (for the first build). */
  get count(): number { return this.items.length; }

  /** A new frame of the model: where each shape is heading. `now` in ms; `instant` settles at once (a new patient, the first frame). */
  onFrame(f: ShapeFrame, now: number, healthyQ: ArrayLike<number> | undefined, instant: boolean): void {
    const d: Record<'VAR' | 'GV', number | undefined> = { VAR: f.metrics?.varix?.d, GV: f.metrics?.gastricVarix?.d };
    const pres: Record<'VAR' | 'GV', boolean> = { VAR: !!f.metrics?.varix?.present, GV: !!f.metrics?.gastricVarix?.present };
    for (const site of ['VAR', 'GV'] as const) {
      const h = this.mean[site], x = d[site];
      if (x == null || !Number.isFinite(x)) continue;
      const dt = now - h.at;
      h.m = instant || h.m == null || dt > 3000 || dt < 0 || Math.abs(x - h.m) > VARIX_JUMP_MM ? x : h.m + (x - h.m) * (1 - Math.exp(-dt / VARIX_MEAN_MS));
      h.at = now;
    }
    this.bandsGoal = f.bands || 0;
    if (instant) this.bandsShown = this.bandsGoal;
    for (const it of this.items) {
      const id = it.v.id, p = it.v.plan!;
      const bs = (BEAD_SITE as Record<string, string>)[id];
      it.bead = bs ? Math.round((varixBead(this.mean[bs === 'varix' ? 'VAR' : 'GV'].m ?? undefined) as number) * 100) / 100 : 0;
      if (p.kind === 'feeder') { it.live = feederLive(it.v.feeder!, f, healthyQ); continue; }
      const site = VARIX_CHANNELS[id], rf = recruitFrac(id, f);
      it.shown = site ? Math.max(rf, varixGrowth(pres[site], this.mean[site].m ?? undefined)) : rf;
      const lookSite = LOOK_SITE[id];
      it.spread = lookSite ? varixSpreadK(varixSize(lookSite, this.mean[lookSite].m ?? undefined)) : 1;
      it.strandsOn = p.coils ? collateralOpen(id, f) : true;
    }
    if (instant) for (const it of this.items) this.settle(it, 0, true);
  }

  private settle(it: Item, dtMs: number, instant: boolean): boolean {
    const p = it.v.plan!;
    let moving = false;
    if (p.kind === 'coil') {
      const strandsChanged = it.state.strandsOn !== it.strandsOn;
      moving = it.coil.step(it.shown, it.spread, dtMs, instant) || strandsChanged;
      it.state.wig = it.coil.wig; it.state.spr = it.coil.spr; it.state.strandsOn = it.strandsOn;
      if (it.state.bead !== it.bead) { it.state.bead = it.bead; moving = true; }
      if (it.v.id === 'C1a' || it.v.id === 'C1b') { const b = Math.round((this.bandsShown ?? this.bandsGoal) * 20) / 20; if (b !== it.state.bands) { it.state.bands = b; moving = true; } }
      if (it.v.id === 'C8') { const r = Math.round(it.shown * 20) / 20; moving = moving || r !== it.state.rec; it.state.rec = r; }
    } else {
      const q = Math.round(it.live * 20) / 20;
      moving = q !== it.state.live;
      it.state.live = q;
    }
    const key = keyOf(it.state);
    if (key !== it.built) {
      const { geometry, length } = buildTubes(coursesOf(it.v, it.state), it.tubular, it.v.radius);
      it.obj.reshape(geometry, length);
      geometry.dispose();
      it.built = key;
    }
    return moving;
  }

  /** Eases the shapes one frame; true while any is still moving. */
  step(dtMs: number): boolean {
    let moving = false;
    const was = this.bandsShown;
    this.bandsShown = bandsStep(this.bandsShown, this.bandsGoal, dtMs / 1000) as number;
    if (this.bandsShown !== this.bandsGoal || was !== this.bandsShown) moving = true;
    for (const it of this.items) if (this.settle(it, dtMs, false)) moving = true;
    return moving;
  }
}
