// The beat shapes a what-if slider passes through, from the engine's own states, so a slide's Doppler trace reshapes WHILE the slider is dragged
// (Mohammad, 28 Nov: "the Doppler tracing is not changing with my slider changes"; a trace that waits seconds for the live record to settle does not read as following).
//
// A slide's trace is a replay of the live record's beats (model.ts), which only rescales its level. A slider that changes the SHAPE (tricuspid regurgitation turns the
// hepatic vein's S wave round) needs the shape at the value the slider is at. The engine can say what it is: for each of a few values of the slider
// (decks/controls.ts sliderStops) the state is worked out off screen, on an engine of its own, and its record of the probed vessel is folded into ONE beat by cardiac
// phase (the mean beat: a, S, v, D at their moments, the breath averaged out). Between two values the shape is the straight mix of the two real beats either side
// (a wave's depth is a smooth function of the slider), never a shape no state of the model makes. The replay carries on from its real beats (breath and all) and the
// model adds the difference of this mean beat at the slider's value from the one at the value the real beats were taken at; when the live record has settled on the new
// value the replay takes its real beats from it (model.ts follow / retake) and the difference falls to nothing, with no step.
import { Second } from '../../../engine/pool.ts';
import { sequencer } from '../../../decks/hp/numbers.ts';
import { patchOf } from '../../../decks/controls.ts';

/** Bins of one beat's cardiac phase (0 to 1). */
export const BINS = 64;
/** What the bank needs of a slide: its key (`deck/slide`), the probed vessel, the state the slider's changes are laid on,
 *  the slider's parameter paths, the values it is worked out at, and the slide's own value. */
export interface BankSpec { key: string; vessel: string; base: unknown; paths: string[]; stops: number[]; start: number }
type Samples = Record<string, ArrayLike<number>>;
/** The engine questions the bank asks (a node test answers them with the host on this thread; the app with an engine of its own). */
export interface BankAsk {
  /** The settled state's snapshot with the change laid on `base`. */
  snapAt(base: unknown, paths: readonly string[], x: number): Promise<unknown | null>;
  /** The record of a vessel the state would have made (8 s of the bedside clock); null when the engine gives none. */
  record(snap: unknown, vessel: string): Promise<Samples | null>;
  dispose(): void;
}

/** One beat from a record: the vessel's velocity by cardiac phase, its mean taken out (the level is the slide's own, set by its pin). Null when the record has too few beats of a pulse. */
export function meanBeat(s: Samples | null | undefined): Float32Array | null {
  const vel = s?.vel, ph = s?.ph;
  if (!vel || !ph || vel.length < 100) return null;
  const sum = new Float64Array(BINS), n = new Int32Array(BINS);
  for (let i = 0; i < vel.length; i++) {
    const v = vel[i]!, p = ph[i]!;
    if (!Number.isFinite(v) || !Number.isFinite(p)) continue;
    const b = Math.min(BINS - 1, Math.max(0, Math.floor(p * BINS)));
    sum[b] += v; n[b]++;
  }
  const out = new Float32Array(BINS);
  let have = 0;
  for (let b = 0; b < BINS; b++) if (n[b]) { out[b] = sum[b]! / n[b]!; have++; }
  if (have < BINS * 0.75) return null;
  // (a bin the record left empty is the straight line between its neighbours, round the beat)
  for (let b = 0; b < BINS; b++) {
    if (n[b]) continue;
    let a = 1, c = 1;
    while (!n[(b - a + BINS) % BINS]) a++;
    while (!n[(b + c) % BINS]) c++;
    out[b] = (out[(b - a + BINS) % BINS]! * c + out[(b + c) % BINS]! * a) / (a + c);
  }
  const mean = out.reduce((a, x) => a + x, 0) / BINS;
  for (let b = 0; b < BINS; b++) out[b] = out[b]! - mean;
  return out;
}

/** The mean beats of one slide's slider, by slider value. */
export class ShapeBank {
  readonly beats = new Map<number, Float32Array>();
  loading: Promise<void> | null = null;
  /** Counts every beat that comes in (the model re-reads its mix). */
  version = 0;
  readonly spec: BankSpec;
  constructor(spec: BankSpec) { this.spec = spec; }

