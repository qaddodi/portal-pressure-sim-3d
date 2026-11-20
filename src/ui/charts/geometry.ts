// Shapes to triangles. Pure and allocation-light; the GL renderer uploads what this returns. Every vertex is x, y, then the colour premultiplied by its alpha.
import type { Rgba } from './colour.ts';
import type { Frame, Pen, Shape } from './scene.ts';

export const FLOATS = 6;

export type Op =
  | { op: 'draw'; first: number; count: number }
  | { op: 'clip'; first: number; count: number }
  | { op: 'unclip' };

export interface Mesh { verts: Float32Array; ops: Op[]; triangles: number }

class Out {
  buf = new Float32Array(4096);
  n = 0;
  grow(extra: number) {
    if ((this.n + extra) * FLOATS <= this.buf.length) return;
    let len = this.buf.length;
    while ((this.n + extra) * FLOATS > len) len *= 2;
    const b = new Float32Array(len);
    b.set(this.buf.subarray(0, this.n * FLOATS));
    this.buf = b;
  }
  v(x: number, y: number, c: Rgba) {
    const o = this.n * FLOATS, b = this.buf, a = c[3];
    b[o] = x; b[o + 1] = y; b[o + 2] = c[0] * a; b[o + 3] = c[1] * a; b[o + 4] = c[2] * a; b[o + 5] = a;
    this.n++;
  }
  tri(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, c: Rgba) {
    this.grow(3);
    this.v(ax, ay, c); this.v(bx, by, c); this.v(cx, cy, c);
  }
}

/** Points on an arc, as [x, y, …] (angles in radians, screen y down), step by about `px` px of arc. */
export function arcPoints(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, px = 3): number[] {
  const len = Math.abs(a1 - a0) * Math.max(rx, ry);
  const n = Math.max(2, Math.ceil(len / px));
  const out: number[] = [];
  for (let i = 0; i <= n; i++) { const a = a0 + ((a1 - a0) * i) / n; out.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry); }
  return out;
}

/** A rounded rectangle's outline, clockwise from the top left corner's end. */
export function roundRectPoints(x: number, y: number, w: number, h: number, r: number): number[] {
  const R = Math.max(0, Math.min(r, w / 2, h / 2));
  if (R < 0.01) return [x, y, x + w, y, x + w, y + h, x, y + h];
  const P = Math.PI;
  return [
    ...arcPoints(x + w - R, y + R, R, R, -P / 2, 0), ...arcPoints(x + w - R, y + h - R, R, R, 0, P / 2),
    ...arcPoints(x + R, y + h - R, R, R, P / 2, P), ...arcPoints(x + R, y + R, R, R, P, (3 * P) / 2),
  ];
}

const dedupe = (pts: readonly number[], closed: boolean): number[] => {
  const o: number[] = [];
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i]!, y = pts[i + 1]!;
    if (o.length && Math.abs(o[o.length - 2]! - x) < 1e-6 && Math.abs(o[o.length - 1]! - y) < 1e-6) continue;
    o.push(x, y);
  }
  if (closed && o.length >= 4 && Math.abs(o[0]! - o[o.length - 2]!) < 1e-6 && Math.abs(o[1]! - o[o.length - 1]!) < 1e-6) o.length -= 2;
  return o;
};

/** A polyline cut into dashes (each its own open polyline). */
export function dashPolyline(pts: readonly number[], dash: readonly number[], closed: boolean): number[][] {
  const p = closed ? [...pts, pts[0]!, pts[1]!] : [...pts];
  const pattern = dash.length % 2 ? [...dash, ...dash] : [...dash];
  const total = pattern.reduce((a, b) => a + b, 0);
  if (!(total > 0)) return [p];
  const runs: number[][] = [];
  let at = 0, on = true, left = pattern[0]!, cur: number[] = [p[0]!, p[1]!];
  for (let i = 0; i + 3 < p.length + 0; i += 2) {
    let x0 = p[i]!, y0 = p[i + 1]!;
    const x1 = p[i + 2]!, y1 = p[i + 3]!;
    let seg = Math.hypot(x1 - x0, y1 - y0);
    if (seg === 0) continue;
    const dx = (x1 - x0) / seg, dy = (y1 - y0) / seg;
    while (seg > left + 1e-9) {
      x0 += dx * left; y0 += dy * left; seg -= left;
      if (on) { cur.push(x0, y0); runs.push(cur); cur = []; } else cur = [x0, y0];
      on = !on; at = (at + 1) % pattern.length; left = pattern[at]!;
      if (left <= 0) { left = 1e-6; }
    }
    left -= seg;
    if (on) cur.push(x1, y1);
  }
  if (on && cur.length >= 4) runs.push(cur);
  return runs;
}

