// The procedure layer: every device the Treat verbs and the decks put on the figure that is not a vessel (catheters, wires, balloons, the stent, the tamponade tube, bands). It owns their
// objects, plays the 2D app's own choreography on the clock (`procFrame(kind, t)`, proc-anim.js: the same times, the same steps), and draws what that says. Nothing here is a loop of its own:
// `update(now)` is called from the scene's frame and answers whether it needs another.
import { Group, type Vector3 } from 'three';
import type { VesselObject } from '../vessels/vessel-object.ts';
import type { CelShared } from '../materials/cel.ts';
import type { Palette } from '../palette.ts';
import { ProcCatheter, type CatheterState, type RingName } from '../devices/catheters/proc-catheter.ts';
import { route3d, stopsOf } from './route3d.ts';
import { procFrame as procFrameJs, specOf } from './copied/proc-anim.js';
import { CATH_END } from './copied/cath-arrival.js';

const procFrame = procFrameJs as (kind: string, t: number, stops?: Record<string, [number, number]> | null, into?: object | null, from?: number) => Rec;
/** How far the bypass drops from the 'over' tier so it sits below the 'front' tier the splenic and coronary veins are on (frame2d.ts TIER_Z: over .54, front .46, net .38). */
export const REX_LOWER = -0.12;
type Rec = { u: number; balloon: number; column: number; opacity: number; step: number; shot: string; needle: number; wire: number; flash: number; coil?: number; read?: number; [k: string]: unknown };
/** One move of a procedure on the clock. */
interface Run { kind: string; t: number; t0: number; from: number; to: number; speed: number; rec: Rec; onEnd?: () => void; onFrame?: (r: Readonly<Rec>) => void; keep: boolean }

export interface PlayOptions {
  /** start and stop, ms of the procedure's own time (default: the whole of it) */
  from?: number; to?: number;
  /** playback speed, 1 = the 2D app's pace */
  speed?: number;
  onFrame?: (r: Readonly<Rec>) => void;
  onEnd?: () => void;
  /** leave the last frame up when it ends (a step's end), instead of clearing */
  keep?: boolean;
}

/** The colour of the reading ripples a `read` value names, by procedure (the 2D specs' ring1 and ring2). */
export function ringOf(kind: string, read: number): RingName | null {
  if (!read) return null;
  if (kind === 'hvpgcath') return read === 1 ? 'free' : 'wedge';
  if (kind === 'tipsgrad') return read === 1 ? 'pv' : 'ivc';
  const spec = specOf(kind) as { readAs?: number } | null;
  return (spec?.readAs ?? read) === 1 ? 'pv' : 'ivc';
}

export class ProcedureLayer {
  readonly group = new Group();
  private readonly caths = new Map<string, ProcCatheter>();
  private shown: ProcCatheter | null = null;
  private run: Run | null = null;
  private palette: Palette | null = null;
  private phone = false;
  private dirty = true;
  /** kind → the catheter it drew last (so a stop can clear it) */
  private lastKind: string | null = null;
  /** the shape of the last frame the layer drew, for tests and tags */
  readonly frame: Rec = { u: 0, balloon: 0, column: 0, opacity: 0, step: -1, shot: '', needle: 0, wire: 0, flash: 0, coil: 0, read: 0 };

  private readonly shared: CelShared;
  constructor(shared: CelShared) { this.shared = shared; this.group.name = 'procedures'; }

  /** Every object the layer draws, for the scene's look and phone switches and for disposal. */
  get objects() { return [...this.caths.values()].flatMap((c) => c.objects); }

  applyPalette(p: Palette): void { this.palette = p; for (const c of this.caths.values()) c.applyPalette(p); this.dirty = true; }
  setPhone(phone: boolean): void { this.phone = phone; for (const c of this.caths.values()) c.setPhone(phone); this.dirty = true; }

  /** The route a procedure's catheter travels (its spec's `route`, else the kind itself), or null for one with no catheter (a graft, a scope). */
  routeKindOf(kind: string): string | null {
    const spec = specOf(kind) as { route?: string; graft?: boolean } | null;
    if (!spec || spec.graft) return null;
    const k = spec.route || kind;
    return route3d(k) ? k : null;
  }

  private catheterFor(kind: string): ProcCatheter | null {
    const rk = this.routeKindOf(kind);
    if (!rk) return null;
    const key = `${rk}|${(specOf(kind) as { balloonSpan?: string } | null)?.balloonSpan ?? ''}`;
    let c = this.caths.get(key);
    if (!c) {
      const r3 = route3d(rk)!;
      c = new ProcCatheter(r3, this.shared, (specOf(kind) as { balloonSpan?: string } | null)?.balloonSpan ?? null);
      if (this.palette) c.applyPalette(this.palette);
      c.setPhone(this.phone);
      this.group.add(c.group);
      this.caths.set(key, c);
    }
    return c;
  }

  /** The procedure's stretches for `procFrame` (the TIPS tract and the right portal vein as u on this route). */
  stopsFor(kind: string): Record<string, [number, number]> | null {
    const rk = this.routeKindOf(kind);
    const r3 = rk ? route3d(rk) : null;
    return r3 ? stopsOf(r3) : null;
  }