  /** Worked out value by value, the ends first, so the bank is usable (the slider's whole range) after the second. */
  load(ask: BankAsk): Promise<void> {
    if (this.loading) return this.loading;
    const { stops, base, paths, vessel } = this.spec;
    const order = [stops[0]!, stops[stops.length - 1]!, ...stops.slice(1, -1)];
    this.loading = (async () => {
      for (const x of order) {
        try {
          const snap = await ask.snapAt(base, paths, x);
          const b = snap ? meanBeat(await ask.record(snap, vessel)) : null;
          if (b) { this.beats.set(x, b); this.version++; }
        } catch { /* the engine failed: the trace keeps what it has (the real beats, settled by the record) */ }
      }
    })().finally(() => ask.dispose());
    return this.loading;
  }

  /** The beat at slider value x: the mix of the two worked-out values either side (the nearest one beyond the ends), null while fewer than two are in. */
  at(x: number, out = new Float32Array(BINS)): Float32Array | null {
    if (this.beats.size < 2) return null;
    const xs = [...this.beats.keys()].sort((a, b) => a - b);
    let lo = xs[0]!, hi = xs[xs.length - 1]!;
    for (const k of xs) { if (k <= x) lo = k; }
    for (let i = xs.length - 1; i >= 0; i--) { if (xs[i]! >= x) hi = xs[i]!; }
    if (x <= xs[0]!) lo = hi = xs[0]!;
    if (x >= xs[xs.length - 1]!) lo = hi = xs[xs.length - 1]!;
    const a = this.beats.get(lo)!, b = this.beats.get(hi)!, u = hi > lo ? (x - lo) / (hi - lo) : 0;
    for (let i = 0; i < BINS; i++) out[i] = a[i]! + (b[i]! - a[i]!) * u;
    return out;
  }
}

let seed = 1;
/** An engine of its own for the bank (the app's: a worker that lives only while the beats are worked out). */
export function secondAsk(): BankAsk {
  const second = new Second();
  const hist = new Map<number, { resolve(s: Samples | null): void; reject(e: Error): void }>();
  let seq: ReturnType<typeof sequencer> | null = null, chain: Promise<unknown> = Promise.resolve();
  second.subscribe((m) => {   // (lives for the page) the engine is the bank's own and ends with `dispose`
    seq?.message(m as Parameters<ReturnType<typeof sequencer>['message']>[0]);
    if (m.type === 'crash') { for (const [, w] of hist) w.reject(new Error(String(m.message))); hist.clear(); return; }
    if (m.type === 'history' && m.reqId != null) { hist.get(m.reqId)?.resolve((m.samples as Samples | null | undefined) ?? null); hist.delete(m.reqId); }
  });
  const next = <T>(f: () => Promise<T>): Promise<T> => { const p = chain.then(f); chain = p.then(() => undefined, () => undefined); return p; };
  return {
    snapAt: (base, paths, x) => next(async () => {
      const reqId = seed++;
      seq = sequencer(reqId);
      second.post({ type: 'sequence', steps: [{ params: patchOf(paths, x) }], reqId, base });
      try { await seq.done; } finally { second.idle(); }
      return seq.results[0]?.snap ?? null;
    }),
    record: (snap, vessel) => next(() => new Promise<Samples | null>((resolve, reject) => {
      const reqId = seed++;
      hist.set(reqId, { resolve: (s) => { second.idle(); resolve(s); }, reject });
      second.post({ type: 'restore', snap });
      second.post({ type: 'probe', id: vessel });
      second.post({ type: 'history', secs: 8, reqId });
    })),
    dispose: () => second.dispose(),
  };
}

const banks = new Map<string, ShapeBank>();
/** The bank of a slide's slider (made and started once per slide and base; `ask` for a node test). A spec whose state is not in yet (no base) makes none. */
export function bankFor(spec: BankSpec | null | undefined, ask: () => BankAsk = secondAsk): ShapeBank | null {
  if (!spec?.base || spec.stops.length < 2) return null;
  const id = spec.key;
  let b = banks.get(id);
  if (!b || b.spec.base !== spec.base) { b = new ShapeBank(spec); banks.set(id, b); void b.load(ask()); }
  return b;
}
