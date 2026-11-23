// A stand-in for the canvas 2D context that records what the 2D app's monitor draws (monitor.js, copied whole by scripts/copy-b11-ir.mjs) as a chart Frame, so the one
// pressure monitor is the 2D app's own drawing code, not a second one. It implements only what the monitor and its helper modules call: rectangles, round rectangles,
// arcs, a closed polygon, text (set with Inter's advance widths, charts/measure.ts), the state stack, and the line the monitor inks as a chain of small round boxes
// (trace-callouts.js inkSeg), which becomes one round-capped polyline instead of thousands of boxes.
import type { Frame, Shape } from '../../charts/scene.ts';
import type { Rgba } from '../../charts/colour.ts';
import { parseColour, withAlpha } from '../../charts/colour.ts';
import { measure } from '../../charts/measure.ts';

interface State { fillStyle: string; strokeStyle: string; lineWidth: number; globalAlpha: number; font: string; textAlign: string; textBaseline: string; lineJoin: string }
type El =
  | { k: 'rr'; x: number; y: number; w: number; h: number; r: number }
  | { k: 'circle'; cx: number; cy: number; r: number }
  | { k: 'poly'; pts: number[]; closed: boolean };

const colours = new Map<string, Rgba>();
const rgba = (s: string): Rgba => { let c = colours.get(s); if (!c) { c = parseColour(s); if (colours.size > 200) colours.clear(); colours.set(s, c); } return c; };
const FONT_RE = /^(\d+)\s+([\d.]+)px/;

export class FrameCtx {
  /** the monitor tests this to draw a round rectangle as one box (the GPU's context's way) */
  readonly onGPU = true;
  readonly ctx = this;
  fillStyle = '#000'; strokeStyle = '#000'; lineWidth = 1; globalAlpha = 1; font = '500 12px Inter'; textAlign = 'left'; textBaseline = 'alphabetic'; lineJoin = 'miter';
  readonly shapes: Shape[] = [];
  private stack: State[] = [];
  private path: El[] = [];
  private cur: number[] | null = null;
  private halo: { s: string; color: Rgba; w: number } | null = null;
  /** The capsules the monitor asked to fill (never drawn) and the ground colour each had: the words that stand inside one wear that colour as their halo (see `emit`, `fillText`). */
  private caps: { x: number; y: number; w: number; h: number; color: Rgba }[] = [];

  readonly w: number;
  readonly h: number;
  constructor(w: number, h: number) { this.w = w; this.h = h; }

  frame(label: string): Frame { return { w: this.w, h: this.h, shapes: this.shapes, label }; }

  save(): void { this.stack.push({ fillStyle: this.fillStyle, strokeStyle: this.strokeStyle, lineWidth: this.lineWidth, globalAlpha: this.globalAlpha, font: this.font, textAlign: this.textAlign, textBaseline: this.textBaseline, lineJoin: this.lineJoin }); }
  restore(): void { const s = this.stack.pop(); if (s) Object.assign(this, s); }
  clearRect(): void { /* every frame starts empty */ }

  private fillC(): Rgba { return withAlpha(rgba(this.fillStyle), this.globalAlpha); }
  private penC(): Rgba { return withAlpha(rgba(this.strokeStyle), this.globalAlpha); }

  fillRect(x: number, y: number, w: number, h: number): void { if (w > 0 && h > 0) this.shapes.push({ k: 'rect', x, y, w, h, fill: this.fillC() }); }

  beginPath(): void { this.path = []; this.cur = null; }
  moveTo(x: number, y: number): void { this.cur = [x, y]; this.path.push({ k: 'poly', pts: this.cur, closed: false }); }
  lineTo(x: number, y: number): void { if (!this.cur) this.moveTo(x, y); else this.cur.push(x, y); }
  closePath(): void { const e = this.path[this.path.length - 1]; if (e?.k === 'poly') e.closed = true; }
  roundRect(x: number, y: number, w: number, h: number, r: number): void { this.path.push({ k: 'rr', x, y, w, h, r }); }
  arc(cx: number, cy: number, r: number): void { this.path.push({ k: 'circle', cx, cy, r }); }

  fill(): void { this.emit(true); }
  stroke(): void { this.emit(false); }

