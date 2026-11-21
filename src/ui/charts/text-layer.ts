// A chart's words: real text over the picture (crisp at any zoom, selectable by a screen reader's virtual cursor via the chart's own label, in the app's
// fonts), placed with transform and opacity only. Spans are made when the number of words changes, never per frame; a frame only moves them.
import { toCss } from './colour.ts';
import { ARRIVE_CSS } from '../../clock/tween.ts';
import type { Shape, TextShape } from './scene.ts';

/** Inter's baseline sits this far down a line box whose height is the font size (ascent .969, descent .241, line-height 1). */
export const BASELINE_EM = 0.864;

/** A word that joins a chart already showing words eases in (nothing pops: Mohammad, 20 Nov); the chart's own first words come with the chart. */
export const WORD_IN_MS = 240;

interface Slot { fresh: boolean; el: HTMLSpanElement; style: string; text: string; t: string; o: string; c: string; h: string }

export class TextLayer {
  readonly root: HTMLDivElement;
  private slots: Slot[] = [];
  private shown = false;

  constructor(doc: Document = document) {
    this.root = doc.createElement('div');
    this.root.setAttribute('aria-hidden', 'true');
    this.root.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;overflow:hidden;pointer-events:none;';
  }

  /** The vertical shift (in em of the font size) from a line box's top to the anchor, per baseline. */
  static lift(b: TextShape['baseline']): number { return b === 'top' ? 0 : b === 'middle' ? 0.5 : BASELINE_EM; }

  sync(shapes: readonly Shape[]) {
    const words = shapes.filter((s): s is TextShape => s.k === 'text');
    while (this.slots.length < words.length) {
      const el = this.root.ownerDocument.createElement('span');
      this.root.append(el);
      this.slots.push({ fresh: this.shown, el, style: '', text: '', t: '', o: '', c: '', h: '' });
    }
    while (this.slots.length > words.length) this.slots.pop()!.el.remove();
    words.forEach((w, i) => {
      const sl = this.slots[i]!;
      const style = [
        'position:absolute;left:0;top:0;white-space:pre;line-height:1;will-change:transform;transform-origin:0 0;',
        `font:${w.italic ? 'italic ' : ''}${w.weight ?? 500} ${w.size}px/1 var(${w.font === 'display' ? '--display' : '--ui'}, system-ui, sans-serif);`,
        w.upper ? 'text-transform:uppercase;' : '',
        w.ls ? `letter-spacing:${w.ls}em;` : '',
        w.halo ? 'paint-order:stroke fill;' : '',
        'font-variant-numeric:tabular-nums lining-nums;',
      ].join('');
      if (style !== sl.style) { sl.el.style.cssText = style; sl.style = style; sl.t = ''; sl.o = ''; sl.c = ''; sl.h = ''; }
      // (the colours are written alone, and only when they differ: a colour glide rewrites one property, never the whole font and box style)
      const c = toCss(w.color);
      if (c !== sl.c) { sl.el.style.color = c; sl.c = c; }
      const h = w.halo ? `${w.halo.w}px ${toCss(w.halo.color)}` : '';
      if (h !== sl.h) { sl.el.style.setProperty('-webkit-text-stroke', h); sl.h = h; }
      if (w.s !== sl.text) { sl.el.textContent = w.s; sl.text = w.s; }
      const dx = w.anchor === 'end' ? -100 : w.anchor === 'middle' ? -50 : 0;
      // (a turned word turns about its anchor: the box's own corner moves to the anchor first, so the letters end where the point is, whichever way it is turned)
      const t = w.rot
        ? `translate3d(${Math.round(w.x * 100) / 100}px,${Math.round(w.y * 100) / 100}px,0) rotate(${Math.round(w.rot * 100) / 100}deg) translate(${dx}%,${-TextLayer.lift(w.baseline) * w.size}px)`
        : `translate3d(${Math.round(w.x * 100) / 100}px,${Math.round((w.y - TextLayer.lift(w.baseline) * w.size) * 100) / 100}px,0) translateX(${dx}%)`;
      if (t !== sl.t) { sl.el.style.transform = t; sl.t = t; }
      const o = String(Math.round((w.alpha ?? 1) * 1000) / 1000);
      if (o !== sl.o) { sl.el.style.opacity = o; sl.o = o; }
      if (sl.fresh) { sl.fresh = false; sl.el.animate?.([{ opacity: 0 }, { opacity: +o }], { duration: WORD_IN_MS, easing: ARRIVE_CSS }); }
    });
    this.shown = words.length > 0;
  }

  /** The words now shown, for a test or a screen reader's description. */
  get words(): string[] { return this.slots.map((s) => s.text); }
  dispose() { this.root.remove(); this.slots = []; }
}
