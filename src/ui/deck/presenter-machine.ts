// The presenter's position in a deck, and what is on screen at each position. Pure: the Presenter component only calls these.
//
// A deck plays as stops: the title, each slide, the quick check. A slide with a case (`vignette`) has two beats: the case card first
// (on its own, the learner reads it), then the slide's words and data. Next and Back walk the beats, so Back from the first beat of a
// slide lands on the last beat of the slide before.

import { caseOf, type Deck, type Slide, type ShotName, type CathState, type SlideScene } from '../../decks/schema.ts';
import type { Shot } from '../../scene/camera/shots.ts';
import type { CardId } from '../layout/plan.ts';
import { TITLE_SHOT } from '../../decks/hvpg.ts';
import { OSTIUM_U } from '../../scene/procedures/ostium.ts';
import { hasToolChart, hasVisualChart } from '../../decks/charts.ts';

export type Stop =
  | { kind: 'title' }
  | { kind: 'slide'; slide: Slide; beats: number }
  | { kind: 'check' };

export interface Pos { stop: number; beat: number }

export function stopsOf(deck: Deck): Stop[] {
  return [
    { kind: 'title' },
    ...deck.slides.map((slide): Stop => ({ kind: 'slide', slide, beats: (caseOf(slide) ? 1 : 0) + 1 + (slide.beats?.length ?? 0) })),
    { kind: 'check' },
  ];
}

const beatsOf = (s: Stop) => (s.kind === 'slide' ? s.beats : 1);

export const first = (): Pos => ({ stop: 0, beat: 0 });
export const last = (stops: Stop[]): Pos => ({ stop: stops.length - 1, beat: beatsOf(stops[stops.length - 1]) - 1 });

export function next(stops: Stop[], p: Pos): Pos {
  if (p.beat + 1 < beatsOf(stops[p.stop])) return { stop: p.stop, beat: p.beat + 1 };
  return p.stop + 1 < stops.length ? { stop: p.stop + 1, beat: 0 } : p;
}

/** A slide that opens on a case card (2D `vignette`; a question is the other kind of first card, and keeps its own way). */
const hasCase = (s: Stop | undefined): boolean => s?.kind === 'slide' && caseOf(s.slide)?.kicker === 'Case';

/** Back. The case card shows only going forward (2D presenter.js `to > lastAt`): Back from the slide it opens goes on to the slide before, never onto the card again. */
export function back(stops: Stop[], p: Pos): Pos {
  if (p.beat > 0 && !(p.beat === 1 && hasCase(stops[p.stop]))) return { stop: p.stop, beat: p.beat - 1 };
  if (p.stop === 0) return p;
  return { stop: p.stop - 1, beat: beatsOf(stops[p.stop - 1]) - 1 };
}

/** Jump to the start of a stop (the progress dots). */
/** Lands on a stop from outside the walk (the outline, a link, opening the deck at a slide). A slide that is only a question (2D `question`, no case or procedure with it) is asked
 *  when the talk walks up to it with Next, so a jump skips its card and lands on the slide itself, as 2D does; Back from there still reaches the card. */
export const goto = (stops: Stop[], stop: number, o: { case?: boolean } = {}): Pos => {
  const at = Math.max(0, Math.min(stops.length - 1, stop | 0)), s = stops[at];
  // (a case card is met only going forward: a start, a resume, a link and a jump back land on the slide itself, as 2D's start (`noCase`) and `to > lastAt` do; a jump forward still meets it)
  if (s?.kind === 'slide' && hasCase(s) && s.beats > 1) return { stop: at, beat: o.case ? 0 : 1 };
  // (a slide with beats is opened on its last view, so it stands with its whole point made: 2D slide-beats.js)
  const ends = s?.kind === 'slide' && !caseOf(s.slide) && (s.slide.beats?.length ?? 0) > 0;
  return { stop: at, beat: s?.kind === 'slide' && s.beats > 1 && caseOf(s.slide)?.kicker === 'Question' ? 1 : ends ? s.beats - 1 : 0 };
};

export const samePos = (a: Pos, b: Pos) => a.stop === b.stop && a.beat === b.beat;
export const isFirst = (p: Pos) => p.stop === 0 && p.beat === 0;
export const isLast = (stops: Stop[], p: Pos) => samePos(p, last(stops));

/** What is on screen at a position. */
export interface View {
  words: CardId;
  data: CardId | null;
  slide: Slide | null;
  /** A named shot of the slice, or the slide's own `scene` shot (a ported deck's camera). */
  shot: ShotName | Shot;
  scene: SlideScene | null;
  cath: CathState | null;
  /** 1-based stop number and the count, for the progress bar. */
  number: number; of: number;
}

const dataOf = (s: Slide): CardId | null => (s.ladder || s.tiles || hasToolChart(s) ? 'ladder' : s.table || hasVisualChart(s) ? 'table' : null);

