// A talk whose numbers come from each slide's own state (`numbers: 'states'`): the readings the cards print are the state of the slide on show (and of the slides its
// `{key@slide}` words name), and the figure eases to that slide's state in the live engine. The states are computed off screen (calc.ts), so a slide never shows a half-made one.
import { engine } from '../../engine/boot.ts';
import { useEngine } from '../../engine/store.ts';
import { useUi, type Readings } from '../../ui/ui-store.ts';
import { tokensOf } from '../../ui/text/tokens.ts';
import type { Deck } from '../schema.ts';
import { ensureStates, useStates } from './calc.ts';
import { setFigurePending } from '../../ui/deck/figure-pending.ts';
import { readingsOf } from './readings-of.ts';
import { mergeStates } from '../../ui/charts/baked/view.ts';
import { copiedOf } from './deck.ts';
import { sceneApi } from '../../scene/api.ts';
import { viewAt } from '../../ui/deck/presenter-machine.ts';
import { playLapse, playsLapse, readyLapse, showLapseEnd, stopLapse } from './lapse.ts';
import { slideLanded, onLanded } from '../../ui/deck/landing.ts';
import { pushFor, showPushEnd } from './lapse-push.ts';
import { pushShotOf } from './lapse-cam.ts';
import { specOf, procKindOf } from '../../scene/procedures/copied/proc-anim.js';
import '../../scene/procedures/instrument-specs.ts';   // (registers EVL and paracentesis, the procedures that are engine actions)
import { landsDone, morphMsFor, opensBefore } from './slide-motion.ts';
import { useVariant } from '../../ui/talk/variant-words.ts';
import { withVariant, releaseVariantOff } from '../../ui/talk/shown-state.ts';
import { warmControls } from '../../ui/talk/controls-run.ts';
import { setShownFp } from '../../scene/labels/settled.ts';

import { clock } from '../../clock/frame.ts';
/** How long the figure takes to ease to the next slide's state when the patient stays (ms; slide-motion.ts: 2D's MORPH_ONE_MS). */
export const MORPH_MS = 1200;

const at = (deck: Deck): { key: string; at: string }[] => {
  const texts = [...deck.slides.flatMap((s) => [s.line, s.vignette ?? '']), ...deck.checks.flat()];
  const seen = new Map<string, { key: string; at: string }>();
  for (const t of texts) for (const { token } of tokensOf(t)) if (token.kind === 'value' && token.at) seen.set(`${token.key}@${token.at}`, { key: token.key, at: token.at });
  return [...seen.values()];
};

/** Which state a position shows: the title and the first slide show the first slide's; the quick check keeps the last's. */
export const stateIndex = (kind: 'title' | 'slide' | 'check', stop: number, n: number): number => (kind === 'slide' ? stop - 1 : kind === 'check' ? n - 1 : 0);

