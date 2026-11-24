// Whether the beat-by-beat card's strip has caught up with the numbers beside it. The card's header, brackets and tags print the slide's settled state (its pinned fingerprint, so they equal the
// tiles to the digit), while its strip is the model's own record, which is still easing from the slide before's patient for a few seconds and holds no past at all until the engine's history
// request returns. In that window the strip shows 17 and 3 mmHg against readouts of 20.1 and 4.1 (Resuscitating an acute variceal bleed 15), or only a short stub at the right edge (Gastric
// varices 4, Resuscitating 8). A capture waits on this, and the card does not call the strip done until it is: the numbers and the lines always come from the same state.
import type { BeatReadings } from './beat-frame.ts';

interface RecordLike { t: ArrayLike<number>; ch: Record<string, ArrayLike<number>> }

/** The span of the strip, the window the means are taken over, and how far a line may sit from its reading. */
const WINDOW_S = 2, TOL_MM = 0.8, TOL_REL = 0.05;

const meanOver = (rec: RecordLike, key: string, t0: number, t1: number): number => {
  const v = rec.ch[key], n = rec.t.length;
  if (!v) return NaN;
  let s = 0, k = 0;
  for (let i = n - 1; i >= 0 && rec.t[i]! >= t0; i--) { if (rec.t[i]! <= t1 && Number.isFinite(v[i]!)) { s += v[i]!; k++; } }
  return k ? s / k : NaN;
};

/** True when the record holds the whole strip (`span` seconds) and its last seconds average to the pinned readings (the portal vein's line is left out when the slide hides it). */
export function beatAgrees(rec: RecordLike, pin: BeatReadings | null, span: number, noPv = false): boolean {
  const n = rec.t.length;
  if (!n) return false;
  const end = rec.t[n - 1]!;
  if (end - rec.t[0]! < span) return false;   // (the history has not come back: only a stub at the right edge)
  if (!pin) return true;
  const pairs: [string, number][] = [['whvp', pin.whvp], ['RHV', pin.fhvp], ...(noPv ? [] : [['CONF', pin.pv] as [string, number]])];
  for (const [k, want] of pairs) {
    if (!Number.isFinite(want)) continue;
    const got = meanOver(rec, k, end - WINDOW_S, end);
    if (!Number.isFinite(got)) return false;
    if (Math.abs(got - want) > Math.max(TOL_MM, TOL_REL * Math.abs(want))) return false;
  }
  return true;
}

type Card = { pin: () => BeatReadings | null; noPv: () => boolean; rec: RecordLike; span: number };
let mounted: Card | null = null;
/** A beat card on show registers itself here, and takes itself off on leaving (a leaving card never clears the one that came in), so a capture can ask. */
export function setBeatCard(c: Card, leaving = false): void { if (!leaving) mounted = c; else if (mounted === c) mounted = null; }
/** True while a beat card is on show and its strip has not caught up with its numbers. */
export const beatCardWaiting = (): boolean => !!mounted && !beatAgrees(mounted.rec, mounted.pin(), mounted.span, mounted.noPv());
