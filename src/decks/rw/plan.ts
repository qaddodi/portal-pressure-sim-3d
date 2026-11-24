// A 2D deck as the 3D app plays it: the words (copied, never retyped), the camera shot of every slide (cams.ts), the hooks it needs from other batches (hooks.ts), and its
// model chain (numbers.ts). Everything 3D here is DERIVED from the copied slide, so a change in the 2D deck changes the 3D one with it and nothing is typed twice.
// Deck-agnostic: `buildDeck` takes any copied 2D deck; the R-to-W loaders are in ./copied/index.ts.
import { SHOTS, type Shot } from '../../scene/camera/shots.ts';
import { place, type Cam2D, type Placed } from './cams.ts';
import { hooksOf, missingHooks, hasHook, type Hook } from './hooks.ts';
import { parseWords, type Piece } from './numbers.ts';
import type { CopiedDeck, CopiedSlide } from './types.ts';

/** The words a slide carries, as the 2D deck has them (absent where the slide has none). */
export interface Words {
  kicker: string; title: string; line: string | null; notes: string; ask: [string, string];
  vignette: string | null; caseQ: string | null; caveat: string | null; cite: string | null;
  /** The line with its {tokens} cut into pieces: values, cut-offs, terms, step markers. */
  pieces: Piece[];
}

export interface RwSlide {
  id: string;
  /** 0-based position among the deck's own slides (the outline is not one of them). */
  index: number;
  /** The slide's number as the presenter counts it: the outline is slide 1, so the first deck slide is 2. */
  number: number;
  words: Words;
  placed: Placed;
  /** The name this slide's camera shot is registered under (SHOTS), for the scene's `goTo`. A lobule or sinusoid slide has the scale view's shot. */
  shot: string;
  hooks: Hook[];
  /** The 2D slide, whole (every other field: tiles, tool, compare, lens …), for the batches that carry it out. */
  copied: CopiedSlide;
}

export interface RwDeck {
  id: string; title: string; level: string; minutes: number; summary: string; objectives: string[];
  /** The quick check: question and answer, each as pieces ({ppg@clot} reads another slide's number). */
  checks: { q: Piece[]; a: Piece[] }[];
  slides: RwSlide[];
  copied: CopiedDeck;
}

/** Words of a 2D deck that 3D states otherwise, each keyed by the exact 2D text. A test fails when the 2D text changes (so the entry is reviewed and dropped), and nothing else is retyped here.
 *  21 Nov (owner's rule: Baveno VIII only): the NSBB response is a fall of ≥10% or to ≤12 mmHg (Baveno VIII Table 3, as the Next-bleed deck says it); 2D's check read ">10% and to <12". */
export const WORD_FIXES: Record<string, string> = {
};
const said = (t: string): string => WORD_FIXES[t] ?? t;

export const shotName = (deckId: string, slideId: string): string => `rw:${deckId}/${slideId}`;

const str = (v: unknown): string | null => (typeof v === 'string' && v ? v : null);

export function buildDeck(c: CopiedDeck): RwDeck {
  const slides = c.slides.map((s, index): RwSlide => {
    const ask = s.ask as [string, string] | undefined;
    const line = str(s.line);
    return {
      id: s.id, index, number: index + 2,
      words: {
        kicker: String(s.kicker ?? ''), title: String(s.title ?? ''), line, notes: String(s.notes ?? ''), ask: ask ?? ['', ''],
        vignette: str(s.vignette), caseQ: str(s.caseQ), caveat: str(s.caveat), cite: str(s.cite),
        pieces: line ? parseWords(line) : [],
      },
      placed: place(s.cam as Cam2D, s.view),
      shot: shotName(c.id, s.id),
      hooks: hooksOf(s),
      copied: s,
    };
  });
  return {
    id: c.id, title: c.title, level: c.level, minutes: c.minutes, summary: c.summary, objectives: c.objectives,
    checks: c.checks.map(([q, a]) => ({ q: parseWords(said(q)), a: parseWords(said(a)) })),
    slides, copied: c,
  };
}

/** The shot a slide plays: its camera's, as placed (a lobule or sinusoid slide's is that scale view's). */
export function shotOf(s: RwSlide): Shot {
  const p = s.placed;
  if (p.view === 'circuit') return SHOTS.play;   // (the Circuit view frames its own regions: B7 reads `placed.region` / `placed.box`)
  return p.shot;
}

/** Puts a deck's shots into the scene's table, under their `rw:<deck>/<slide>` names, so the presenter asks for a slide's camera by name like the HVPG slice does.
 *  Idempotent; the table is the scene's own (camera/shots.ts SHOTS, a plain object read by name at each move). */
export function registerShots(d: RwDeck): void {
  const table = SHOTS as Record<string, Shot>;
  for (const s of d.slides) table[s.shot] = shotOf(s);
}

/** The slides of a deck that still lack a feature, with what they lack: the dependency list the parity page and the tests print. */
export function dependencies(d: RwDeck, has: (id: string) => boolean = hasHook): { slide: string; missing: Hook[] }[] {
  return d.slides.map((s) => ({ slide: s.id, missing: missingHooks(s.hooks, has) }));
}

/** Decks whose every slide has every feature it needs: only these may be offered by the menu. */
export function playable(decks: readonly RwDeck[], has: (id: string) => boolean = hasHook): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of decks) if (dependencies(d, has).every((x) => !x.missing.length)) out[d.id] = d.slides.length + 2;   // (the outline and the quick check come with them)
  return out;
}
