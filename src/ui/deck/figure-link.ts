// The talk draws what the slide's own fields ask of the figure: the stations its words light (in their colours), the vessels it names (one after another for a glowSeq), the organs it
// outlines, a spotlight, the cards of its marks, sites, steps and calipers, the Circuit's brackets (`span`), the Circuit's resistors, and the colours of a `since` lens counted from another slide's state. It reads the
// copied 2D slide (copiedOf), works out its plan (figure-plan.ts) and the scene's calls (figure-calls.ts), and applies them; a slide change starts from nothing, so what the slide before
// lit never stays. The shot, the lens and the catheter are scene-link.ts's; the station names' own placing is the labels'. Nothing here runs per frame but the glow sequence's clock system.
import { sceneApi } from '../../scene/api.ts';
import { clock } from '../../clock/frame.ts';
import { nodePressure, edgeIndex } from '../../decks/hp/figure-engine.ts';
import { useUi } from '../ui-store.ts';
import { viewAt } from './presenter-machine.ts';
import { useFigure } from '../../scene/labels/store.ts';
import { copiedSlideOf } from '../../scene/labels/deck-link.ts';
import { useStates } from '../../decks/hp/calc.ts';
import { copiedOf } from '../../decks/hp/deck.ts';
import { figurePlan } from './figure-plan.ts';
import { figureCalls, EMPTY_CALLS, type FigureCalls, type Fp, type Reads } from './figure-calls.ts';


/** The scene's own entry for a lens counted from another state; the lenses batch adds it (`setSinceRef`), so until then a slide with this lens is asked for nothing here. */
type SinceApi = { setSinceRef?: (P: ArrayLike<number> | null) => void };
const setSince = (P: ArrayLike<number> | null) => (sceneApi as unknown as SinceApi).setSinceRef?.(P);

/** The node pressures a `since` slide counts from: the named slide's state, the lapse's own start, or the slide before's (hp/calc.ts keeps each slide's state; a slide with none is the one before's). */
export function sinceP(deckId: string, index: number, plan: ReturnType<typeof figurePlan>): ArrayLike<number> | null {
  if (!plan.since) return null;
  const results = useStates.getState().results[deckId] ?? [];
  const copied = copiedOf(deckId);
  const at = (i: number) => (results[i]?.fp as Fp | undefined)?.at?.P ?? null;
  if (plan.since.from === 'lapse') return ((results[index]?.start as { fp?: Fp } | undefined)?.fp?.at?.P) ?? null;
  if (plan.since.from === 'previous') return index > 0 ? at(index - 1) : null;
  const j = copied?.slides.findIndex((s) => s.id === plan.since!.from) ?? -1;
  return j >= 0 ? at(j) : null;
}

/** The numbers a slide's cards read: its state's fingerprint and parameters once they are in, the live model until then. */
function readsOf(deckId: string, index: number): Reads {
  const r = useStates.getState().results[deckId]?.[index];
  return {
    fp: (r?.fp as Fp | undefined) ?? null, params: (r?.params as Reads['params']) ?? null,
    pressure: nodePressure,
    indexOf: edgeIndex,
  };
}

export function linkFigure(): () => void {
  let key = '';
  let t0 = 0;
  let seq: { named: FigureCalls['named']; shown: number; hold: { release(): void } | null } = { named: [], shown: -1, hold: null };
  let sinceOn = false;

  const stopSeq = () => { seq.hold?.release(); seq = { named: [], shown: -1, hold: null }; };
  const offClock = clock.on('tween', () => {
    if (!seq.named.length) return;
    const el = performance.now() - t0, n = seq.named.filter((g) => g.at <= el).length;
    if (n !== seq.shown) { seq.shown = n; sceneApi.setNamedVessels(seq.named.filter((g) => g.at <= el).map((g) => g.id)); }
    if (n === seq.named.length && seq.hold) { seq.hold.release(); seq.hold = null; }
  }, 0);

  const apply = (c: FigureCalls) => {
    stopSeq();
    // the vessels named: all at once, or in the glow's order (glowSeq: the pressure passing back from the heart), one step after another
    const late = c.named.some((g) => g.at > 0);
    if (late) { seq = { named: c.named, shown: -1, hold: clock.hold('figure-glow-seq') }; clock.invalidate('figure-glow-seq'); } else sceneApi.setNamedVessels(c.named.map((g) => g.id));
    sceneApi.markVessels(c.marked);
    sceneApi.pinOrgans(c.pins, c.normalSpleen);
    sceneApi.setResistors(c.res);
    sceneApi.setCaudatePin(c.caudate);
    t0 = performance.now();
    useFigure.getState().set({ cards: c.cards, calipers: c.calipers, spans: c.spans, t0 });
  };

  const sync = () => {
    const { stops, pos, deck } = useUi.getState();
    let calls: FigureCalls = EMPTY_CALLS, since: ArrayLike<number> | null = null, next = '';
    const stop = stops[pos.stop];
    if (deck && stop?.kind === 'slide') {
      const v = viewAt(stops, pos);
      const copied = v.slide && v.words !== 'case' ? copiedSlideOf(deck.id, v.slide) : undefined;
      if (copied) {
        const index = copiedOf(deck.id)!.slides.indexOf(copied);
        const plan = figurePlan(copied);
        const reads = readsOf(deck.id, index);
        calls = figureCalls(plan, reads);
        since = sinceP(deck.id, index, plan);
        // one signature for what the slide asks and the numbers its cards print: a repeat of either changes nothing
        next = `${deck.id}/${copied.id}|${JSON.stringify(calls)}|${since ? since.length : ''}`;
      }
    }
    if (next === key) return;
    const sameSlide = key.split('|')[0] === next.split('|')[0] && !!next;
    key = next;
    if (sameSlide) {
      // the numbers arrived (the slide's state came in): only the cards' words change, never what is lit
      useFigure.getState().set({ cards: calls.cards, calipers: calls.calipers, spans: calls.spans });
    } else apply(calls);
    if (since) { setSince(since); sinceOn = true; } else if (sinceOn) { setSince(null); sinceOn = false; }
  };

  sync();
  const off = useUi.subscribe((s, p) => { if (s.pos !== p.pos || s.stops !== p.stops || s.deck !== p.deck) sync(); });
  const offStates = useStates.subscribe(() => sync());
  return () => { off(); offStates(); offClock(); stopSeq(); if (sinceOn) setSince(null); apply(EMPTY_CALLS); };
}
