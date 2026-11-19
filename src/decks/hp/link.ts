// A talk whose numbers come from each slide's own state (`numbers: 'states'`): the readings the cards print are the state of the slide on show (and of the slides its
// `{key@slide}` words name), and the figure eases to that slide's state in the live engine. The states are computed off screen (calc.ts), so a slide never shows a half-made one.
import { engine } from '../../engine/boot.ts';
import { useEngine } from '../../engine/store.ts';
import { useUi, type Readings } from '../../ui/ui-store.ts';
import { tokensOf } from '../../ui/text/tokens.ts';
import type { Deck } from '../schema.ts';
import { ensureStates, useStates } from './calc.ts';
import { copiedOf } from './deck.ts';
import { playLapse, playsLapse, stopLapse } from './lapse.ts';

/** How long the figure takes to ease to the next slide's state (ms). */
export const MORPH_MS = 1100;

const at = (deck: Deck): { key: string; at: string }[] => {
  const texts = [...deck.slides.flatMap((s) => [s.line, s.vignette ?? '']), ...deck.checks.flat()];
  const seen = new Map<string, { key: string; at: string }>();
  for (const t of texts) for (const { token } of tokensOf(t)) if (token.kind === 'value' && token.at) seen.set(`${token.key}@${token.at}`, { key: token.key, at: token.at });
  return [...seen.values()];
};

/** Which state a position shows: the title and the first slide show the first slide's; the quick check keeps the last's. */
export const stateIndex = (kind: 'title' | 'slide' | 'check', stop: number, n: number): number => (kind === 'slide' ? stop - 1 : kind === 'check' ? n - 1 : 0);

const numeric = (fp: Readonly<Record<string, unknown>> | null | undefined): Readings => {
  const out: Readings = {};
  if (fp) for (const [k, v] of Object.entries(fp)) if (typeof v === 'number') out[k] = v;
  return out;
};

export function linkStates(deck: Deck): () => void {
  const copied = copiedOf(deck.id);
  if (!copied) return () => {};
  const ids = deck.slides.map((s) => s.id);
  const named = at(deck);
  useUi.setState({ readings: {} });
  void ensureStates(copied);
  let morphed: unknown = null;
  const sync = () => {
    const { stops, pos } = useUi.getState();
    const stop = stops[pos.stop];
    if (!stop) return;
    const res = useStates.getState().results[deck.id];
    const i = stateIndex(stop.kind, pos.stop, ids.length);
    // until this slide's state is in, the headline numbers are the live figure's (the first slide opens at once; the others follow as the states arrive)
    const live = useEngine.getState();
    const r: Readings = res?.[i] ? numeric(res[i]!.fp) : { whvp: live.whvp, fhvp: live.fhvp, hvpg: live.hvpg, ivc: live.ivc, ra: live.ra, pv: live.pv };
    for (const n of named) {
      const fp = res?.[ids.indexOf(n.at)]?.fp;
      if (typeof fp?.[n.key] === 'number') r[`${n.key}@${n.at}`] = fp[n.key] as number;
      if (n.key === 'map') for (const k of ['sbp', 'dbp']) if (typeof fp?.[k] === 'number') r[`${k}@${n.at}`] = fp[k] as number;
    }
    useUi.getState().setReadings(r);
    const snap = res?.[i]?.snap;
    if (snap && snap !== morphed) {
      morphed = snap;
      const cs = stop.kind === 'slide' ? copied.slides[i] : undefined;
      if (playsLapse(cs, i) && res?.[i - 1]?.snap) {
        // a time-lapse: the days play on the live figure from the slide before's state, then it eases to this slide's computed end
        playLapse(`${deck.id}/${ids[i]}`, cs, res[i - 1]!.snap, snap, () => {}, window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
      } else {
        stopLapse();
        try { engine().send({ type: 'morph', snap, ms: MORPH_MS }); } catch { /* the engine is not up yet: the first slide is shown when it is */ }
      }
    }
  };
  sync();
  const offUi = useUi.subscribe((s, p) => { if (s.pos !== p.pos || s.stops !== p.stops) sync(); });
  const offStates = useStates.subscribe((s, p) => { if (s.results[deck.id] !== p.results[deck.id]) sync(); });
  return () => { offUi(); offStates(); stopLapse(); };
}