export function viewAt(stops: Stop[], p: Pos, lastShot: ShotName | Shot = lastSlideShot(stops)): View {
  const s = stops[p.stop];
  const of = stops.length, number = p.stop + 1;
  const lastScene = s.kind === 'check' ? lastSlideScene(stops) : null;
  if (s.kind === 'title') return { words: 'title', data: null, slide: null, shot: TITLE_SHOT, scene: null, cath: null, number, of };
  if (s.kind === 'check') return { words: 'check', data: null, slide: null, shot: lastScene ? lastScene.shot : lastShot, scene: lastScene, cath: null, number, of };
  const caseBeat = !!caseOf(s.slide) && p.beat === 0;
  // the figure's views after the slide's own (2D `beats`): one per Next, the words and the data staying; a beat past the case beat is the slide itself (0) or one of its beats
  const view = Math.max(0, p.beat - (caseOf(s.slide) ? 1 : 0)), beat = view > 0 ? s.slide.beats?.[view - 1] : undefined;
  if (beat) return { words: 'teach', data: dataOf(s.slide), slide: s.slide, shot: beat.shot, scene: beat, cath: s.slide.cath ?? null, number, of };
  // a slide whose card is a summary table or a chart is 2D's one centred panel (title, line, then the table or chart in it): no words card and no data card beside it
  const panel = !caseBeat && dataOf(s.slide) === 'table';
  return {
    words: caseBeat ? 'case' : panel ? 'visual' : 'teach',
    data: caseBeat || panel ? null : dataOf(s.slide),
    // (2D: behind a case card the camera backs out to the whole patient; the slide's own framing comes when the card is lifted)
    slide: s.slide, shot: s.slide.scene ? s.slide.scene.shot : s.slide.shot ?? TITLE_SHOT,   // (a case beat keeps the slide's own framing: one shot, no back-out to the whole patient and in again; owner 20 Nov)
    scene: s.slide.scene ?? null, cath: s.slide.cath ?? null, number, of,
  };
}

/** The shot the quick check keeps: the last slide's. */
export const lastSlideShot = (stops: Stop[]): ShotName => {
  for (let i = stops.length - 1; i >= 0; i--) { const s = stops[i]; if (s.kind === 'slide') return s.slide.shot ?? TITLE_SHOT; }
  return TITLE_SHOT;
};

/** The scene the quick check keeps when the last slide carries one (a ported deck). */
export const lastSlideScene = (stops: Stop[]): SlideScene | null => {
  for (let i = stops.length - 1; i >= 0; i--) { const s = stops[i]; if (s.kind === 'slide') return s.slide.scene ?? null; }
  return null;
};

// ── Input ──
export type Move = 'next' | 'back' | 'first' | 'last';

/** The keys that move through a deck (a text field or a button that uses the key keeps it: the caller checks the target). */
export function keyMove(key: string, shift = false): Move | null {
  switch (key) {
    case 'ArrowRight': case 'ArrowDown': case 'PageDown': case 'n': case 'N': return 'next';
    case ' ': return shift ? 'back' : 'next';
    case 'ArrowLeft': case 'ArrowUp': case 'PageUp': case 'p': case 'P': return 'back';
    case 'Home': return 'first';
    case 'End': return 'last';
    default: return null;
  }
}

/** A sideways swipe on the figure: left goes on, right goes back; it has to be mostly sideways and far or fast enough. */
export function swipeMove(dx: number, dy: number, ms: number): Move | null {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (ax < ay * 1.6) return null;
  const far = ax >= 56, fast = ax >= 24 && ms > 0 && ax / ms >= 0.5;
  if (!far && !fast) return null;
  return dx < 0 ? 'next' : 'back';
}

export function apply(stops: Stop[], p: Pos, m: Move): Pos {
  return m === 'next' ? next(stops, p) : m === 'back' ? back(stops, p) : m === 'first' ? first() : last(stops);
}

/** The catheter state on show at a position (null: none out). The case beat has no catheter yet; the route slide's words bring it in; the quick check leaves the figure as the last slide with a catheter left it.
 *  scene-link.ts runs the catheter's one clock (cath-clock.ts) to the place on the HVPG script this names. */
export function cathPlace(stops: Stop[], p: Pos): CathState | null {
  const s = stops[p.stop];
  if (s.kind === 'title') return null;
  if (s.kind === 'check') return lastCath(stops) ?? null;
  if (caseOf(s.slide) && p.beat === 0) return null;
  return s.slide.cath ?? null;
}

/** How far the catheter is advanced along its route and how far its balloon is up at a position, each 0 to 1 (where the clock lands at that position: cath-clock.ts poseAt of the place's time).
 *  The case beat has no catheter yet; the route slide's words bring it in; the wedge slide inflates the balloon; the result keeps both, and the quick
 *  check leaves the figure as the result left it. */
export function catheterAt(stops: Stop[], p: Pos): { advance: number; balloon: number } {
  return catheterOf(cathPlace(stops, p));
}
const catheterOf = (c: CathState | undefined | null): { advance: number; balloon: number } =>
  c === 'route' || c === 'free' ? { advance: 1, balloon: 0 } : c === 'wedge' || c === 'result' ? { advance: 1, balloon: 1 } : c === 'blocked' ? { advance: OSTIUM_U, balloon: 0 } : { advance: 0, balloon: 0 };

/** The catheter state the last slide with one asked for: the quick check leaves the figure as that slide left it (none when no slide has a catheter). */
export const lastCath = (stops: Stop[]): CathState | undefined => {
  for (let i = stops.length - 1; i >= 0; i--) { const s = stops[i]; if (s.kind === 'slide' && s.slide.cath) return s.slide.cath; }
  return undefined;
};