export function linkStates(deck: Deck): () => void {
  const copied = copiedOf(deck.id);
  if (!copied) return () => {};
  const ids = deck.slides.map((s) => s.id);
  const named = at(deck);
  useUi.setState({ readings: {} });
  void ensureStates(copied);
  let morphed: unknown = null;
  // where the talk came from (2D lastAt): a slide reached by Back or a jump back does not play its days (2D `back`), it shows where they ended
  let lastStop = -1, from = -1;
  // the stop whose time-lapse moved the camera (its push, or its end framing): the camera is brought to the next slide's own framing as it is left, whatever that slide asks of the scene
  let pushedAt = -1;
  // a time-lapse waits for its slide to land (2D playLapse runs after the move: the camera still, the cards in, a case card lifted) and plays only if that slide is still the one on show
  let waiting: { stop: number; run: () => void } | null = null;
  const tryRun = () => {
    const w = waiting;
    if (!w) return;
    const { stops, pos } = useUi.getState();
    if (pos.stop !== w.stop || !slideLanded() || viewAt(stops, pos).words === 'case') return;
    waiting = null; w.run();
  };
  const sync = () => {
    const { stops, pos } = useUi.getState();
    const stop = stops[pos.stop];
    if (!stop) return;
    if (pos.stop !== lastStop) { from = lastStop; lastStop = pos.stop; waiting = null; }
    if (pushedAt >= 0 && pos.stop !== pushedAt) { pushedAt = -1; reframe(); }
    const res = useStates.getState().results[deck.id];
    const i = stateIndex(stop.kind, pos.stop, ids.length);
    // until this slide's state is in, the headline numbers are the live figure's (the first slide opens at once; the others follow as the states arrive)
    const live = useEngine.getState();
    // (the readings the words print come from the live states and, where those are not yet in, the ones baked at build time: the cards gate on the same merge (CardLayer), so a line is never let in ahead of its numbers, "recurred to …", Ten years 12)
    // (the figure is on the slide once its live state is in: the labels wait for it, see figure-pending.ts)
    setFigurePending(stop.kind === 'slide' && !res?.[i]?.snap && !useStates.getState().failed[deck.id]);
    // (a press belongs to the slide it was made on; the words and the figure's callouts print the state the slide stands at now: its own, or the one a pressed control made, shown-state.ts)
    releaseVariantOff(stop.kind === 'slide' ? `${deck.id}/${ids[i]}` : null);
    const shown = withVariant(deck.id, mergeStates(deck.id, res));
    // (the figure's station labels print this state's pressures and flows while the model rests on it: scene/labels/settled.ts)
    setShownFp(stop.kind === 'slide' ? (shown?.[i]?.fp as Record<string, unknown> | undefined) : null);
    const r: Readings = readingsOf(shown?.[i]?.fp, live);
    for (const n of named) {
      const fp = shown?.[ids.indexOf(n.at)]?.fp;
      if (typeof fp?.[n.key] === 'number') r[`${n.key}@${n.at}`] = fp[n.key] as number;
      if (n.key === 'map') for (const k of ['sbp', 'dbp']) if (typeof fp?.[k] === 'number') r[`${k}@${n.at}`] = fp[k] as number;
    }
    useUi.getState().setReadings(r);
    // (every button of this slide's and the next slide's controls is worked out ahead of a press: the press is at once, and the words hold room for its readings)
    if (stop.kind === 'slide') { warmControls(deck, i); if (i + 1 < ids.length) warmControls(deck, i + 1); }
    const own = res?.[i]?.snap, cs0 = stop.kind === 'slide' ? copied.slides[i] : undefined;
    // (2D `pre`: a slide that plays its procedure, going forward, lands on the state BEFORE it; its own state, with the result, comes only from the run, or Back from the slide after)
    // (a procedure that is an engine action, a band or a tap, has no params to undo: the state before it is the slide before's, as procs-link.ts snapsOfSlide runs it)
    const morph = !!(cs0?.procedure && (specOf(procKindOf(cs0.procedure) ?? '') as { morph?: boolean } | null)?.morph);
    const before = (res?.[i]?.before as { snap?: unknown } | null | undefined)?.snap ?? (morph && i > 0 ? res?.[i - 1]?.snap : undefined);
    const snap = before && opensBefore(cs0, true, landsDone(from, pos.stop)) ? before : own;
    if (snap && snap !== morphed) {
      morphed = snap;
      const cs = cs0;
      const key = `${deck.id}/${ids[i]}`, cam = cs && stop.kind === 'slide' ? pushShotOf(cs) : null;
      if (playsLapse(cs, i) && res?.[i - 1]?.snap && !(from > pos.stop)) {
        // a time-lapse: the days play on the live figure from the slide before's state (the camera pushing slowly to where they end), then it eases to this slide's computed end;
        // Next runs what is left of the days out (ui/deck/lapse-next.ts)
        // (the figure eases to where the days start at the press, with the camera; the days themselves begin once the slide has landed)
        const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches, start = res[i - 1]!.snap, push = cam ? pushFor(cam) : null;
        readyLapse(key, cs);
        try { engine().send({ type: 'morph', snap: start, ms: MORPH_MS }); } catch { /* the engine is not up yet */ }
        waiting = { stop: pos.stop, run: () => playLapse(key, cs, start, snap, () => {}, reduce, push, true) };
        if (cam) pushedAt = pos.stop;
        tryRun();
      } else {
        stopLapse();
        if (cs?.lapse && typeof cs.days === 'number' && stop.kind === 'slide') showLapseEnd(key, cs);
        if (cam) { pushedAt = pos.stop; queueMicrotask(() => showPushEnd(cam)); }   // (after the scene's own move to the slide's framing, so the figure goes once, to where the days end)
        // A new patient blends in: the engine eases every colour and value from the old patient's to the new one's over the slide's own time (morphMsFor), nothing darkens
        // and nothing cuts (owner, 24 Nov 2026: no dim on a slide change, case card or not; the 2D app's dip under a wash is gone).
        try { engine().send({ type: 'morph', snap, ms: morphMsFor(cs) }); } catch { /* the engine is not up yet: the first slide is shown when it is */ }
      }
    }
  };
  // the slide a time-lapse's camera was left on is not the next slide's: its own framing, in the one eased move (after the scene's own, so a slide with the same shot as the one before still gets it)
  const reframe = () => queueMicrotask(() => {
    const { stops, pos, boxes } = useUi.getState();
    if (!stops[pos.stop] || boxes.free.w <= 0 || boxes.free.h <= 0) return;
    const v = viewAt(stops, pos);
    if (!v.scene || v.scene.view === 'body') sceneApi.goToSlide(v.shot, boxes.free);
  });
  sync();
  const offUi = useUi.subscribe((s, p) => { if (s.pos !== p.pos || s.stops !== p.stops) sync(); });
  const offStates = useStates.subscribe((s, p) => { if (s.results[deck.id] !== p.results[deck.id]) sync(); });
  const offVariant = useVariant.subscribe((s, p) => { if (s.state !== p.state || s.key !== p.key) sync(); });
  const offLanded = onLanded(tryRun);
  return () => { setFigurePending(false); setShownFp(null); offUi(); offStates(); offVariant(); offLanded(); waiting = null; stopLapse(); };
}
