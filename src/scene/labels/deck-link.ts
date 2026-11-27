// The talk tells the labels two things: which parts of the figure the slide's words point at (its `terms` field), and which catheter
// reading the slide is at. Both follow the presenter's position; nothing else here reads a deck.
import { useUi } from '../../ui/ui-store.ts';
import { viewAt, lastSlideShot, lastCath, type Stop } from '../../ui/deck/presenter-machine.ts';
import type { CathState, Slide, SlideScene } from '../../decks/schema.ts';
import type { CopiedSlide } from '../../decks/hp/types.ts';
import { copiedOf } from '../../decks/hp/deck.ts';
import { figurePlan } from '../../ui/deck/figure-plan.ts';
import { stationsOfTerms } from './stations.ts';
import { useLabels } from './store.ts';
import { KEY_LENSES, keyPlace } from './key.ts';
import { DEFAULT_LENS, type LensId } from '../lenses/model.ts';
import { shownLens } from '../lenses/in-view.ts';

export interface LabelsAt { named: Set<string>; shown: Set<string>; tones: Record<string, string>; cath: CathState | null; /** the lens whose colour key the slide shows on the figure (null: none) */ key: string | null; /** a centred panel stands over the figure: its names stand aside */ panel?: boolean; /** the names the slide's own buttons carry, lower case (the key does not say them again, key.ts keyNameShown) */ controls?: readonly string[] }
const NONE = (cath: CathState | null = null, key: string | null = null): LabelsAt => ({ named: new Set(), shown: new Set(), tones: {}, cath, key });

/** The colour key a slide shows on the figure (Mohammad, 26 Nov: "every slide that colours the figure", captures 36b7deac and 2274649a).
 *  The rule is the figure's, not the slide's controls: a figure on screen is always drawn in some lens, Pressure included (the default colours the vessels
 *  pink to blue on every patient), so its key shows on every slide that draws it, named after the lens the VIEW draws (lenses/in-view.ts shownLens: a lens a
 *  view cannot show falls back to Pressure, and so does the key). Only a slide with no figure behind its words has none: a title, a case card, a centred
 *  panel (table or chart), the quick check; and a lens with no key (Anatomy). The earlier rule (pressure only with lens buttons or a profile) let
 *  Encephalopathy 11, Albumin 3 and Budd-Chiari 2 wear pressure colours with no key. */
export function keyOfSlide(slide: Slide | null, lens: string | undefined, words: string, view?: SlideScene['view']): string | null {
  if (!slide || words === 'case' || words === 'visual' || words === 'title' || words === 'check') return null;
  const asked = (lens ?? DEFAULT_LENS) as LensId;
  const drawn = view ? shownLens(view === 'body' ? 'anatomic' : view, asked) : asked;
  return KEY_LENSES.includes(drawn) ? drawn : null;
}

/** The key's lens at a stop: every slide whose figure a lens colours shows its key (Mohammad, 26 Nov: "every slide that colours the figure"; this replaces the
 *  22 Nov rule that a run of slides on one lens named it once, on the first). Null where no figure stands behind the words: a title, a table or chart panel,
 *  a case card, the quick check, or a lens with no key. */
export function keyAtStop(stops: Stop[], i: number, beat = 0): string | null {
  const s = stops[i];
  if (!s || s.kind !== 'slide') return null;
  const v = viewAt(stops, { stop: i, beat }, lastSlideShot(stops));
  return keyOfSlide(v.slide, v.scene?.lens, v.words, v.scene?.view);
}
/** The lens whose key is the first row of the slide's own data card (the stream lenses: key.ts keyPlace). The card keeps its key as long as it stands, so ask with the stop the card came from (keep.ts `from`). */
export function cardKeyAt(stops: Stop[], i: number, live: string | null = null): string | null {
  const s = stops[i], k = s && s.kind === 'slide' ? keyAtStop(stops, i, s.slide.vignette || s.slide.question ? 1 : 0) : null;
  const buttons = !!s && s.kind === 'slide' && !!s.slide.controls?.compare?.opts.some((o) => o.how === 'lens');
  return cardKeyFollows(k, buttons, live);
}
/** The data card's key row (pure). A slide with lens buttons whose press has put another lens on the figure (the labels' key, set by pickCompare: one whose key stands on the figure's dock, never a card's): the row was the
 *  key of the slide's own lens and no longer says what the figure wears (Two inflows 3, Oxygen pressed: "Origin" over the oxygen colours, capture 84496815). It goes, and the dock carries the new lens's key.
 *  The key follows the slide on every move (linkLabelsToDeck), so `live` is the slide's own key until a button is pressed. */
export function cardKeyFollows(k: string | null, buttons: boolean, live: string | null): string | null {
  if (!k || keyPlace(k) !== 'card') return null;
  return buttons && live && keyPlace(live) === 'dock' ? null : k;
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
  const k = keyAtStop(stops, pos.stop, pos.beat), key = k && keyPlace(k) === 'dock' ? k : null, panel = v.words === 'visual';   // (a stream lens's key stands in its data card instead: cardKeyAt)
  const copied = copiedSlideOf(deckId, v.slide), controls = controlNamesOf(v.slide);
  if (copied) {
    const p = figurePlan(copied);
    return { named: new Set(Object.keys(p.tones)), shown: new Set(p.labels), tones: p.tones, cath: v.cath, key, panel, controls };
  }
  return { ...NONE(v.cath, key), named: namedBy(v.slide), panel, controls };
}

/** The names a slide's compare buttons carry, lower case (their short forms too). */
export const controlNamesOf = (slide: Slide): string[] => (slide.controls?.compare?.opts ?? []).flatMap((o) => [o.label, o.short ?? '']).map((t) => t.trim().toLowerCase()).filter(Boolean);

/** The stations a slide names: those its words point at, and the ones a ported slide asks to label outright. */
export const namedBy = (slide: Slide): Set<string> => new Set([...stationsOfTerms(Object.values(slide.terms ?? {})), ...(slide.scene?.labels ?? [])]);

const sameSet = (a: ReadonlySet<string>, b: ReadonlySet<string>) => a.size === b.size && [...b].every((x) => a.has(x));
const sameNames = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
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
    const same = cur.presenting === !!deck && cur.cath === next.cath && sameSet(cur.named, next.named) && sameSet(cur.shown, next.shown) && sameTones(cur.tones, next.tones) && sameKey && cur.panel === !!next.panel && sameNames(cur.controls, next.controls ?? []);
    if (!same) { const { key, ...rest } = next; cur.set({ ...(keyed ? { ...rest, key } : rest), controls: next.controls ?? [], panel: !!next.panel, presenting: !!deck }); }
    owns = !!deck;
  };
  sync();
  return useUi.subscribe((s, p) => { if (s.pos !== p.pos || s.stops !== p.stops || s.deck !== p.deck) sync(); });
}
