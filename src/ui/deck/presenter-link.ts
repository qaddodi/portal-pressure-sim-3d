// The talk's side of the Presenter view (2D presenter-view.js, copied as from2d/presenter-view.js): while a talk is on show, every position it reaches is published to a second
// window (?presenter-view=<session>, presenter-window.ts), and that window's Next, Back and jump come back here. One talk, one session, so a second tab never takes this one's keys.
import { useUi } from '../ui-store.ts';
import { useShell } from '../shell/store.ts';
import { createPresenterLink as create2d } from './from2d/presenter-view.js';
import { CHECK_TITLE, CHECK_LINE } from '../../decks/check.ts';
import { OUTLINE_TITLE, outlineOf } from '../../decks/outline.ts';
import { lineText } from './handout.ts';
import { plainText } from '../text/tokens.ts';
import { slideFps, type Fp } from '../talk/slide-states.ts';
import { W } from './words.ts';
import type { Deck } from '../../decks/schema.ts';

interface Link {
  open(): boolean; end(): void; close(): void;
  publish(deck: { id: string; title: string }, slides: unknown[], i: number, beat?: number, beats?: number, sayFor?: (i: number) => (t: string) => string): void;
}
const createPresenterLink = create2d as unknown as (o: { onCmd(c: { c: 'next' | 'prev' | 'go'; i?: number }): void; onBlocked(): void }) => Link;
let link: Link | null = null;
let off: (() => void) | null = null;
let numbers: { deck: string; fps: Fp[] } | null = null;

/** What the notes window shows for each stop: the outline, each slide, the quick check (the same stops the talk plays). */
export function viewsOf(d: Deck): { kicker: string; title: string; line: string; notes: string; ask?: [string, string] | undefined }[] {
  return [
    { kicker: '', title: OUTLINE_TITLE, line: outlineOf(d).join(' · '), notes: '' },
    ...d.slides.map((s) => ({ kicker: s.kicker, title: s.title, line: s.line, notes: s.notes, ask: s.ask })),
    { kicker: '', title: CHECK_TITLE, line: CHECK_LINE, notes: d.checks.map(([q, a]) => `${q}\n${a}`).join('\n\n') },
  ];
}

/** The slide list's groups (2D toggleJump): the stops in order, a new group wherever the kicker changes, each item the stop's index. */
export function jumpGroups(views: readonly { kicker: string }[]): { k: string; items: number[] }[] {
  const groups: { k: string; items: number[] }[] = [];
  views.forEach((v, i) => { const k = v.kicker || ''; if (groups.at(-1)?.k !== k) groups.push({ k, items: [] }); groups.at(-1)!.items.push(i); });
  return groups;
}

const say = (fp: Fp | null) => (t: string) => { try { return lineText(String(t ?? ''), fp).replace(/\*\*/g, '').replace(/\s+/g, ' ').trim(); } catch { return String(t ?? ''); } };

function publish(): void {
  const { deck, stops, pos } = useUi.getState();
  if (!link) return;
  if (!deck || !stops.length) { link.end(); return; }
  const fps = numbers?.deck === deck.id ? numbers.fps : [];
  const byId = new Map(deck.slides.map((x, i) => [x.id, i]));
  const fpAt = (id: string): Fp | null => { const j = byId.get(id); return j == null ? null : fps[j] ?? null; };
  // (the notes read the model through the same braces as the slide's words, P-20; stop 0 is the outline, stop k the slide k, whose numbers are fps[k - 1])
  const views = viewsOf(deck).map((v, k) => (k >= 1 && k <= deck.slides.length ? { ...v, notes: plainText(v.notes, fps[k - 1] ?? null, fpAt) } : v));
  const beats = stops[pos.stop]?.kind === 'slide' ? (stops[pos.stop] as { beats: number }).beats : 1;
  link.publish({ id: deck.id, title: deck.title }, views, pos.stop, pos.beat, beats, (i: number) => say(fps[i - 1] ?? null));
}

function ensure(): Link {
  if (link) return link;
  link = createPresenterLink({
    onCmd: (c: { c: 'next' | 'prev' | 'go'; i?: number }) => {
      const ui = useUi.getState();
      if (c.c === 'next') ui.move('next'); else if (c.c === 'prev') ui.move('back'); else if (c.i != null) ui.go(c.i);
    },
    onBlocked: () => useShell.getState().say(W.noNotesWindow, 'bad'),
  });
  let at = useUi.getState();
  off = useUi.subscribe((s) => {
    if (s.deck !== at.deck || s.pos !== at.pos || s.stops !== at.stops) { at = s; if (s.deck && numbers?.deck !== s.deck.id) void load(s.deck); publish(); }
  });
  return link;
}

async function load(d: Deck): Promise<void> {
  const fps = await slideFps(d).catch((): Fp[] => []);
  numbers = { deck: d.id, fps };
  if (useUi.getState().deck?.id === d.id) publish();
}

/** Opens (or brings forward) the notes window. Call it inside a key press or a tap, so the browser lets it open. True when it opened. */
export function openPresenterView(): boolean {
  const l = ensure();
  const d = useUi.getState().deck;
  const opened = l.open();
  if (d) { if (numbers?.deck !== d.id) void load(d); publish(); }
  return opened;
}


