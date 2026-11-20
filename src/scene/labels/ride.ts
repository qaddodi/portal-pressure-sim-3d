// How a view's own captions (the Circuit's lane, zone and resistor words, the Lobule's zone and tract names) behave while the picture moves. They are the 2D app's labels, and a 2D label rides
// its picture: a hand pan or a zoom carries the words with their dots and nothing blinks (Mohammad, 20 Nov: "why does panning in the circuit or lobule view make the labels hide, but not in
// anatomy?"). Until then these two layers hid every caption the moment anything moved and brought them back FADE.settleMs after it stopped, while the Anatomy's labels (controller.ts) rode.
// This is the one rule, pure and in one place, for both layers (and node tests it, tests/labels-ride.test.ts):
//   - the words stay where they were solved, relative to their dots, and the dots follow the picture: two reference points of the picture, read each frame, give the turn, the scale and the shift
//     since the solve (a similarity: a pan, a zoom, a roll), applied to every dot; with FOUR reference points (c, d given) the map is the plate's own perspective one (a homography), exact for every
//     dot on a flat plate however the camera stands: a similarity cannot carry a tilted plate, and the carried dots drifted off what they name and were kept there at rest (Mohammad 20 Nov:
//     "random labels", the tract's names standing in the empty field right of the lobule);
//   - a dot that jumps (a cut, a view's far end: more than FOLLOW_JUMP px in one frame) is not carried: the words fade out and come back, placed again, once it is still;
//   - once the picture is still, the words are placed again only where the carried place no longer holds (a caption under a card or past the edge, a new zoom, other words): a pure pan that keeps
//     every box clear just keeps its places; when a new place is needed the words fade out where they stand, are placed at the fade's end, and fade in (never a pop).
import { FADE } from './alpha.ts';
import type { Box } from './geometry.ts';

/** A jump of a dot, in px, between two frames, that is a cut and not a hand's pan (the same as the Anatomy's, controller.ts FOLLOW_JUMP). */
export const FOLLOW_JUMP = 60;
/** Two reference points of the picture are this near and the scale is not read from them (a degenerate map). */
const MIN_SPAN = 1e-6;

export interface Pt { x: number; y: number }

export interface RideIn {
  now: number;
  dt: number;
  /** The view is the one these captions belong to, and standing (not on its way in or out). */
  on: boolean;
  /** The camera (a hand, a glide) is moving the picture now. */
  moving: boolean;
  /** Two points of the picture, projected now: any two that stay apart. */
  a: Pt; b: Pt;
  /** Two more, so a, b, c, d are the corners of a quad on the plate (no three in line, in that order round it): the dots are then carried by the plate's perspective map, exactly. */
  c?: Pt; d?: Pt;
  /** The words' own signature: everything that changes what they say or where they may stand but the picture's place (cards, level, zoom, data). Read only at rest. */
  layout(): string;
  /** Whether every caption, carried to where the picture is now, still stands clear (in the view, off the cards). Read only at rest, when the picture has only been shifted. */
  fits(ride: (x: number, y: number, out: Pt) => Pt): boolean;
}
export interface RideOut {
  /** Place the captions now (and write their words): the picture is still, they are invisible, and the layout is new. */
  solve: boolean;
  /** The captions' opacity this frame. */
  alpha: number;
  /** Frames are still needed (fading, or waiting for the picture to be still). */
  busy: boolean;
}

export class Ride {
  alpha = 0;
  private solved = false;
  private sig = '';
  private refA: Pt = { x: 0, y: 0 };
  private refB: Pt = { x: 0, y: 0 };
  private nowA: Pt = { x: 0, y: 0 };
  private nowB: Pt = { x: 0, y: 0 };
  private refC: Pt | null = null;
  private refD: Pt | null = null;
  private nowC: Pt | null = null;
  private nowD: Pt | null = null;
  /** The homography from the solve's picture to now's (3 x 3, row major), or null to use the similarity. */
  private H: number[] | null = null;
  private hKey = '';
  /** The references of a carry judged to fit at rest (not judged again until the picture moves). */
  private kept = '';
  private lastA: Pt | null = null;
  private lastRefs = '';
  private lastMove = -1e9;
  private cut = false;
  private readonly out: RideOut = { solve: false, alpha: 0, busy: false };

  /** Why the last re-place was asked for (a diagnostic: 'unsolved', 'cut', 'sig' or 'fits'), and the signature or references it changed from and to. */
  why = ''; whySig = '';
  private readonly settleMs: number;
  constructor(settleMs: number = FADE.settleMs) { this.settleMs = settleMs; }

  /** Ask for the words to be placed again at the next rest (a card, the level or a font changed). */
  invalidate(): void { this.sig = ''; }

