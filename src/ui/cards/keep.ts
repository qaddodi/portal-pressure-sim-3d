// Which data card stays on screen when the slide changes: 2D's card-keep.js keepData, ported (b3058ef3). A slide whose data card is the very same instrument and tiles as the one before it
// keeps that card: it stays where it is, live, and only the words card swaps. Here a card is named by its KEY, so "the same card" is "the same key": every stop gets the key of the
// slide before it when 2D would keep that card, else a key of its own. The chain is worked out from the start of the deck, so a Back lands on the same keys a Next left.
import type { Deck, Slide } from '../../decks/schema.ts';
import type { Stop } from '../deck/presenter-machine.ts';
import { copiedSlideOf } from '../../scene/labels/deck-link.ts';
import { hasToolChart, hasVisualChart } from '../../decks/charts.ts';

type F = Record<string, unknown> & { tool?: { kind?: string; range?: string; catheter?: unknown } | null };

// Fields that stop a card being kept: a time-lapse, the catheter or a live procedure driving the screen, a case card, a question card, a held question (2D OWN).
const OWN = ['visual', 'lapse', 'cath', 'monitor', 'procedure', 'vignette', 'question', 'hold'];
const cathCard = (s: F) => ['free', 'wedge', 'result'].includes(String(s.cath)) && s.tool?.kind === 'hvpg' && !!s.tool.catheter;
const readCard = (s: F) => s.tool?.kind === 'reading' && !!s.procedure;
const ownData = (s: F | null) => !s || OWN.some((k) => k !== 'lapse' && s[k] && !(k === 'cath' && cathCard(s)) && !(k === 'procedure' && readCard(s)));
type Tool = F['tool'];
const records = (t: Tool) => !!t && (t.kind === 'doppler' || t.kind === 'vitals' || (t.kind === 'trace' && t.range === 'beats'));
const drawn = (t: Tool) => !!t && (t.kind === 'flowtime' || t.kind === 'evgraph' || (t.kind === 'trace' && t.range !== 'beats'));
/** Whether the data card's instrument can ride a change of patient (it reads the live model, which eases from the old patient to the new). */
export const eases = (t: Tool) => !records(t) && !drawn(t);

const fieldsOf = (deck: Deck, slide: Slide): F => ({ ...slide, ...(copiedSlideOf(deck.id, slide) ?? {}) }) as unknown as F;

/** A slide's data card as its build reads it: the instrument and its options, the tiles, the card's title and clock. Null when the slide has none (2D dataPlan). */
export function dataPlan(s: F | null): string | null {
  if (!s || s.visual || !(s.data === 'tiles' || s.tool || s.tiles || s.table || s.ladder)) return null;
  return JSON.stringify([s.tool ?? null, s.data ?? null, s.tiles ?? null, s.table ?? null, s.ladder ?? null, s.clock ?? null, s.dataTitle ?? '', !!s.hvpgResp]);
}
/** The patient changes with this slide (it names a preset or its own parameters): 2D's `swap`. */
const swaps = (s: F) => !!(s.preset || s.params);

/** 2D keepData for a slide pair. */
export function keepData(prev: F, next: F): boolean {
  const from = dataPlan(prev), to = dataPlan(next);
  if (!from || !to || from !== to || ownData(prev) || ownData(next)) return false;
  const swap = swaps(next);
  if (next.lapse && (swap || !eases(next.tool))) return false;
  if (prev.lapse && !eases(prev.tool)) return false;
  return !swap || eases(next.tool);
}

/** What a stop's data card is: its key, its kind, and the stop whose slide the card shows (an instrument the slide has itself, or the one a slide with none carries on). */
export interface DataAt { key: string; kind: 'ladder' | 'table'; from: number }

/** The data card at every stop of a talk (null where the stop has none). A slide with an instrument of its own keeps the one before it where 2D does (keepData). Mohammad, 20 Nov: a slide with
 *  no instrument of its own does not take the card away either, unless a case, a lapse, a catheter, a procedure, a question or a change of patient needs the screen: the card stays as it was
 *  and only the words change (the 2D app clears it; the 3D app is allowed to be better). */
export function dataKeys(deck: Deck, stops: Stop[]): (DataAt | null)[] {
  const out: (DataAt | null)[] = [];
  let prev: F | null = null, held: DataAt | null = null;
  stops.forEach((st, i) => {
    if (st.kind !== 'slide') { out.push(null); prev = null; held = null; return; }
    const f = fieldsOf(deck, st.slide), s = st.slide;
    const kind = s.ladder || s.tiles || hasToolChart(s) ? 'ladder' : s.table || hasVisualChart(s) ? 'table' : null;
    if (!kind) {
      // no instrument of its own: the one on screen stays unless this slide needs the screen
      const needs = OWN.some((k) => f[k]) || swaps(f);
      if (held && !needs) { out.push(held); return; }
      out.push(null); prev = null; held = null; return;
    }
    const kept = prev && held && keepData(prev, f) ? held : null;
    const at: DataAt = kept ? { ...kept, from: i } : { key: kind === 'table' ? `table:${s.id}` : hasToolChart(s) ? `tool:${s.id}` : 'ladder', kind, from: i };
    out.push(at); prev = f; held = at;
  });
  return out;
}
