// The figure's station labels print the slide's number, not a second reading of the same model (capture 3531bdfa, one number several values: 08.6 "Portal 22.3" on the card and chart, 22.4 on the
// figure; 03.12 PPG 18.0 against 21.6 - 4.0 on the figure; 05.6 the right atrium 19.8 in the words, 19.6 on the figure; 06.4 portal flow 1.5 against 1.4 L/min).
//
// Root cause: the words, the tiles and the charts print the slide's settled state (the second engine's fingerprint, rounded once by ui/text/tokens.ts), while a label read the live frame's
// eased pressures (`Pf`), which are the mean of the last breath and beat of a model that keeps breathing: a tenth or two from the settled value, a different tenth on every device and
// every second. So the rule is one place: while the live model stands on the slide's own state (every node within a hair of the fingerprint's, so it is at rest there, not easing to it,
// not played on by a time-lapse, a procedure or a held strain), the figure reads that state's pressures and flows; anywhere else (free play, a slider mid-drag, a day running) it reads
// the live frame. A node pressure can never print a different digit from the slide's own number for the same station (tests/one-number.test.ts).

/** A node pressure (mmHg) the live model may stray from the settled one and still be at rest on it: the display mean's own dead band (ui/tests/slide/reads.ts: 0.15) with room. */
export const REST_P = 0.3;
/** The same for an edge flow, a share of the larger of the two (floored, so a vessel with no flow cannot hold the rest open). */
export const REST_Q = 0.03;
const Q_FLOOR = 0.5;

interface Arr { readonly length: number; readonly [i: number]: number }
/** The slide's settled state as the label layer needs it: its fingerprint, whose `at` holds the node pressures and edge flows. */
export type ShownFp = (Readonly<Record<string, unknown>> & { at?: { P?: Arr; Q?: Arr } }) | null | undefined;
interface FrameLike { P: Arr; Pf?: Arr; Q: Arr; Qf?: Arr; metrics?: object }

let shown: ShownFp = null, held = false;
/** The fingerprint of the slide on show (the pressed control's, while one is pressed), or null off a slide (decks/hp/link.ts).
 *  `hold`: a control of the slide is pressed (a what-if slider, a compare button), so the words print the pressed state's numbers and the labels must too, whether or not the live model has
 *  finished easing to it. A slider's change is eased in WITHOUT settling (controls-run.ts dragWhatIf): the live model is a tenth or more off the settled state for seconds, and the label
 *  then read the live digit: the card said RA 19.7, the figure's label 19.8 (Cardiac 6, the tricuspid regurgitation slider, 28 Nov). */
export function setShownFp(fp: ShownFp, hold = false): void { shown = fp ?? null; held = !!fp && hold; }
export const shownFp = (): ShownFp => shown;

/** The metric keys a station's number is taken from (ui/action/read.ts BAR_KEY), as the fingerprint carries them. */
const KEYS = ['pv', 'whvp', 'fhvp', 'hvpg', 'ivc', 'ra', 'ppg'] as const;

/** Whether the live pressures and flows stand where the settled ones do. */
export function atRest(f: FrameLike, fp: ShownFp): boolean {
  const P = fp?.at?.P, Q = fp?.at?.Q, Pf = f.Pf ?? f.P;
  if (!P || P.length !== Pf.length) return false;
  for (let i = 0; i < P.length; i++) if (Math.abs(Pf[i]! - P[i]!) > REST_P) return false;
  const Qf = f.Qf ?? f.Q;
  if (Q && Q.length === Qf.length) {
    for (let i = 0; i < Q.length; i++) if (Math.abs(Qf[i]! - Q[i]!) > REST_Q * Math.max(Math.abs(Qf[i]!), Math.abs(Q[i]!), Q_FLOOR)) return false;
  }
  return true;
}

let kept: { f: FrameLike; fp: ShownFp; view: FrameLike; held: boolean } | null = null;
/** The frame a label reads: the live one, or, while it is at rest on the slide's own state, that state's numbers (the same object back for the same frame and state: a label layer asks often). */
export function settledFrame<F extends FrameLike>(f: F | null | undefined, fp: ShownFp = shown): F | null {
  if (!f) return null;
  if (!fp?.at?.P) return f;
  if (kept && kept.f === f && kept.fp === fp && kept.held === held) return kept.view as F;
  let view: FrameLike = f;
  if (held || atRest(f, fp)) {
    const m: Record<string, unknown> = { ...(f.metrics as Record<string, unknown> | undefined) };
    for (const k of KEYS) if (typeof fp[k] === 'number' && Number.isFinite(fp[k])) m[k] = fp[k];
    // (the right atrium's bar reading, `vitals.ra`, is the number the station prints before `ra`)
    if (typeof fp.ra === 'number' && m.vitals && typeof m.vitals === 'object') m.vitals = { ...(m.vitals as object), ra: fp.ra };
    view = { ...f, P: fp.at.P, Pf: fp.at.P, Q: fp.at.Q ?? f.Q, Qf: fp.at.Q ?? f.Qf, metrics: m };
  }
  kept = { f, fp, view, held };
  return view as F;
}
