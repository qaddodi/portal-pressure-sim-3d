// The presenter's position in a deck, and what is on screen at each position. Pure: the Presenter component only calls these.
//
// A deck plays as stops: the title, each slide, the quick check. A slide with a case (`vignette`) has two beats: the case card first
// (on its own, the learner reads it), then the slide's words and data. Next and Back walk the beats, so Back from the first beat of a
// slide lands on the last beat of the slide before.

import type { Deck, Slide, ShotName, CathState, SlideScene } from '../../decks/schema.ts';
import type { Shot } from '../../scene/camera/shots.ts';
import type { CardId } from '../layout/plan.ts';
import { TITLE_SHOT } from '../../decks/hvpg.ts';

export type Stop =
  | { kind: 'title' }
  | { kind: 'slide'; slide: Slide; beats: number }
  | { kind: 'check' };

export interface Pos { stop: number; beat: number }

export function stopsOf(deck: Deck): Stop[] {
  return [
    { kind: 'title' },
    ...deck.slides.map((slide): Stop => ({ kind: 'slide', slide, beats: slide.vignette ? 2 : 1 })),
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

export function back(stops: Stop[], p: Pos): Pos {
  if (p.beat > 0) return { stop: p.stop, beat: p.beat - 1 };
  if (p.stop === 0) return p;
  return { stop: p.stop - 1, beat: beatsOf(stops[p.stop - 1]) - 1 };
}

/** Jump to the start of a stop (the progress dots). */
export const goto = (stops: Stop[], stop: number): Pos => ({ stop: Math.max(0, Math.min(stops.length - 1, stop | 0)), beat: 0 });

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

export function viewAt(stops: Stop[], p: Pos, lastShot: ShotName | Shot = lastSlideShot(stops)): View {
  const s = stops[p.stop];
  const of = stops.length, number = p.stop + 1;
  const lastScene = s.kind === 'check' ? lastSlideScene(stops) : null;
  if (s.kind === 'title') return { words: 'title', data: null, slide: null, shot: TITLE_SHOT, scene: null, cath: null, number, of };
  if (s.kind === 'check') return { words: 'check', data: null, slide: null, shot: lastScene ? lastScene.shot : lastShot, scene: lastScene, cath: null, number, of };
  const caseBeat = s.slide.vignette && p.beat === 0;
  return {
    words: caseBeat ? 'case' : 'teach',
    data: !caseBeat && (s.slide.ladder || s.slide.tiles) ? 'ladder' : null,
    slide: s.slide, shot: s.slide.scene ? s.slide.scene.shot : s.slide.shot ?? TITLE_SHOT, scene: s.slide.scene ?? null, cath: s.slide.cath ?? null, number, of,
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

/** How far the catheter is advanced along its route and how far its balloon is up at a position, each 0 to 1 (the scene draws; the presenter tweens).
 *  The case beat has no catheter yet; the route slide's words bring it in; the wedge slide inflates the balloon; the result keeps both, and the quick
 *  check leaves the figure as the result left it. */
export function catheterAt(stops: Stop[], p: Pos): { advance: number; balloon: number } {
  const s = stops[p.stop];
  if (s.kind === 'title') return { advance: 0, balloon: 0 };
  if (s.kind === 'check') return catheterOf(lastCath(stops));
  if (s.slide.vignette && p.beat === 0) return { advance: 0, balloon: 0 };
  return catheterOf(s.slide.cath);
}
const catheterOf = (c: CathState | undefined | null): { advance: number; balloon: number } =>
  c === 'route' || c === 'free' ? { advance: 1, balloon: 0 } : c === 'wedge' || c === 'result' ? { advance: 1, balloon: 1 } : { advance: 0, balloon: 0 };

/** The catheter state the last slide with one asked for: the quick check leaves the figure as that slide left it (none when no slide has a catheter). */
export const lastCath = (stops: Stop[]): CathState | undefined => {
  for (let i = stops.length - 1; i >= 0; i--) { const s = stops[i]; if (s.kind === 'slide' && s.slide.cath) return s.slide.cath; }
  return undefined;
};
