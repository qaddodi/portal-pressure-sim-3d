// The parts that wear the colour lens along their length (the lobule's vessels, the sinusoid's lumen): each tube has a colour at its two ends (the 2D painter's
// `tubeRGB`), they ease toward the lens's now (a third of a second, so a lens switch crossfades and a slider moves them smoothly), and the vertices between take the straight
// line between the two, as the GPU blends a 2D vessel's ends. The geometry carries an `ink` attribute (Batch.withInk), CelObject reads it (setInkAmount).
import type { BufferAttribute, BufferGeometry } from 'three';
import { type InkContext, type Seg, inkAt } from './ink.ts';

export interface InkTubes {
  geo: BufferGeometry;
  seg: Seg;
  /** The rings of each tube in the vertex list (Batch.tubes); empty for a part of one colour (an end-on vessel). */
  tubes: { start: number; rings: number; ring: number }[];
  /** The weight along each tube at its first and last ring (w0, w1), for the lens's value there. */
  ends: [number, number][];
  /** Whether the part opens in the lens's colours rather than easing in (set again each time its view is shown). */
  fresh: boolean;
  goal: Float32Array;
  cur: Float32Array;
}

export class InkSet {
  readonly entries: InkTubes[] = [];
  private ctx: InkContext | null = null;
  private dirty = true;
  private fib = -1;
  private readonly a: [number, number, number] = [0, 0, 0];
  private readonly b: [number, number, number] = [0, 0, 0];

  add(geo: BufferGeometry, seg: Seg, tubes: InkTubes['tubes'] = [], ends: [number, number][] = []): void {
    const n = Math.max(1, tubes.length) * 6;
    this.entries.push({ geo, seg, tubes, ends, fresh: true, goal: new Float32Array(n), cur: new Float32Array(n) });
  }
  /** The lens, look, model and reference now (a new one eases in). */
  set(ctx: InkContext): void { this.ctx = ctx; this.dirty = true; }
  /** The next step opens in the lens's colours, with no ease. */
  freshen(): void { for (const e of this.entries) e.fresh = true; }
  get ready(): boolean { return !!this.ctx; }

  /** Steps the colours; true while they move. */
  step(dtMs: number, reduce: boolean): boolean {
    const c = this.ctx;
    if (!c) return false;
    if (this.dirty || Math.abs(c.fibSin - this.fib) > 0.004) {
      this.dirty = false; this.fib = c.fibSin;
      for (const e of this.entries) {
        if (!e.tubes.length) { inkAt(c, e.seg, e.seg === 'cv' ? 1 : 0, this.a); for (let k = 0; k < 3; k++) e.goal[k] = this.a[k]!; continue; }
        e.ends.forEach(([w0, w1], i) => {
          inkAt(c, e.seg, w0, this.a); inkAt(c, e.seg, w1, this.b);
          for (let k = 0; k < 3; k++) { e.goal[i * 6 + k] = this.a[k]!; e.goal[i * 6 + 3 + k] = this.b[k]!; }
        });
      }
    }
    const k = reduce ? 1 : 1 - Math.exp(-Math.max(0, dtMs) / 140);
    let moving = false;
    for (const e of this.entries) {
      let changed = e.fresh;
      for (let i = 0; i < e.goal.length; i++) {
        const d = e.goal[i]! - e.cur[i]!;
        if (e.fresh) e.cur[i] = e.goal[i]!;
        else if (Math.abs(d) > 4e-4) { e.cur[i] = e.cur[i]! + d * k; changed = true; moving = true; }
        else if (d !== 0) { e.cur[i] = e.goal[i]!; changed = true; }
      }
      e.fresh = false;
      if (changed) write(e);
    }
    return moving;
  }
}

function write(e: InkTubes): void {
  const a = e.geo.getAttribute('ink') as BufferAttribute, arr = a.array as Float32Array;
  if (!e.tubes.length) { for (let v = 0; v < a.count; v++) { arr[v * 3] = e.cur[0]!; arr[v * 3 + 1] = e.cur[1]!; arr[v * 3 + 2] = e.cur[2]!; } }
  else {
    e.tubes.forEach((t, i) => {
      const o = i * 6;
      for (let r = 0; r < t.rings; r++) {
        const f = t.rings > 1 ? r / (t.rings - 1) : 0;
        const R_ = e.cur[o]! + (e.cur[o + 3]! - e.cur[o]!) * f, G_ = e.cur[o + 1]! + (e.cur[o + 4]! - e.cur[o + 1]!) * f, B_ = e.cur[o + 2]! + (e.cur[o + 5]! - e.cur[o + 2]!) * f;
        for (let j = 0; j < t.ring; j++) { const v = (t.start + r * t.ring + j) * 3; arr[v] = R_; arr[v + 1] = G_; arr[v + 2] = B_; }
      }
    });
  }
  a.needsUpdate = true;
}