  /** The point a dot solved at (x, y) stands at now (the picture's pan, zoom and roll since the solve: a similarity through the two reference points). `out` may be `{x, y}` itself. */
  ride = (x: number, y: number, out: Pt = { x: 0, y: 0 }): Pt => {
    const H = this.homography();
    if (H) {
      const w = H[6]! * x + H[7]! * y + H[8]!;
      if (Math.abs(w) > 1e-12) { const X = (H[0]! * x + H[1]! * y + H[2]!) / w, Y = (H[3]! * x + H[4]! * y + H[5]!) / w; out.x = X; out.y = Y; return out; }
    }
    const rx = this.refB.x - this.refA.x, ry = this.refB.y - this.refA.y, nx = this.nowB.x - this.nowA.x, ny = this.nowB.y - this.nowA.y;
    const d = rx * rx + ry * ry;
    if (d < MIN_SPAN) { out.x = x + (this.nowA.x - this.refA.x); out.y = y + (this.nowA.y - this.refA.y); return out; }
    // z' = A' + (B' - A') / (B - A) * (z - A), as complex numbers
    const cr = (nx * rx + ny * ry) / d, ci = (ny * rx - nx * ry) / d;
    const dx = x - this.refA.x, dy = y - this.refA.y;
    out.x = this.nowA.x + cr * dx - ci * dy;
    out.y = this.nowA.y + ci * dx + cr * dy;
    return out;
  };

  /** The picture's place when the captions were last placed. */
  private rebase(): void {
    this.refA = { ...this.nowA }; this.refB = { ...this.nowB };
    this.refC = this.nowC ? { ...this.nowC } : null; this.refD = this.nowD ? { ...this.nowD } : null;
    this.hKey = ''; this.kept = '';
  }

  /** The solve's picture to now's through the four references (null with only two, or a degenerate quad). */
  private homography(): number[] | null {
    if (!this.refC || !this.refD || !this.nowC || !this.nowD) return null;
    const key = [this.refA, this.refB, this.refC, this.refD, this.nowA, this.nowB, this.nowC, this.nowD].map((p) => `${p.x},${p.y}`).join(';');
    if (key === this.hKey) return this.H;
    this.hKey = key;
    const from = squareToQuad(this.refA, this.refB, this.refC, this.refD), to = squareToQuad(this.nowA, this.nowB, this.nowC, this.nowD);
    const inv = from && inv3(from);
    this.H = inv && to ? mul3(to, inv) : null;
    return this.H;
  }

  step(i: RideIn): RideOut {
    const { now, dt, on, a, b } = i;
    this.nowA.x = a.x; this.nowA.y = a.y; this.nowB.x = b.x; this.nowB.y = b.y;
    this.nowC = i.c ? { x: i.c.x, y: i.c.y } : null; this.nowD = i.d ? { x: i.d.x, y: i.d.y } : null;
    if (!on) {
      // another view (or this one on its way): the words fade out and are placed again when it stands
      this.solved = false; this.sig = ''; this.lastA = null; this.cut = false;
    } else {
      if (this.lastA && Math.hypot(a.x - this.lastA.x, a.y - this.lastA.y) > FOLLOW_JUMP) this.cut = true;   // (a cut is not carried)
      this.lastA = this.lastA ?? { x: 0, y: 0 };
      this.lastA.x = a.x; this.lastA.y = a.y;
    }
    const refs = refsKey(a, b, i.c, i.d);
    if (i.moving || refs !== this.lastRefs) this.lastMove = now;
    this.lastRefs = refs;
    const still = on && now - this.lastMove >= this.settleMs;

    // at rest: place the words again only where the carried place no longer holds
    let need = false, sig = '';
    if (still) {
      sig = i.layout();
      if (!this.solved || this.cut || sig !== this.sig) { need = true; this.why = !this.solved ? 'unsolved' : this.cut ? 'cut' : 'sig'; this.whySig = `${this.sig} => ${sig}`; }
      // (a carry that still fits is KEPT as a carry: the references stay the solve's, so the dots keep riding from where they were solved. It used to rebase here, which made the ride the identity
      //  while the layers' dots are still the solve's screen places: after any pan or zoom came to rest, every dot snapped back to where it stood before it, off what it names. Mohammad 20 Nov,
      //  "random labels": the tract's names in the empty field where the tract had been before a pan.)
      else if (refs !== this.refsAtSolve() && refs !== this.kept) { if (i.fits(this.ride)) this.kept = refs; else { need = true; this.why = 'fits'; this.whySig = `${this.refsAtSolve()} => ${refs}`; } }
    }
    let solve = false;
    if (need && this.alpha <= 0) { solve = true; this.solved = true; this.cut = false; this.sig = sig; this.rebase(); }

    // what the words wear: in while they stand (carried or placed), out while a new place is waited for, a cut is waiting, or the view is not this one
    const to = on && this.solved && !this.cut && !(need && !solve) ? 1 : 0;
    if (this.alpha !== to) {
      const ms = to > this.alpha ? FADE.inMs : FADE.outMs, step = dt / ms;
      this.alpha = Math.abs(to - this.alpha) <= step ? to : this.alpha + Math.sign(to - this.alpha) * step;
    }
    this.out.solve = solve; this.out.alpha = this.alpha;
    this.out.busy = this.alpha !== to || (on && (!still || need || !this.solved));
    return this.out;
  }