/** Stroke a polyline as triangles: miter joins (bevel past a limit of 4), butt or round caps. Segments never overlap, so a translucent pen stays even. */
export function strokePolyline(out: Out, raw: readonly number[], pen: Pen, closed: boolean): void {
  const c = pen.color;
  if (c[3] <= 0 || pen.w <= 0) return;
  const pts = dedupe(raw, closed);
  const n = pts.length / 2;
  const hw = pen.w / 2;
  if (n < 2) { if (n === 1 && pen.cap === 'round') fan(out, pts[0]!, pts[1]!, hw, c); return; }
  const segs = closed ? n : n - 1;
  const dx: number[] = [], dy: number[] = [];
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    const ex = pts[j * 2]! - pts[i * 2]!, ey = pts[j * 2 + 1]! - pts[i * 2 + 1]!, l = Math.hypot(ex, ey) || 1;
    dx.push(ex / l); dy.push(ey / l);
  }
  // for each vertex: the two points of its end of the incoming segment and of its start of the outgoing one
  const inA: number[] = [], inB: number[] = [], outA: number[] = [], outB: number[] = [];
  const bevel: boolean[] = [];
  for (let i = 0; i < n; i++) {
    const px = pts[i * 2]!, py = pts[i * 2 + 1]!;
    const hasIn = closed || i > 0, hasOut = closed || i < n - 1;
    const si = (i - 1 + segs) % segs, so = i % segs;
    const n1x = hasOut ? -dy[so]! : 0, n1y = hasOut ? dx[so]! : 0;
    const n0x = hasIn ? -dy[si]! : n1x, n0y = hasIn ? dx[si]! : n1y;
    const m1x = hasOut ? n1x : n0x, m1y = hasOut ? n1y : n0y;
    let mx = n0x + m1x, my = n0y + m1y;
    const ml = Math.hypot(mx, my);
    let isBevel = false;
    if (hasIn && hasOut && ml > 1e-6) {
      mx /= ml; my /= ml;
      const k = mx * n0x + my * n0y;
      if (k > 0.25) {
        const len = hw / k;
        inA.push(px + mx * len, py + my * len); inB.push(px - mx * len, py - my * len);
        outA.push(px + mx * len, py + my * len); outB.push(px - mx * len, py - my * len);
      } else isBevel = true;
    } else if (hasIn && hasOut) isBevel = true;
    else {
      const sx = hasIn ? n0x : m1x, sy = hasIn ? n0y : m1y;
      inA.push(px + sx * hw, py + sy * hw); inB.push(px - sx * hw, py - sy * hw);
      outA.push(px + sx * hw, py + sy * hw); outB.push(px - sx * hw, py - sy * hw);
    }
    if (isBevel) {
      inA.push(px + n0x * hw, py + n0y * hw); inB.push(px - n0x * hw, py - n0y * hw);
      outA.push(px + m1x * hw, py + m1y * hw); outB.push(px - m1x * hw, py - m1y * hw);
      // the wedge on the outside of the turn
      const cross = dx[si]! * dy[so]! - dy[si]! * dx[so]!;
      if (Math.abs(cross) > 1e-9 || dx[si]! * dx[so]! + dy[si]! * dy[so]! < 0) {
        const s = cross > 0 ? -1 : 1;
        if (pen.join === 'round') arcWedge(out, px, py, hw, Math.atan2(s * n0y, s * n0x), Math.atan2(s * m1y, s * m1x), c);
        else out.tri(px, py, px + s * n0x * hw, py + s * n0y * hw, px + s * m1x * hw, py + s * m1y * hw, c);
      }
    }
    bevel.push(isBevel);
  }
  for (let i = 0; i < segs; i++) {
    const j = (i + 1) % n;
    const ax = outA[i * 2]!, ay = outA[i * 2 + 1]!, bx = outB[i * 2]!, by = outB[i * 2 + 1]!;
    const cx = inA[j * 2]!, cy = inA[j * 2 + 1]!, ex = inB[j * 2]!, ey = inB[j * 2 + 1]!;
    out.tri(ax, ay, bx, by, cx, cy, c);
    out.tri(bx, by, ex, ey, cx, cy, c);
  }
  if (!closed && pen.cap === 'round') {
    const a0 = Math.atan2(dy[0]!, dx[0]!) + Math.PI, a1 = Math.atan2(dy[segs - 1]!, dx[segs - 1]!);
    arcWedge(out, pts[0]!, pts[1]!, hw, a0 - Math.PI / 2, a0 + Math.PI / 2, c);
    arcWedge(out, pts[(n - 1) * 2]!, pts[(n - 1) * 2 + 1]!, hw, a1 - Math.PI / 2, a1 + Math.PI / 2, c);
  }
}

