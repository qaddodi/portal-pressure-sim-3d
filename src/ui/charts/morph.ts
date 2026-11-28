// Blend two frames of the same chart: pieces of the same kind in the same place in the list glide (position, size, colour); a frame whose pieces do not
// pair up dissolves into the next one instead (nothing pops). Pure, so a test can read it.
import type { Rgba } from './colour.ts';
import type { Frame, Pen, Shape, TextShape } from './scene.ts';

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpC = (a: Rgba, b: Rgba, t: number): Rgba => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t), lerp(a[3], b[3], t)];
const lerpArr = (a: readonly number[], b: readonly number[], t: number) => a.map((v, i) => lerp(v, b[i]!, t));

function pairs(a: Shape, b: Shape): boolean {
  if (a.k !== b.k) return false;
  switch (a.k) {
    case 'path': { const q = b as typeof a; return a.pts.length === q.pts.length && !!a.closed === !!q.closed; }
    case 'band': { const q = b as typeof a; return a.top.length === q.top.length && a.bottom.length === q.bottom.length; }
    case 'text': return true;
    default: return true;
  }
}

/** Whether every piece of a pairs with the piece of b at the same place. */
export function compatible(a: Frame, b: Frame): boolean {
  if (a.shapes.length !== b.shapes.length) return false;
  for (let i = 0; i < a.shapes.length; i++) if (!pairs(a.shapes[i]!, b.shapes[i]!)) return false;
  return true;
}

function lerpPen(a: Pen | undefined, b: Pen | undefined, t: number): Pen | undefined {
  if (!a || !b) return t < 0.5 ? a : b;
  return { ...b, color: lerpC(a.color, b.color, t), w: lerp(a.w, b.w, t) };
}
function lerpFill(a: Rgba | undefined, b: Rgba | undefined, t: number): Rgba | undefined {
  if (!a && !b) return undefined;
  if (!a) return [b![0], b![1], b![2], b![3] * t];
  if (!b) return [a[0], a[1], a[2], a[3] * (1 - t)];
  return lerpC(a, b, t);
}

function lerpShape(a: Shape, b: Shape, t: number): Shape {
  switch (a.k) {
    case 'rect': { const q = b as typeof a; return { ...q, x: lerp(a.x, q.x, t), y: lerp(a.y, q.y, t), w: lerp(a.w, q.w, t), h: lerp(a.h, q.h, t), r: lerp(a.r ?? 0, q.r ?? 0, t), fill: lerpFill(a.fill, q.fill, t), pen: lerpPen(a.pen, q.pen, t) }; }
    case 'line': { const q = b as typeof a; return { ...q, x1: lerp(a.x1, q.x1, t), y1: lerp(a.y1, q.y1, t), x2: lerp(a.x2, q.x2, t), y2: lerp(a.y2, q.y2, t), pen: lerpPen(a.pen, q.pen, t)! }; }
    case 'path': { const q = b as typeof a; return { ...q, pts: lerpArr(a.pts, q.pts, t), fill: lerpFill(a.fill, q.fill, t), pen: lerpPen(a.pen, q.pen, t) }; }
    case 'band': { const q = b as typeof a; return { ...q, top: lerpArr(a.top, q.top, t), bottom: lerpArr(a.bottom, q.bottom, t), fill: lerpC(a.fill, q.fill, t) }; }
    case 'circle': { const q = b as typeof a; return { ...q, cx: lerp(a.cx, q.cx, t), cy: lerp(a.cy, q.cy, t), r: lerp(a.r, q.r, t), fill: lerpFill(a.fill, q.fill, t), pen: lerpPen(a.pen, q.pen, t) }; }
    case 'clip': { const q = b as typeof a; return { ...q, x: lerp(a.x, q.x, t), y: lerp(a.y, q.y, t), w: lerp(a.w, q.w, t), h: lerp(a.h, q.h, t), r: lerp(a.r ?? 0, q.r ?? 0, t) }; }
    case 'text': {
      const q = b as TextShape;
      // the words change at the middle; the letters stay where the new ones go
      return { ...q, s: t < 0.5 ? a.s : q.s, x: lerp(a.x, q.x, t), y: lerp(a.y, q.y, t), size: lerp(a.size, q.size, t), rot: a.rot === undefined && q.rot === undefined ? undefined : lerp(a.rot ?? 0, q.rot ?? 0, t), color: lerpC(a.color, q.color, t), alpha: lerp(a.alpha ?? 1, q.alpha ?? 1, t) };
    }
    default: return t < 0.5 ? a : b;
  }
}