  private refsAtSolve(): string { return refsKey(this.refA, this.refB, this.refC, this.refD); }
}

const refsKey = (a: Pt, b: Pt, c?: Pt | null, d?: Pt | null): string =>
  [a, b, ...(c && d ? [c, d] : [])].map((p) => `${Math.round(p.x * 2)},${Math.round(p.y * 2)}`).join(',');

/** The homography taking the unit square's corners (0,0), (1,0), (1,1), (0,1) to a, b, c, d (Heckbert), row major; null when the quad is degenerate. */
export function squareToQuad(a: Pt, b: Pt, c: Pt, d: Pt): number[] | null {
  const sx = a.x - b.x + c.x - d.x, sy = a.y - b.y + c.y - d.y;
  let g = 0, h = 0;
  if (Math.abs(sx) > 1e-9 || Math.abs(sy) > 1e-9) {
    const dx1 = b.x - c.x, dx2 = d.x - c.x, dy1 = b.y - c.y, dy2 = d.y - c.y, den = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(den) < 1e-12) return null;
    g = (sx * dy2 - dx2 * sy) / den; h = (dx1 * sy - sx * dy1) / den;
  }
  return [b.x - a.x + g * b.x, d.x - a.x + h * d.x, a.x, b.y - a.y + g * b.y, d.y - a.y + h * d.y, a.y, g, h, 1];
}
function inv3(m: number[]): number[] | null {
  const [a, b, c, d, e, f, g, h, i] = m as [number, number, number, number, number, number, number, number, number];
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-18) return null;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}
function mul3(p: number[], q: number[]): number[] {
  const o: number[] = [];
  for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) o.push(p[3 * r]! * q[k]! + p[3 * r + 1]! * q[3 + k]! + p[3 * r + 2]! * q[6 + k]!);
  return o;
}

/** Whether captions' boxes, carried by `ride`, still stand in the view and off every wall (the cheap judgement a pure pan needs: the words keep their places while they hold). */
export function boxesFit(items: Iterable<{ ax: number; ay: number; dx: number; dy: number; w: number; h: number }>, ride: (x: number, y: number, out: Pt) => Pt, view: Box, walls: readonly Box[]): boolean {
  const p = { x: 0, y: 0 };
  for (const it of items) {
    ride(it.ax, it.ay, p);
    const x0 = p.x + it.dx, y0 = p.y + it.dy, x1 = x0 + it.w, y1 = y0 + it.h;
    if (x0 < view.x0 || y0 < view.y0 || x1 > view.x1 || y1 > view.y1) return false;
    for (const w of walls) if (x0 < w.x1 && x1 > w.x0 && y0 < w.y1 && y1 > w.y0) return false;
  }
  return true;
}

/** A label's room (2D roomFade): 1 while its box stands clear of every card and inside the view, 0 once it touches one; eased over FADE.roomMs, with the air a label needs to come back (FADE.roomAir).
 *  The one rule for every label that rides the picture (the Anatomy's, the Circuit's, the Lobule's): a caption carried under a card or past the edge fades out whole, and is never seen cut. */
export class RoomFade {
  private readonly m = new Map<string, number>();
  of(id: string, box: Box, view: Box, blockers: readonly Box[], dt: number): number {
    const was = this.m.get(id);
    const air = (was ?? 1) >= 0.5 ? 0 : FADE.roomAir;
    let ok = box.x0 >= view.x0 + air && box.y0 >= view.y0 + air && box.x1 <= view.x1 - air && box.y1 <= view.y1 - air;
    if (ok) for (const b of blockers) if (box.x0 < b.x1 + air && box.x1 > b.x0 - air && box.y0 < b.y1 + air && box.y1 > b.y0 - air) { ok = false; break; }
    const t = ok ? 1 : 0;
    if (was === undefined) { this.m.set(id, t); return t; }   // (first drawn: as it stands; its own fade in does the rest)
    const a = t > was ? Math.min(1, was + dt / FADE.roomMs) : t < was ? Math.max(0, was - dt / FADE.roomMs) : was;
    this.m.set(id, a);
    return a;
  }
  /** Forget the labels not in `keep` (they start again as they stand when they come back). */
  prune(keep: { has(id: string): boolean }): void { for (const id of this.m.keys()) if (!keep.has(id)) this.m.delete(id); }
  clear(): void { this.m.clear(); }
}
