// The course (one reading over the days after an event, with what is done after it) as a frame (2D: tool-course.js createCourse build(); looks: chart-looks/time.js 'co.z', 'cv.*', 'time.*').
// The layout and the word placing are the 2D functions (course-pure.generated.js: compose); here their numbers become shapes.
import type { ChartCtx } from '../Chart.tsx';
import { look, type Look } from '../looks.ts';
import { fitHeight, type Frame, type Shape, type TextShape } from '../scene.ts';
import { measure } from '../measure.ts';
import * as C from './course-pure.generated.js';
import { curveHeight } from './frame.ts';
import { heldToRoom } from '../profile/model.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
/** The 2D tool object of a course: `{ kind: 'course', reading, from, event, wait, after, then, words }`. */
export type CourseTool = Record<string, Any>;
export interface CourseSpec { tool: CourseTool; /** the series from courseSeries(), or null while the days are being worked out (the zones, numbers and axes show; the lines come later) */ ser: Any | null; height?: number; /** the room the data card leaves the chart, px (--pz-room): never taller than it */ room?: number }

const H = { host: 'curve' };
const tokOf = (v: string) => v.replace(/^--/, '');
const HEAD_C = '--text-2';
const mw = (t: string, f: number, bold = false) => measure(t, f, bold ? 700 : 500);

/** A path string of M, L and C commands as a polyline (each cubic cut in `n` steps). */
export function flattenPath(d: string, n = 14): number[] {
  const out: number[] = [];
  const toks = d.match(/[MLC]|-?\d+(?:\.\d+)?/g) ?? [];
  let cmd = '', cur: [number, number] = [0, 0];
  for (let i = 0; i < toks.length;) {
    const tk = toks[i]!;
    if (/[MLC]/.test(tk)) { cmd = tk; i++; continue; }
    if (cmd === 'M' || cmd === 'L') { cur = [+toks[i]!, +toks[i + 1]!]; out.push(cur[0], cur[1]); i += 2; }
    else {
      const [x1, y1, x2, y2, x3, y3] = toks.slice(i, i + 6).map(Number) as [number, number, number, number, number, number];
      for (let k = 1; k <= n; k++) {
        const u = k / n, v = 1 - u;
        out.push(v * v * v * cur[0] + 3 * v * v * u * x1 + 3 * v * u * u * x2 + u * u * u * x3, v * v * v * cur[1] + 3 * v * v * u * y1 + 3 * v * u * u * y2 + u * u * u * y3);
      }
      cur = [x3, y3]; i += 6;
    }
  }
  return out;
}

/** A line's end value as printed on the chart: the number and its unit (liters are "L" here, as the axis says). */
export const endText = (v: number, unit: string): string => `${v < 0.05 ? '0' : v.toFixed(1)} ${unit}`;