const fadeOf = (s: Shape, k: number): Shape => {
  const f = (c: Rgba | undefined): Rgba | undefined => (c ? [c[0], c[1], c[2], c[3] * k] : c);
  switch (s.k) {
    case 'rect': return { ...s, fill: f(s.fill), pen: s.pen && { ...s.pen, color: f(s.pen.color)! } };
    case 'line': return { ...s, pen: { ...s.pen, color: f(s.pen.color)! } };
    case 'path': return { ...s, fill: f(s.fill), pen: s.pen && { ...s.pen, color: f(s.pen.color)! } };
    case 'band': return { ...s, fill: f(s.fill)! };
    case 'circle': return { ...s, fill: f(s.fill), pen: s.pen && { ...s.pen, color: f(s.pen.color)! } };
    case 'text': return { ...s, alpha: (s.alpha ?? 1) * k };
    default: return s;
  }
};

// Which pieces of two frames that do not pair are the same piece in both (the same kind, place, size and colour): they stay as they are, whole, for the whole blend. Only the pieces that really differ
// dissolve (the old ones out, the new ones in). Dissolving the two frames over each other dropped every unchanged label, line and legend
// to 75 % at the middle of the blend and back: a held card's words blinked before its new data showed (Mohammad, 28 Nov, Hyperdynamic 3 to 7).
// Worked out once per pair of frames, not per drawn frame.
interface Same { keepB: Set<number>; goneA: Set<number> }
const sames = new WeakMap<Frame, WeakMap<Frame, Same>>();
function sameOf(a: Frame, b: Frame): Same {
  let m = sames.get(a);
  if (!m) sames.set(a, (m = new WeakMap()));
  let r = m.get(b);
  if (r) return r;
  const pool = new Map<string, number[]>();
  a.shapes.forEach((s, i) => { const k = JSON.stringify(s); const l = pool.get(k); if (l) l.push(i); else pool.set(k, [i]); });
  const keepB = new Set<number>(), used = new Set<number>();
  b.shapes.forEach((s, i) => { const l = pool.get(JSON.stringify(s)); const j = l?.shift(); if (j !== undefined) { keepB.add(i); used.add(j); } });
  const goneA = new Set<number>();
  a.shapes.forEach((_, i) => { if (!used.has(i)) goneA.add(i); });
  m.set(b, (r = { keepB, goneA }));
  return r;
}

/** The frame t of the way from a to b (t in 0..1, already eased). */
export function blend(a: Frame, b: Frame, t: number): Frame {
  if (t <= 0) return a;
  if (t >= 1) return b;
  const w = lerp(a.w, b.w, t), h = lerp(a.h, b.h, t);
  if (compatible(a, b)) return { w, h, label: b.label, shapes: a.shapes.map((s, i) => lerpShape(s, b.shapes[i]!, t)) };
  // clips cannot be dissolved piece by piece: each side keeps its own clip pairs, the old one under the new one
  const clipped = a.shapes.some((s) => s.k === 'clip') || b.shapes.some((s) => s.k === 'clip');
  if (clipped) return { w, h, label: b.label, shapes: [...a.shapes.map((s) => fadeOf(s, 1 - t)), ...b.shapes.map((s) => fadeOf(s, t))] };
  const { keepB, goneA } = sameOf(a, b);
  return { w, h, label: b.label, shapes: [...a.shapes.flatMap((s, i) => (goneA.has(i) ? [fadeOf(s, 1 - t)] : [])), ...b.shapes.map((s, i) => (keepB.has(i) ? s : fadeOf(s, t)))] };
}
