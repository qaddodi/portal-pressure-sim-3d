// The parts that wear the colour lens along their length (the lobule's vessels, the sinusoid's lumen): each tube has a colour at its two ends (the 2D painter's
// `tubeRGB`), they ease toward the lens's now (a third of a second, so a lens switch crossfades and a slider moves them smoothly), and the vertices between take the straight
// line between the two, as the GPU blends a 2D vessel's ends. The geometry carries an `ink` attribute (Batch.withInk), CelObject reads it (setInkAmount).
import type { BufferAttribute, BufferGeometry } from 'three';
import { type InkContext, type Seg, LANE_X, inkLanes } from './ink.ts';

/** Floats per tube in the goal and current colours: three colours across (the lanes) at each of its two ends. */
const STRIDE = 18;

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
  private readonly a: number[] = new Array(9).fill(0);
  private readonly b: number[] = new Array(9).fill(0);

  add(geo: BufferGeometry, seg: Seg, tubes: InkTubes['tubes'] = [], ends: [number, number][] = []): void {
    const n = Math.max(1, tubes.length) * STRIDE;
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
        if (!e.tubes.length) { inkLanes(c, e.seg, e.seg === 'cv' ? 1 : 0, this.a); for (let k = 0; k < 9; k++) e.goal[k] = this.a[k]!; continue; }
        e.ends.forEach(([w0, w1], i) => {
          inkLanes(c, e.seg, w0, this.a); inkLanes(c, e.seg, w1, this.b);
          for (let k = 0; k < 9; k++) { e.goal[i * STRIDE + k] = this.a[k]!; e.goal[i * STRIDE + 9 + k] = this.b[k]!; }
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
  if (!e.tubes.length) { for (let v = 0; v < a.count; v++) { arr[v * 3] = e.cur[3]!; arr[v * 3 + 1] = e.cur[4]!; arr[v * 3 + 2] = e.cur[5]!; } }
  else {
    e.tubes.forEach((t, i) => {
      const o = i * STRIDE;
      for (let r = 0; r < t.rings; r++) {
        const f = t.rings > 1 ? r / (t.rings - 1) : 0;
        for (let j = 0; j < t.ring; j++) {
          // the vertex's place across the tube (cos of its angle round it: the tube's frame keeps one side of it facing along the screen), between the three colour samples
          const x = Math.cos((j / Math.max(1, t.ring - 1)) * Math.PI * 2), at = x <= LANE_X[0] ? 0 : x >= LANE_X[2] ? 2 : x < 0 ? (x - LANE_X[0]) / (0 - LANE_X[0]) : 1 + x / LANE_X[2];
          const s0 = Math.min(1, Math.floor(at)), u = at - s0, v = (t.start + r * t.ring + j) * 3;
          for (let k = 0; k < 3; k++) {
            const c0 = e.cur[o + s0 * 3 + k]! * (1 - u) + e.cur[o + (s0 + 1) * 3 + k]! * u, c1 = e.cur[o + 9 + s0 * 3 + k]! * (1 - u) + e.cur[o + 9 + (s0 + 1) * 3 + k]! * u;
            arr[v + k] = c0 + (c1 - c0) * f;
          }
        }
      }
    });
  }
  a.needsUpdate = true;
}
