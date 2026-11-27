// The one height glide of a card or a sheet (2D card-glide.js, whose frames are copied in treat/card-glide.copied.ts): the card is laid out at its new height at once, and what is seen
// moves by transforms only (FLIP). Its plate is scaled from the old height to the new about the edge that stays (the top on a side card, the foot on a sheet, which stands on its foot), and
// on a sheet the words ride from where they stood, since its top moved. `ride` names the parts that stand below the change, `cut` the parts whose lower edge opens with the plate (a
// clip-path), `free` a scroller that lets them show past its edge while the glide runs (.glide-free). `inline` also writes the first frame inline, so the frame that finds the new height
// never shows it, and `mark` puts data-glide on the card while it runs (a card that clips must let its plate stand outside its new box). Treat's sheet and the action card glide by it;
// one call cancels the glide before it (`prior`), and only the newest glide takes its marks off.
// Written on the change, never in a frame: the browser's compositor plays the animations, so the one clock is not asked for frames.
import { glideFrames, cutFrames, rideFrames } from '../treat/card-glide.copied.ts';
import { D_SURFACE, EASE_ARRIVE } from '../motion.ts';

type Part = Element | null | undefined;
export interface GlideOpts {
  /** the card stands on its foot (a sheet): the plate scales about the foot and the words ride */
  foot?: boolean;
  /** the glide this one takes over from: cancelled first */
  prior?: Animation[];
  ride?: Part[]; cut?: Part[]; free?: Part[];
  /** the plate (default: the card's own `> .sheet-plate`) */
  plate?: Element | null;
  inline?: boolean;
  mark?: boolean;
}

const OWNER = new WeakMap<Element, object>();   // (which glide last wrote an element's marks: an older one finishing never takes the newer one's off)
const animatable = (c: Part): c is HTMLElement => !!c && typeof (c as HTMLElement).animate === 'function';

/** The card `el`, just laid out at `h1` px after `h0`, seen to glide there. Returns its animations (none for a change under 1 px). The caller asks only when motion is on. */
export function glideHeight(el: Element, h0: number, h1: number, o: GlideOpts = {}): Animation[] {
  const { foot = false, prior = [], ride = [], cut = [], free = [], inline = false, mark = false } = o;
  for (const a of prior) a.cancel?.();
  if (!(h0 > 0) || !(h1 > 0) || Math.abs(h1 - h0) < 1) return [];
  const plate = o.plate !== undefined ? o.plate : el.querySelector(':scope > .sheet-plate');
  const f = glideFrames(h0, h1, foot) as { origin: string; plate: Keyframe[]; words: Keyframe[] | null };
  const time = { duration: D_SURFACE, easing: EASE_ARRIVE }, out: Animation[] = [], held: HTMLElement[] = [], mine = {};
  const play = (c: HTMLElement, frames: Keyframe[]) => {
    if (inline && typeof frames[0]!.transform === 'string') { c.style.transform = frames[0]!.transform; held.push(c); OWNER.set(c, mine); }
    out.push(c.animate(frames, time));
  };
  // (a write on the change, never in a frame)
  if (animatable(plate)) { plate.style.transformOrigin = f.origin; play(plate, f.plate); }
  if (f.words) for (const c of Array.from(el.children)) if (c !== plate && animatable(c)) play(c, f.words);
  for (const c of ride) if (animatable(c)) play(c, rideFrames(h0, h1) as Keyframe[]);
  for (const c of cut) if (animatable(c)) play(c, cutFrames(h0, h1) as Keyframe[]);
  if (!out.length) return out;
  const loose = free.filter((c): c is HTMLElement => !!(c as HTMLElement | null)?.classList);
  for (const c of loose) { c.classList.add('glide-free'); OWNER.set(c, mine); }
  if (mark && el instanceof HTMLElement) { el.dataset.glide = ''; OWNER.set(el, mine); }
  const done = () => {
    for (const c of held) if (OWNER.get(c) === mine) { OWNER.delete(c); c.style.removeProperty('transform'); }
    for (const c of loose) if (OWNER.get(c) === mine) { OWNER.delete(c); c.classList.remove('glide-free'); }
    if (mark && el instanceof HTMLElement && OWNER.get(el) === mine) { OWNER.delete(el); delete el.dataset.glide; }
  };
  Promise.all(out.map((a) => a.finished)).then(done, done);
  return out;
}
export { glideFrames, cutFrames, rideFrames };
