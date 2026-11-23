// One chart on screen: a canvas (the shapes) and a text layer (the words) in a box, drawn by the one clock. `show(frame)` glides from the frame now
// drawn to the new one (blend, 280 ms, the app's arrive curve) or sets it at once; a still chart costs nothing (no frame is asked for).
import { clock } from '../../clock/frame.ts';
import { easeArrive, MOTION } from '../../clock/tween.ts';
import { ChartGL, type Under } from './gl.ts';
import { tessellate } from './geometry.ts';
import { blend } from './morph.ts';
import type { Frame } from './scene.ts';
import { TextLayer } from './text-layer.ts';
import { legible } from './legible.ts';
import { paletteOf } from './palette.ts';
import type { LookId } from '../../looks/looks.ts';

export class ChartPainter {
  readonly box: HTMLDivElement;
  private gl: ChartGL;
  private text: TextLayer;
  private shown: Frame | null = null;
  private from: Frame | null = null;
  private to: Frame | null = null;
  private t0 = 0;
  private ms = 0;
  private hold: { release(): void } | null = null;
  private off: (() => void) | null = null;
  private dirty = false;
  private tag: string;
  private offRender: () => void;

  constructor(tag = 'chart', doc: Document = document) {
    this.tag = tag;
    this.box = doc.createElement('div');
    this.box.style.cssText = 'position:relative;width:100%;overflow:hidden;';
    const canvas = doc.createElement('canvas');
    canvas.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;display:block;';
    canvas.setAttribute('aria-hidden', 'true');
    this.gl = new ChartGL(canvas);
    this.gl.onRestored = () => this.draw();
    this.text = new TextLayer(doc);
    this.box.append(canvas, this.text.root);
    // drawing happens in the clock's render phase, once per frame that asked
    this.offRender = clock.on('render', (f) => this.frame(f.time), 5);
  }

  /** A picture drawn under the shapes on every draw (the FibroScan's map); null takes it away. The pane asks for a frame itself when the picture moves. */
  setUnder(fn: Under | null) { this.gl.under = fn; this.dirty = true; clock.invalidate(this.tag); }
  /** Draw the frame now shown again (the picture under it moved). */
  redraw() { this.dirty = true; clock.invalidate(this.tag); }

  get frame_(): Frame | null { return this.shown; }
  get words(): string[] { return this.text.words; }

  /** Show a frame. glide: blend from the one now shown (when there is one). */
  show(next: Frame, glide = true) {
    next = this.legible(next);
    // (the height the chart wants, written where the card reads it with the box's real height: card-want.ts)
    if (next.want != null && next.want > next.h + 0.5) this.box.dataset.wantH = String(Math.round(next.want)); else delete this.box.dataset.wantH;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.box.style.height = `${Math.round(next.h)}px`;
    this.gl.size(next.w, next.h);
    if (glide && !reduce && this.shown) {
      this.from = this.shown; this.to = next; this.t0 = clock.now(); this.ms = MOTION.cardInMs;
      if (!this.hold) this.hold = clock.hold(this.tag);
    } else {
      this.from = this.to = null; this.shown = next; this.stopHold();
    }
    this.dirty = true;
    clock.invalidate(this.tag);
  }

  /** Every word reads at 4.5:1 on what it stands on in the look now showing (legible.ts); a chart with a picture under it is left as drawn (its backdrop is the picture's). */
  private legible(f: Frame): Frame {
    if (this.gl.under) return f;
    try {
      const look = this.box.ownerDocument.documentElement.dataset.look as LookId | undefined;
      if (!look) return f;
      const pal = paletteOf(look);
      return legible(f, pal.tok('surface'), pal.tok('text'));
    } catch { return f; }
  }

  private stopHold() { this.hold?.release(); this.hold = null; }

  private frame(now: number) {
    if (this.from && this.to) {
      const k = Math.min(1, (now - this.t0) / this.ms);
      const f = blend(this.from, this.to, easeArrive(k));
      if (k >= 1) { this.shown = this.to; this.from = this.to = null; this.stopHold(); }
      else this.shown = f;
      this.dirty = true;
      if (k < 1) { this.drawFrame(f); this.dirty = false; return; }
    }
    if (this.dirty) { this.draw(); this.dirty = false; }
  }

  private draw() { if (this.shown) this.drawFrame(this.shown); }
  private drawFrame(f: Frame) { this.gl.draw(tessellate(f)); this.text.sync(f.shapes); }

  dispose() { this.offRender(); this.off?.(); this.stopHold(); this.gl.dispose(); this.text.dispose(); this.box.remove(); }
}
