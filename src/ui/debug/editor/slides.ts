// Which slides an edit touches (audit 17), and the jump list. A body slide's camera is a shot (target and half extents in the view plane, scene units); an edited part touches the slide when any
// of its reference points lies in what that shot frames (a little generous: the figure's cards and the room also show what is just outside). Lobule, sinusoid and Circuit slides frame other things.
import type { V3 } from '../../../editor/types.ts';

export interface ShotLike { target: readonly [number, number, number]; half: readonly [number, number] }
export interface SlideLike { title?: string; scene?: { view?: string; shot?: ShotLike } | null }
export interface DeckLike { id: string; title?: string; slides: readonly SlideLike[] }
export interface Touch { deck: string; deckTitle: string; slide: number; title: string }
const PAD = 1.15;

/** Does a point lie in the frame of the shot (its target and half extents, grown a little)? Judged in the plate's own x and y (a yawed shot frames about the same). */
export const inFrame = (shot: ShotLike, p: readonly [number, number, number]): boolean => Math.abs(p[0] - shot.target[0]) <= shot.half[0] * PAD && Math.abs(p[1] - shot.target[1]) <= shot.half[1] * PAD;

/** The slides of a deck whose frame holds any of `points`. `slide` is the index in the deck's slides. */
export function slidesTouching(deck: DeckLike, points: readonly V3[]): Touch[] {
  const out: Touch[] = [];
  deck.slides.forEach((s, i) => {
    const sc = s.scene, shot = sc?.shot;
    if (!shot || (sc.view && sc.view !== 'body')) return;
    if (points.some((p) => inFrame(shot, p))) out.push({ deck: deck.id, deckTitle: deck.title ?? deck.id, slide: i, title: s.title ?? `Slide ${i + 1}` });
  });
  return out;
}
/** The stop a talk opens on for a slide index (stop 0 is the outline: talk.ts startTalk). */
export const stopOf = (slide: number): number => slide + 1;