/** A pie from angle a0 to a1 (shortest way), as triangles. */
function arcWedge(out: Out, cx: number, cy: number, r: number, a0: number, a1: number, c: Rgba) {
  let d = a1 - a0;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  const steps = Math.max(2, Math.ceil((Math.abs(d) * r) / 2));
  let px = cx + Math.cos(a0) * r, py = cy + Math.sin(a0) * r;
  for (let i = 1; i <= steps; i++) {
    const a = a0 + (d * i) / steps, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    out.tri(cx, cy, px, py, x, y, c);
    px = x; py = y;
  }
}
function fan(out: Out, cx: number, cy: number, r: number, c: Rgba) { arcWedge(out, cx, cy, r, 0, Math.PI, c); arcWedge(out, cx, cy, r, Math.PI, 2 * Math.PI, c); }

/** Fill a simple polygon (any winding) by ear clipping. */
export function fillPolygon(out: Out, raw: readonly number[], c: Rgba): void {
  if (c[3] <= 0) return;
  const p = dedupe(raw, true);
  const n = p.length / 2;
  if (n < 3) return;
  let area = 0;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; area += p[i * 2]! * p[j * 2 + 1]! - p[j * 2]! * p[i * 2 + 1]!; }
  const idx = Array.from({ length: n }, (_, i) => i);
  if (area < 0) idx.reverse();
  const X = (i: number) => p[i * 2]!, Y = (i: number) => p[i * 2 + 1]!;
  let guard = n * n + 10;
  while (idx.length > 3 && guard-- > 0) {
    let clipped = false;
    for (let k = 0; k < idx.length; k++) {
      const a = idx[(k + idx.length - 1) % idx.length]!, b = idx[k]!, d = idx[(k + 1) % idx.length]!;
      const cr = (X(b) - X(a)) * (Y(d) - Y(a)) - (Y(b) - Y(a)) * (X(d) - X(a));
      if (cr <= 1e-9) continue;
      let inside = false;
      for (const q of idx) {
        if (q === a || q === b || q === d) continue;
        const s1 = (X(b) - X(a)) * (Y(q) - Y(a)) - (Y(b) - Y(a)) * (X(q) - X(a));
        const s2 = (X(d) - X(b)) * (Y(q) - Y(b)) - (Y(d) - Y(b)) * (X(q) - X(b));
        const s3 = (X(a) - X(d)) * (Y(q) - Y(d)) - (Y(a) - Y(d)) * (X(q) - X(d));
        if (s1 >= -1e-9 && s2 >= -1e-9 && s3 >= -1e-9) { inside = true; break; }
      }
      if (inside) continue;
      out.tri(X(a), Y(a), X(b), Y(b), X(d), Y(d), c);
      idx.splice(k, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;   // (a degenerate polygon: what is left is not drawn)
  }
  if (idx.length === 3) out.tri(X(idx[0]!), Y(idx[0]!), X(idx[1]!), Y(idx[1]!), X(idx[2]!), Y(idx[2]!), c);
}

/** A convex outline filled as a fan from its centre (rounded rectangles, circles). */
function fillConvex(out: Out, pts: readonly number[], c: Rgba) {
  if (c[3] <= 0) return;
  const n = pts.length / 2;
  let cx = 0, cy = 0;
  for (let i = 0; i < n; i++) { cx += pts[i * 2]!; cy += pts[i * 2 + 1]!; }
  cx /= n; cy /= n;
  for (let i = 0; i < n; i++) { const j = (i + 1) % n; out.tri(cx, cy, pts[i * 2]!, pts[i * 2 + 1]!, pts[j * 2]!, pts[j * 2 + 1]!, c); }
}

function strokeAny(out: Out, pts: readonly number[], pen: Pen, closed: boolean) {
  if (pen.dash && pen.dash.length && pen.dash.some((d) => d > 0)) { for (const run of dashPolyline(dedupe(pts, closed), pen.dash, closed)) strokePolyline(out, run, pen, false); }
  else strokePolyline(out, pts, pen, closed);
}

/** A frame's shapes as one triangle list plus the clip operations between its runs. Text is not here (the text layer writes it). */
export function tessellate(frame: Frame | readonly Shape[]): Mesh {
  const shapes = Array.isArray(frame) ? (frame as readonly Shape[]) : (frame as Frame).shapes;
  const out = new Out();
  const ops: Op[] = [];
  let runStart = 0;
  const flush = () => { if (out.n > runStart) { ops.push({ op: 'draw', first: runStart, count: out.n - runStart }); runStart = out.n; } };
  for (const s of shapes) {
    switch (s.k) {
      case 'rect': {
        const pts = roundRectPoints(s.x, s.y, s.w, s.h, s.r ?? 0);
        if (s.fill) fillConvex(out, pts, s.fill);
        if (s.pen) strokeAny(out, pts, s.pen, true);
        break;
      }
      case 'line': strokeAny(out, [s.x1, s.y1, s.x2, s.y2], s.pen, false); break;
      case 'path':
        if (s.fill && s.closed) fillPolygon(out, s.pts, s.fill);
        if (s.pen) strokeAny(out, s.pts, s.pen, !!s.closed);
        break;
      case 'band': {
        const m = Math.min(s.top.length, s.bottom.length) / 2;
        for (let i = 0; i + 1 < m; i++) {
          const ax = s.top[i * 2]!, ay = s.top[i * 2 + 1]!, bx = s.top[i * 2 + 2]!, by = s.top[i * 2 + 3]!;
          const cx = s.bottom[i * 2]!, cy = s.bottom[i * 2 + 1]!, dx = s.bottom[i * 2 + 2]!, dy = s.bottom[i * 2 + 3]!;
          out.tri(ax, ay, bx, by, cx, cy, s.fill); out.tri(bx, by, dx, dy, cx, cy, s.fill);
        }
        break;
      }
      case 'circle': {
        const pts = arcPoints(s.cx, s.cy, s.r, s.r, 0, Math.PI * 2, 2.5);
        pts.length -= 2;
        if (s.fill) fillConvex(out, pts, s.fill);
        if (s.pen) strokeAny(out, pts, s.pen, true);
        break;
      }
      case 'radial': {
        const n = s.stops.length;
        if (n < 2) break;
        const rMax = s.stops[n - 1]!.r, seg = Math.max(24, Math.min(160, Math.ceil((Math.PI * 2 * rMax) / 3)));
        for (let k = 0; k + 1 < n; k++) {
          const a = s.stops[k]!, b = s.stops[k + 1]!;
          if (a.c[3] <= 0 && b.c[3] <= 0) continue;
          out.grow(seg * 6);
          for (let j = 0; j < seg; j++) {
            const t0 = (j / seg) * Math.PI * 2, t1 = ((j + 1) / seg) * Math.PI * 2, c0 = Math.cos(t0), s0 = Math.sin(t0), c1 = Math.cos(t1), s1 = Math.sin(t1);
            const ax = s.cx + c0 * a.r, ay = s.cy + s0 * a.r, bx = s.cx + c1 * a.r, by = s.cy + s1 * a.r, cx2 = s.cx + c0 * b.r, cy2 = s.cy + s0 * b.r, dx = s.cx + c1 * b.r, dy = s.cy + s1 * b.r;
            out.v(ax, ay, a.c); out.v(bx, by, a.c); out.v(cx2, cy2, b.c);
            out.v(bx, by, a.c); out.v(dx, dy, b.c); out.v(cx2, cy2, b.c);
          }
        }
        break;
      }
      case 'grid': {
        out.grow((s.rows - 1) * (s.cols - 1) * 6);
        for (let r = 0; r + 1 < s.rows; r++) {
          for (let c = 0; c + 1 < s.cols; c++) {
            const i00 = r * s.cols + c, i01 = i00 + 1, i10 = i00 + s.cols, i11 = i10 + 1;
            const P = (i: number, q: Rgba) => out.v(s.pts[i * 2]!, s.pts[i * 2 + 1]!, q);
            P(i00, s.colors[i00]!); P(i01, s.colors[i01]!); P(i10, s.colors[i10]!);
            P(i01, s.colors[i01]!); P(i11, s.colors[i11]!); P(i10, s.colors[i10]!);
          }
        }
        break;
      }
      case 'clip': {
        flush();
        fillConvex(out, roundRectPoints(s.x, s.y, s.w, s.h, s.r ?? 0), [0, 0, 0, 1]);
        ops.push({ op: 'clip', first: runStart, count: out.n - runStart });
        runStart = out.n;
        break;
      }
      case 'unclip': flush(); ops.push({ op: 'unclip' }); break;
      case 'text': break;
    }
  }
  flush();
  return { verts: out.buf.subarray(0, out.n * FLOATS), ops, triangles: out.n / 3 };
}

/** The axis-aligned box of a mesh's vertices (for tests: nothing may be drawn outside the chart's box by more than a pen's width). */
export function meshBounds(m: Mesh): { x0: number; y0: number; x1: number; y1: number } | null {
  if (!m.verts.length) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < m.verts.length; i += FLOATS) { x0 = Math.min(x0, m.verts[i]!); x1 = Math.max(x1, m.verts[i]!); y0 = Math.min(y0, m.verts[i + 1]!); y1 = Math.max(y1, m.verts[i + 1]!); }
  return { x0, y0, x1, y1 };
}