  private emit(fill: boolean): void {
    const col = fill ? this.fillC() : this.penC();
    const dots: number[] = [];
    let dotW = 0;
    for (const e of this.path) {
      if (e.k === 'rr') {
        // a round box as wide as it is tall and fully round is one dot of an inked line (inkSeg)
        if (fill && e.w === e.h && Math.abs(e.r - e.w / 2) < 1e-6 && e.w <= 4) { dots.push(e.x + e.r, e.y + e.r); dotW = e.w; continue; }
        const r = Math.min(e.r, e.w / 2, e.h / 2);
        // A capsule round words (a level's tag, the gradient's tag) is a pill: never drawn (owner, 22 Nov 2026: no pill, chip or badge; words wear a halo, never a box; docs/HUMANIZED-DESIGN.md section 0).
        // The copied monitor still asks for it; the words that follow take its ground colour as their halo, so they stay legible over the dashes and the trace.
        if (e.h >= 8 && r >= e.h / 2 - 0.01) { if (fill) this.caps.push({ x: e.x, y: e.y, w: e.w, h: e.h, color: col }); continue; }
        this.shapes.push(fill ? { k: 'rect', x: e.x, y: e.y, w: e.w, h: e.h, r, fill: col } : { k: 'rect', x: e.x, y: e.y, w: e.w, h: e.h, r, pen: { color: col, w: this.lineWidth } });
      } else if (e.k === 'circle') {
        this.shapes.push(fill ? { k: 'circle', cx: e.cx, cy: e.cy, r: e.r, fill: col } : { k: 'circle', cx: e.cx, cy: e.cy, r: e.r, pen: { color: col, w: this.lineWidth } });
      } else if (e.pts.length >= 4) {
        this.shapes.push(fill ? { k: 'path', pts: e.pts.slice(), closed: e.closed, fill: col } : { k: 'path', pts: e.pts.slice(), closed: e.closed, pen: { color: col, w: this.lineWidth, join: 'round' } });
      }
    }
    if (dots.length) this.ink(dots, dotW, col);
  }

  /** The inked dots as polylines of the line's width: a new line where the next dot is not within reach of the last, and no dot closer than half a pixel to the last kept. */
  private ink(d: number[], w: number, color: Rgba): void {
    let line: number[] = [];
    const flush = () => {
      if (line.length >= 4) this.shapes.push({ k: 'path', pts: line, pen: { color, w, cap: 'round', join: 'round' } });
      else if (line.length === 2) this.shapes.push({ k: 'circle', cx: line[0]!, cy: line[1]!, r: w / 2, fill: color });
      line = [];
    };
    for (let i = 0; i < d.length; i += 2) {
      const x = d[i]!, y = d[i + 1]!, n = line.length;
      if (n) {
        const dist = Math.hypot(x - line[n - 2]!, y - line[n - 1]!);
        if (dist > w * 1.5) flush();
        else if (dist < 0.5) continue;
      }
      line.push(x, y);
    }
    flush();
  }

  private fontOf(): { size: number; weight: number } {
    const m = FONT_RE.exec(this.font);
    return m ? { weight: +m[1]!, size: +m[2]! } : { weight: 500, size: 12 };
  }
  measureText(s: string): { width: number } { const f = this.fontOf(); return { width: measure(s, f.size, f.weight) }; }
  strokeText(s: string): void { this.halo = { s, color: this.penC(), w: this.lineWidth }; }
  /** The halo of a word standing inside a dropped capsule: the capsule's own ground colour (the first fill, the most opaque), 3 px. */
  private capHalo(x: number, y: number): { color: Rgba; w: number } | undefined {
    for (const c of this.caps) if (x >= c.x - 1 && x <= c.x + c.w + 1 && y >= c.y - 1 && y <= c.y + c.h + 1) return { color: c.color, w: 3 };
    return undefined;
  }
  fillText(s: string, x: number, y: number): void {
    const f = this.fontOf(), halo = this.halo && this.halo.s === s ? { color: this.halo.color, w: this.halo.w } : this.capHalo(x, y);
    this.halo = null;
    this.shapes.push({
      k: 'text', x, y, s, size: f.size, weight: f.weight, color: this.fillC(),
      anchor: this.textAlign === 'center' ? 'middle' : this.textAlign === 'right' || this.textAlign === 'end' ? 'end' : 'start',
      baseline: this.textBaseline === 'middle' ? 'middle' : this.textBaseline === 'top' ? 'top' : 'alphabetic',
      ...(halo ? { halo } : {}),
    });
  }
}
