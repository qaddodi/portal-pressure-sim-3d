// The talk tells the labels two things: which parts of the figure the slide's words point at (its `terms` field), and which catheter
// reading the slide is at. Both follow the presenter's position; nothing else here reads a deck.
import { useUi } from '../../ui/ui-store.ts';
import { viewAt, lastSlideShot, lastCath, type Stop } from '../../ui/deck/presenter-machine.ts';
import type { CathState, Slide } from '../../decks/schema.ts';
import type { CopiedSlide } from '../../decks/hp/types.ts';
import { copiedOf } from '../../decks/hp/deck.ts';
import { figurePlan } from '../../ui/deck/figure-plan.ts';
import { stationsOfTerms } from './stations.ts';
import { useLabels } from './store.ts';
import { KEY_LENSES } from './key.ts';
import { DEFAULT_LENS } from '../lenses/model.ts';

export interface LabelsAt { named: Set<string>; shown: Set<string>; tones: Record<string, string>; cath: CathState | null; /** the lens whose colour key the slide shows on the figure (null: none) */ key: string | null; /** a centred panel stands over the figure: its names stand aside */ panel?: boolean }
const NONE = (cath: CathState | null = null, key: string | null = null): LabelsAt => ({ named: new Set(), shown: new Set(), tones: {}, cath, key });

/** The colour key a slide shows on the figure (2D presenter.js paintKey): the slide's lens when it is not pressure (the default needs none), and the lens a slide with lens buttons is on, pressure
 *  included; a slide that is a table, a chart or a case card has none. */
export function keyOfSlide(slide: Slide | null, lens: string | undefined, words: string): string | null {
  if (!slide || words === 'case' || words === 'visual' || words === 'title' || words === 'check') return null;
  const own = lens ?? DEFAULT_LENS;
  const buttons = !!slide.controls?.compare?.opts.some((o) => o.how === 'lens');
  return KEY_LENSES.includes(own) && (own !== DEFAULT_LENS || buttons) ? own : null;
}

/** The copied 2D slide a played slide came from (a talk ported from 2D keeps its words in `copiedOf`). */
export const copiedSlideOf = (deckId: string | undefined, slide: Slide): CopiedSlide | undefined => (deckId ? copiedOf(deckId)?.slides.find((x) => x.id === slide.id) : undefined);

/** What the labels show at a position: the stations the slide names, and the catheter state. The case card (a beat before the slide) names
 *  nothing and shows no reading: nothing has been measured yet. The quick check keeps the result on the figure. A slide ported from 2D names what its
 *  own fields name (figure-plan.ts: the stations its `labels` and the words of its line point at, in the colours of the 2D targets). */
export function labelsAt(stops: Stop[], pos: { stop: number; beat: number }, deckId?: string): LabelsAt {
  if (!stops.length) return NONE();
  const s = stops[pos.stop];
  if (s.kind === 'check') return { ...NONE(lastCath(stops) ?? null), panel: true };
  const v = viewAt(stops, pos, lastSlideShot(stops));
  if (!v.slide || v.words === 'case') return { ...NONE(), panel: v.words === 'title' };
  const key = keyOfSlide(v.slide, v.scene?.lens, v.words), panel = v.words === 'visual';
  const copied = copiedSlideOf(deckId, v.slide);
  if (copied) {
    const p = figurePlan(copied);
    return { named: new Set(Object.keys(p.tones)), shown: new Set(p.labels), tones: p.tones, cath: v.cath, key, panel };
  }
  return { ...NONE(v.cath, key), named: namedBy(v.slide), panel };
}

/** The stations a slide names: those its words point at, and the ones a ported slide asks to label outright. */
export const namedBy = (slide: Slide): Set<string> => new Set([...stationsOfTerms(Object.values(slide.terms ?? {})), ...(slide.scene?.labels ?? [])]);

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...b].every((x) => a.has(x));
const sameTones = (a: Readonly<Record<string, string>>, b: Readonly<Record<string, string>>) => { const k = Object.keys(b); return k.length === Object.keys(a).length && k.every((x) => a[x] === b[x]); };

export function linkLabelsToDeck(): () => void {
  let owns = false;   // (the key the talk set is the talk's to take back; one the address asked for is not)
  const sync = () => {
    const { stops, pos, deck } = useUi.getState();
    // no talk, no names asked for and no catheter: the slide a talk left on (its store is kept until the next talk opens) must not hold the figure's labels back
    const next = deck ? labelsAt(stops, pos, deck.id) : NONE();
    const cur = useLabels.getState();
    const keyed = deck ? true : owns;   // (no talk: the key is left as it is unless a talk had set it)
    const sameKey = !keyed || cur.key === next.key;
    const same = cur.cath === next.cath && sameSet(cur.named, next.named) && sameSet(cur.shown, next.shown) && sameTones(cur.tones, next.tones) && sameKey && cur.panel === !!next.panel;
    if (!same) { const { key, ...rest } = next; cur.set({ ...(keyed ? { ...rest, key } : rest), panel: !!next.panel }); }
    owns = !!deck;
  };
  sync();
  return useUi.subscribe((s, p) => { if (s.pos !== p.pos || s.stops !== p.stops || s.deck !== p.deck) sync(); });
}
