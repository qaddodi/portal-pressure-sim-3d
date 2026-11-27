// The one label tag of the figure, as DOM: words and nothing else. A tag is a name, a number and a unit (any of them may be empty), each letter wearing the labels' halo, in
// the station labels' own sizes (labels.css `.cl.tg`). It has no glass, no rim, no clip and no pointer: this module cannot draw a box or a speech bubble, because it has no
// field to hold one (Mohammad, 22 and 23 Nov: "No speech-bubble callouts ever"). Where the words stand away from what they name, a `TagLead` (a thin line, and a dot where it
// names a point that is no vessel) joins them.
//
// Nothing is written per frame but `transform` and `opacity`. Opacity goes on a tag's children (never the root) as it always has, and a tag that is showing crosses over to new
// words or a new tone (roll.ts `restyle`), never steps; a number that only ticks is written where it stands (no cross-fade per tick, no flicker).
import { restyle, rollsFor } from './roll.ts';

const px = (n: number) => Math.round(n * 100) / 100;
export const opacity = (n: number) => String(Math.round(Math.max(0, Math.min(1, n)) * 1000) / 1000);

/** What a tag says: a name, a number, a unit, and the tone its ink follows (a catheter tone, a band, or a slide's: labels.css `.cl[data-tone]`). */
export interface TagWords { kicker: string; value: string; unit: string; tone: string }

export interface Tag {
  root: HTMLElement;
  k: HTMLElement; n: HTMLElement; u: HTMLElement;
  tone: string; text: string; op: string; tx: string; size: string;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, parent?: Element): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag); e.className = cls; parent?.appendChild(e); return e;
}

/** A tag: its name, number and unit. `cls` is its own class (the layer's position rule and its kind); `tg` is on every one. */
export function makeTag(parent: Element, cls: string): Tag {
  const root = el('div', `${cls} tg`, parent);
  const k = el('small', 'cl-k', root), n = el('b', 'cl-n', root), u = el('span', 'cl-u', root);
  // (born at 0, as a hidden tag is: its words are written while it is invisible, and the first thing it is ever shown with is not a change of words)
  k.style.opacity = n.style.opacity = u.style.opacity = '0';
  return { root, k, n, u, tone: '', text: '', op: '0', tx: '', size: '' };
}

/** How much of a tag is on the screen now: what `fade` wrote last (a tag is born at 0, and `fade(c, 0)` is what hides it). The one thing a change of words is judged by:
 *  a tag that is only now coming in is not showing, whatever opacity it is about to be given (roll.ts `restyle`). */
export const painted = (c: Pick<Tag, 'op'>): number => Number(c.op) || 0;

/** The words of a tag (written when they change). A tag that is showing crosses over to its new words and tone, never steps; one that is coming in (or hidden) simply takes them
 *  (roll.ts `restyle`, `painted`). */
export function words(c: Tag, r: TagWords): void {
  const t = `${r.kicker}|${r.value}|${r.unit}`;
  if (c.text === t && c.tone === r.tone) return;
  // A reading that ticks (the manometer's number while the needle reads, a beat-filtered pressure breathing round a rounding boundary) is written where it stands, as 2D's refreshValues does and
  // as the station labels do (roll.ts ROLL_MIN): the same kicker, unit and tone and a number within ROLL_MIN of the last is no change of words, so it never crosses over (a cross-fade per tick,
  // every few frames, was the callout flickering while it measured). A real change (a new reading, a dash coming to a number, another tone) still crosses over.
  if (c.tone === r.tone && c.text) {
    const [k0, n0, u0] = c.text.split('|');
    if (k0 === r.kicker && u0 === r.unit && n0 !== undefined && !rollsFor(r.value, n0) && /^-?\d+(\.\d+)?$/.test(r.value) && /^-?\d+(\.\d+)?$/.test(n0)) { c.text = t; c.n.textContent = r.value; return; }
  }
  restyle(c.root, () => {
    if (c.text !== t) { c.text = t; c.k.textContent = r.kicker; c.n.textContent = r.value; c.u.textContent = r.unit; }   // (an empty number or unit takes no room: labels.css `:empty`)
    if (c.tone !== r.tone) { c.tone = r.tone; c.root.dataset.tone = r.tone; }
  }, painted(c));
}

