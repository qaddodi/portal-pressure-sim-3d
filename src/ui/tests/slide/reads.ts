// The ONE place a measurement takes its numbers from (the EUS-PPG's needle, the HVPG catheter's, the IR PPG, the TIPS gradient: their callouts, their monitors, their words).
//
// The wrong source (23 Nov 2026, the HVPG deck review 1): the copied 2D procedure code reads `frame.P`, the engine's beat-by-beat pressures, taken at one instant of one beat and
// one breath. Everything else on the screen (the tiles, the text's `{eus}`, the chart, the figure's labels) reads the SHOWN pressures: `Pf`, the mean over exactly one breath and one
// beat (display-mean.js), which the slide's own state is made of. At the EUS slide's patient the instant's gap LPV − LHV swings 13.2 to 16.5 mmHg (mean 14.7) while the shown gap and
// the slide's `{eus}` read 14.9, so the tracing said 14.1 where the text and chart said 14.9 (tests/reads-one-source.test.ts proves it in node).
//
// So a reading is taken from `readFrame`: the shown pressures and flows, and, while a slide's own state is pinned (pin.ts: a data card is up), that state's numbers, so the needle, the
// monitor, the callouts, the words and the chart can never disagree on a slide. Off a slide (the Tests cards) it is the live model's shown pressures.
import { slideFp } from './pin.ts';

interface Frame { P: ArrayLike<number>; Q: ArrayLike<number>; Pf?: ArrayLike<number>; Qf?: ArrayLike<number>; metrics?: unknown }
/** The reading keys the pinned state overrides in the frame's metrics: the ones the procedures print (copied proc-anim.js capture, reading-scripts.copied.js). */
const KEYS = ['pv', 'ivc', 'ppg', 'whvp', 'fhvp', 'hvpg', 'ra'] as const;

let kept: { f: Frame; fp: unknown; view: Frame } | null = null;

/** `f` as a measurement reads it: P and Q are the shown pressures and flows, or the pinned slide's own. Same object back for the same frame and pin (a monitor asks every frame). */
export function readFrame<F extends Frame>(f: F): F;
export function readFrame<F extends Frame>(f: F | null | undefined): F | null;
export function readFrame<F extends Frame>(f: F | null | undefined): F | null {
  if (!f) return null;
  const fp = slideFp() as ({ at?: { P?: ArrayLike<number>; Q?: ArrayLike<number> } } & Record<string, unknown>) | null | undefined;
  if (kept && kept.f === f && kept.fp === (fp ?? null)) return kept.view as F;
  let view: Frame;
  if (fp?.at?.P) {
    const m = { ...(f.metrics as Record<string, unknown> | undefined) };
    for (const k of KEYS) if (typeof fp[k] === 'number' && Number.isFinite(fp[k])) m[k] = fp[k];
    view = { ...f, P: fp.at.P, Q: fp.at.Q ?? f.Qf ?? f.Q, metrics: m };
  } else view = { ...f, P: f.Pf ?? f.P, Q: f.Qf ?? f.Q };
  kept = { f, fp: fp ?? null, view };
  return view as F;
}
