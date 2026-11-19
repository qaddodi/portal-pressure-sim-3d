// The card's height glide (2D card-glide.js, copied: card-glide.copied.ts) with its types: the copy is plain JavaScript and its option lists infer as empty.
// A card that stands on its foot (a sheet over the dock, a phone's vessel card) passes `foot`; `ride`, `cut` and `free` name the parts of a sheet that stand below the change, whose foot opens with
// the plate, and whose scroller lets them show past its edge while the glide runs (see the copy's header).
import { glideCard as copied, glideFrames, cutFrames, rideFrames, GLIDE_EVENT } from './card-glide.copied.ts';

export interface GlideOpts { foot?: boolean; prior?: Animation[]; ride?: (Element | null | undefined)[]; cut?: (Element | null | undefined)[]; free?: (Element | null | undefined)[] }

/** The card `el`, just laid out at `h1` px after `h0`, seen to glide there. Returns its animations (none for a change under 1 px or under Reduce Motion's caller: asks only when motion is on). */
export function glideCard(el: Element, h0: number, h1: number, o: GlideOpts = {}): Animation[] {
  return copied(el, h0, h1, o as never) as Animation[];
}
export { glideFrames, cutFrames, rideFrames, GLIDE_EVENT };
