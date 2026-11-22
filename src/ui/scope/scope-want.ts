// Which slide of which deck wants the scope ring on the varices: 2D's one rule (scope-lens-rule.js scopeLensFor, copied as it is), asked of the slide on show, in every deck. A slide ported from 2D
// is asked as the copied 2D slide (its own `cam`, `labels`, `calipers`, `mark`, `scopeLens`, `tool`, `visual`, `table`, `lapse`, `ramp`, `days`); a slide written for 3D is asked as the same fields it has
// (its shot's name, its scene's labels, its table, its tool). The case card before a slide and a title or check stop name no varices, so they have no ring. Pure `wantOf`; `linkScopeWant` keeps the store.
import { create } from 'zustand';
import { useUi } from '../ui-store.ts';
import { viewAt, type Stop } from '../deck/presenter-machine.ts';
import { copiedSlideOf } from '../../scene/labels/deck-link.ts';
import { scopeLensFor, scopeGrows } from '../../scene/disease/copied/scope-lens-rule.js';
import { procPlanOf } from '../deck/procs-plan.ts';
import type { Slide } from '../../decks/schema.ts';

export interface ScopeWant { /** the slide's key (deck, slide): a new one shuts a lens left open */ key: string; want: boolean; /** the varices grow as it plays: the ring stands from its first frame */ grows: boolean; /** the lens opens by itself once the ring stands and the camera has held still (the EVL slides: the bands are shown through it) */ auto: boolean }
const NONE: ScopeWant = { key: '', want: false, grows: false, auto: false };

/** Slides whose procedure the scope view shows by itself (no tap): the EVL slides (owner, 22 Nov 2026: "with a view of the scope"). */
export const AUTO_LENS_KINDS: ReadonlySet<string> = new Set(['evl']);

/** The fields the 2D rule reads, from a slide that was not ported from 2D. */
export function ruleFieldsOf(slide: Slide): Record<string, unknown> {
  return { visual: slide.visual, table: slide.table, tool: slide.tool, cam: slide.shot, labels: slide.scene?.labels ?? [], lapse: slide.lapse };
}

/** What the position asks of the ring. */
export function wantOf(stops: Stop[], pos: { stop: number; beat: number }, deckId: string | undefined): ScopeWant {
  const stop = stops[pos.stop];
  if (!stop || stop.kind !== 'slide') return NONE;
  const v = viewAt(stops, pos);
  if (!v.slide || v.words === 'case') return NONE;
  const copied = copiedSlideOf(deckId, v.slide);
  const s = (copied ?? ruleFieldsOf(v.slide)) as Parameters<typeof scopeLensFor>[0];
  const want = !!scopeLensFor(s);
  const kind = procPlanOf(s as { procedure?: unknown })?.kind, auto = want && !!kind && AUTO_LENS_KINDS.has(kind);
  // (an EVL slide lands on the state before its banding, so the varices are there and the ring stands; an open lens keeps it after the bands: scope-gate.ts)
  return { key: `${deckId}/${v.slide.id}`, want, grows: want && !!scopeGrows(s), auto };
}

export const useScopeWant = create<ScopeWant>(() => NONE);

/** The store follows the talk. Returns the remover (it leaves the store empty). */
export function linkScopeWant(): () => void {
  const sync = () => {
    const { stops, pos, deck } = useUi.getState();
    const w = deck ? wantOf(stops, pos, deck.id) : NONE, c = useScopeWant.getState();
    if (w.key !== c.key || w.want !== c.want || w.grows !== c.grows || w.auto !== c.auto) useScopeWant.setState(w);
  };
  sync();
  const off = useUi.subscribe((s, p) => { if (s.pos !== p.pos || s.stops !== p.stops || s.deck !== p.deck) sync(); });
  return () => { off(); useScopeWant.setState(NONE); };
}