export function courseFrame(spec: CourseSpec, c: ChartCtx): { frame: Frame; G: Any; labels: Any } {
  const f = c.type.sm, w = Math.max(160, c.w), own = spec.height ?? fitHeight(curveHeight(w, f), c), h = Math.round(Math.max(8 * f, heldToRoom(own, spec.room, f)!));
  const co = C.courseOf(spec.tool), ser = spec.ser;
  const { G, labels, zoneNames } = C.compose(w, h, f, co, ser) as Any;
  const { L, R, B, X, Y } = G, r = Math.max(3.5, 0.3 * f);
  const lk = (key: string, state: Record<string, unknown> = {}, tone?: string): Look => look(c, H, key, state, tone ? { c: tokOf(tone) } : {});
  const shapes: Shape[] = [];
  const say = (x: number, y: number, s: string, l: Look, o: Partial<TextShape> = {}) => {
    if (s) shapes.push({ k: 'text', x, y, s, size: l.size ?? f, weight: l.weight, color: l.fill!, ...(l.halo ? { halo: l.halo } : {}), ...o });
  };
  const pen = (l: Look) => ({ color: l.stroke!, w: l.width ?? 1, ...(l.dash && l.dash.length ? { dash: l.dash } : {}), ...(l.cap ? { cap: l.cap } : {}), ...(l.join ? { join: l.join } : {}) });

  // the panel, and the zones from the top of the scale to the baseline, clipped to its corners
  const py = G.py, ph = B + G.foot - py, pr = Math.max(0, Math.min(10, w / 4, ph / 4));
  shapes.push({ k: 'rect', x: 0, y: py, w, h: ph, r: pr, fill: lk('plot.bg').fill });
  shapes.push({ k: 'clip', x: 0, y: py, w, h: ph, r: pr });
  for (const z of G.zones) shapes.push({ k: 'rect', x: 0, y: Y(z.to), w, h: Y(z.from) - Y(z.to), fill: lk('co.z', { rate: z.rate, deep: z.deep ? '1' : null }).fill });
  shapes.push({ k: 'unclip' });
  // each zone's name where the lines leave room
  for (const q of zoneNames) if (q.p) say(q.p.x, q.p.y, q.zone.name, lk('cv.tc', { tc: q.zone.rate }), { anchor: q.p.anchor });
  // the gridlines and the numbers on the cut-offs
  for (const q of G.ticks) {
    if (q.v) {
      const g = lk('plot.grid.line', { cut: false });
      shapes.push({ k: 'line', x1: L, x2: R, y1: Y(q.v), y2: Y(q.v), pen: { color: g.stroke!, w: g.width ?? 1 } });
      shapes.push({ k: 'line', x1: L, x2: L + 0.9 * f, y1: Y(q.v), y2: Y(q.v), pen: pen(lk('cv.stub', { tc: q.rate })) });
      say(G.tickX, Y(q.v) + 0.35 * f, q.text, lk('cv.tc', { tc: q.rate }), { anchor: 'end' });
    } else say(G.tickX, Y(q.v) + 0.35 * f, q.text, lk('time.grid.text', {}, 'text-3'), { anchor: 'end' });
  }
  // the axis
  const ax = lk('time.axis.line');
  shapes.push({ k: 'line', x1: L, x2: R, y1: B, y2: B, pen: { color: ax.stroke!, w: ax.width ?? 1 } });
  for (const q of G.xt) say(X(q.d), B + 1.25 * f, q.text, lk('time.tk'), { anchor: 'middle' });
  say((L + R) / 2, B + 2.6 * f, co.words.axis, lk('cv.ax'), { anchor: 'middle' });
  // the caption: the reading and its unit
  const lab: string = co.words.label, comma = lab.indexOf(','), name = comma < 0 ? lab : lab.slice(0, comma);
  const ky = 0.75 * f + 0.36 * f;
  say(0, ky, name, lk('time.key.text', {}, '--text-2'));
  if (comma >= 0) say(mw(name, f, true), ky, lab.slice(comma), { ...lk('time.key.unit'), size: f });
  // the key row, when the lines' names would not stand clear at their ends
  if (G.keyRow) for (const k of G.keys) {
    const y = 2.25 * f;
    shapes.push({ k: 'line', x1: k.x, x2: k.x + 16, y1: y, y2: y, pen: pen(lk('time.key.line', {}, k.c)) });
    say(k.x + 22, y + 0.36 * f, k.name, lk('time.key.text', {}, k.c));
  }
  let label = `${co.words.label}: calculating`;
  if (ser) {
    const xd = X(-G.lead), yd = Y(ser.before), headPx: number[][] = ser.head.map(([d, v]: number[]) => [X(d), Y(v)]);
    const tailPx: number[][][] = ser.tails.map((q: Any) => q.pts.map(([d, v]: number[]) => [X(d), Y(v)]));
    if (labels.start) {
      const at = lk('cv.at');
      shapes.push({ k: 'line', x1: X(ser.wait), x2: X(ser.wait), y1: labels.vTop, y2: B, pen: pen(at) });
    }
    const word = (text: string, p: Any, tone?: string, key = 'cv.dname') => { if (p) say(p.x, p.y, text, lk(key, {}, tone), { anchor: p.anchor }); };
    word(co.words.start, labels.start); word(co.words.before, labels.before); word(co.words.rise, labels.rise);
    const hd = `M${xd.toFixed(1)} ${yd.toFixed(1)}L${headPx[0]![0]!.toFixed(1)} ${yd.toFixed(1)}L${headPx[0]![0]!.toFixed(1)} ${headPx[0]![1]!.toFixed(1)}${C.smoothPath(headPx, true).replace(/^L[^C]*/, '')}`;
    const line = (pts: number[], tone: string) => shapes.push({ k: 'path', pts, pen: pen(lk('cv.line', {}, tone)) });
    line(flattenPath(hd), HEAD_C);
    ser.tails.forEach((q: Any, j: number) => line(flattenPath(C.smoothPath(tailPx[j]!)), q.c));
    const dot = (x: number, y: number, tone: string) => { const d = lk('cv.dot', {}, tone); shapes.push({ k: 'circle', cx: x, cy: y, r, fill: d.fill, pen: { color: d.stroke!, w: d.width ?? 1 } }); };
    dot(xd, yd, HEAD_C);
    ser.tails.forEach((q: Any, j: number) => dot(tailPx[j]!.at(-1)![0]!, tailPx[j]!.at(-1)![1]!, q.c));
    ser.tails.forEach((q: Any, j: number) => word(q.name, labels.tails[j], q.c, 'cv.name'));
    // where each line ends, its number (Landmark 12, capture 52ef8e63: the dots stood at the end of the weeks with no value). With the names in the key row they are free to stand beside their dots: the upper line's
    // above its end, the lower line's below, both just left of the dot.
    if (G.keyRow) {
      const ends = ser.tails.map((q: Any, j: number) => ({ j, x: tailPx[j]!.at(-1)![0]!, y: tailPx[j]!.at(-1)![1]!, v: q.pts.at(-1)[1] as number, c: q.c as string }));
      const top = Math.min(...ends.map((e: Any) => e.y as number));
      for (const e of ends) say(e.x - r - 5, e.y + (e.y === top ? -0.7 : 1.35) * f, endText(e.v, ser.unit), lk('cv.dname', {}, e.c), { anchor: 'end' });
    }
    const fmt = (v: number) => `${v < 0.05 ? '0' : v.toFixed(1)} ${ser.unit === 'L' ? 'liters' : ser.unit}`;
    label = `${co.words.label}: ${co.words.before ? `${co.words.before.toLowerCase()}, ` : ''}${fmt(ser.before)}; after the ${co.words.event.toLowerCase()} ${fmt(ser.head[0][1])}, `
      + `${fmt(ser.head.at(-1)[1])} at ${ser.wait} days; ${ser.tails.map((q: Any) => `${q.name} ${fmt(q.pts.at(-1)[1])} at ${ser.days} days`).join('; ')}`;
  }
  return { frame: { w, h, shapes, label, ...(own > h + 0.5 ? { want: Math.round(own) } : null) }, G, labels };
}