  private draw(kind: string, rec: Rec, clock: number): void {
    const c = this.catheterFor(kind);
    if (this.shown && this.shown !== c) this.shown.set({ ...this.shown.current, u: 0, opacity: 0 });
    this.shown = c; this.lastKind = kind;
    Object.assign(this.frame, rec);
    if (c) {
      const st: CatheterState = { u: rec.u, balloon: rec.balloon, column: rec.column, opacity: rec.opacity, needle: rec.needle, wire: rec.wire, flash: rec.flash, coil: rec.coil ?? 0,
        ring: ringOf(kind, rec.read ?? 0), columnTone: kind === 'brto' || kind === 'brtoC6' || kind === 'bato' ? 'trScler' : 'trWedge', clock };
      c.set(st);
    }
    this.dirty = true;
  }

  /** Put a procedure at time t (ms of its own), at once. */
  seek(kind: string, t: number, clock = t): void { this.draw(kind, procFrame(kind, t, this.stopsFor(kind), { ...this.frame }), clock); }

  /** The HVPG catheter as the deck holds it: how far in (0..1), the balloon (0..1, and the wedged blood with it), and the ring it reads in, at once. */
  showHvpgState(advance: number, balloon: number, ring: RingName | null = null, clock = 0): void {
    const rec = { ...this.frame, u: advance, balloon, column: balloon, opacity: advance > 0.001 ? 1 : 0, step: -1, shot: '', needle: 0, wire: 0, flash: 0, coil: 0, read: 0 } as Rec;
    const c = this.catheterFor('hvpgcath');
    if (this.shown && this.shown !== c) this.shown.set({ ...this.shown.current, u: 0, opacity: 0 });
    this.shown = c; this.lastKind = 'hvpgcath';
    Object.assign(this.frame, rec);
    c?.set({ u: advance, balloon, column: balloon, opacity: rec.opacity, needle: 0, wire: 0, flash: 0, coil: 0, ring, columnTone: 'trWedge', clock });
    this.dirty = true;
  }

  /** Where a catheter step ends, the HVPG's route, free, wedge, result and blocked (cath-arrival.js CATH_END), at once; `advance` is how far in the tip is (0..1). */
  showHvpg(mode: keyof typeof CATH_END, advance = 1, clock = 0): void {
    const e = CATH_END[mode];
    this.showHvpgState(advance, e.balloon, e.ring as RingName | null, clock);
  }

  /** Play a procedure from `from` to `to` (default the whole of it) on the scene's frames. */
  play(kind: string, now: number, o: PlayOptions = {}): void {
    const spec = specOf(kind) as { T: { end: number } } | null;
    if (!spec) throw new Error(`no procedure ${kind}`);
    const from = o.from ?? 0, to = o.to ?? spec.T.end;
    this.run = { kind, t: from, t0: now, from, to, speed: o.speed ?? 1, rec: { ...this.frame } as Rec, onEnd: o.onEnd, onFrame: o.onFrame, keep: !!o.keep };
    this.dirty = true;
  }

  get playing(): { kind: string; t: number } | null { return this.run ? { kind: this.run.kind, t: this.run.t } : null; }

  /** End the move: clear the devices (or leave the last frame up with `keep`). */
  stop(keep = false): void {
    this.run = null;
    if (!keep) this.clear();
  }

  clear(): void {
    for (const c of this.caths.values()) c.set({ ...c.current, u: 0, opacity: 0, balloon: 0, column: 0, needle: 0, wire: 0, flash: 0, coil: 0, ring: null });
    this.shown = null; this.dirty = true;
  }

  private rexUnder = false;
  /** While the Meso-Rex bypass is shown it runs UNDER the splenic and coronary veins and the portocaval shunt (anatomy.js REX_UNDER: they draw a tier above it), so the crossings read as crossings and not as joins:
   *  the bypass is lowered below the portal tree's tier and those three stay where they are. */
  setRexUnder(on: boolean, vessel: (id: string) => VesselObject | undefined): void {
    this.rexUnder = on;
    const rex = vessel('REX');
    if (rex) rex.group.position.z = on ? REX_LOWER : 0;
    this.dirty = true;
  }
  get isRexUnder(): boolean { return this.rexUnder; }

  /** The tip's scene position now, for tags and the camera (null with no catheter out). */
  tipPosition(out: Vector3): Vector3 | null { return this.shown && this.frame.u > 0.001 ? this.shown.tipAt(this.frame.u, out) : null; }

  /** Steps the move on the clock. True while it plays, or draws once more. */
  update(now: number): boolean {
    const r = this.run;
    if (r) {
      const t = Math.min(r.to, r.from + (now - r.t0) * r.speed);
      r.t = t;
      this.draw(r.kind, procFrame(r.kind, t, this.stopsFor(r.kind), r.rec), t);
      r.onFrame?.(this.frame);
      if (t >= r.to) { const end = r.onEnd; const keep = r.keep; this.run = null; if (!keep) this.clear(); end?.(); }
      return true;
    }
    const d = this.dirty; this.dirty = false;
    return d;
  }

  dispose(): void { for (const o of this.objects) o.dispose(); }
}