/** Opacity on the tag's children (never the root). */
export function fade(c: Tag, a: number): void {
  const o = opacity(a);
  if (o === c.op) return;
  c.op = o;
  c.k.style.opacity = o; c.n.style.opacity = o; c.u.style.opacity = o;
}
export function place(c: Tag, x: number, y: number): void {
  const t = `translate3d(${px(x)}px,${px(y)}px,0)`;
  if (t !== c.tx) { c.tx = t; c.root.style.transform = t; }
}
export function size(c: Tag, w: number, h: number): void {
  const t = `${px(w)}x${px(h)}`;
  if (t !== c.size) { c.size = t; c.root.style.width = `${px(w)}px`; c.root.style.height = `${px(h)}px`; }
}
export function show(c: Tag, on: boolean): void {
  if (on) c.root.setAttribute('data-on', ''); else c.root.removeAttribute('data-on');
}

/** One tag's leader: a thin line from the words to the point they name and, where wanted, a 5 px dot on the point (labels.css `.cl-lead`). Moved by transform; a leader or dot that is not wanted
 *  is scaled to nothing by `ease` and never switched off, so it leaves the way it came. The caller supplies the step (`ease`: one step of a presence toward on or off). */
export class TagLead {
  readonly root: HTMLElement;
  private readonly line: HTMLElement;
  private readonly dot: HTMLElement;
  private k = 0; private kd = 0; private len = 0; private at = 'translate3d(0,0,0)'; private dat = 'translate3d(0,0,0)'; private tx = ''; private dtx = ''; private tone = ''; private op = '';
  constructor(parent: Element) {
    this.root = el('div', 'cl-lead cl-lead-one', parent);
    this.line = el('i', 'cl-lead-line', this.root); this.dot = el('i', 'cl-lead-dot', this.root);
    this.dtx = 'translate3d(0,0,0) scale(0)'; this.dot.style.transform = this.dtx;
  }
  /** Draw it: `seg` the line's two ends (null: no line now), `dotAt` where the dot stands (null: none), `alpha` the tag's own fade. Returns true while it still eases. */
  paint(seg: readonly [number, number, number, number] | null, dotAt: { x: number; y: number } | null, alpha: number, tone: string, ease: (k: number, on: boolean) => number): boolean {
    this.k = ease(this.k, !!seg); this.kd = ease(this.kd, !!dotAt);
    if (seg) {
      this.len = Math.hypot(seg[2] - seg[0], seg[3] - seg[1]);
      this.at = `translate3d(${px(seg[0])}px,${px(seg[1])}px,0) rotate(${Math.atan2(seg[3] - seg[1], seg[2] - seg[0]).toFixed(4)}rad)`;
    }
    const tx = `${this.at} scaleX(${px(this.len * this.k)})`;
    if (tx !== this.tx) { this.tx = tx; this.line.style.transform = tx; }
    if (dotAt) this.dat = `translate3d(${px(dotAt.x)}px,${px(dotAt.y)}px,0)`;
    const dtx = `${this.dat} scale(${px(this.kd)})`;
    if (dtx !== this.dtx) { this.dtx = dtx; this.dot.style.transform = dtx; }
    const o = opacity(alpha);
    if (o !== this.op) { this.op = o; this.root.style.opacity = o; }
    if (tone !== this.tone) { this.tone = tone; this.root.dataset.tone = tone; }
    return (this.k > 0 && this.k < 1) || (this.kd > 0 && this.kd < 1);
  }
  hide(): void { if (this.op !== '0') { this.op = '0'; this.root.style.opacity = '0'; } }
}
