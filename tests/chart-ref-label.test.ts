// A reference mark's words ("EVL alone 6.5 mm") never print over another word of the flow-time chart (capture 3531bdfa A-D10: on 07.9 the reference label sat on "16.4 mmHg"; also on an axis number).
// The label stood at a fixed place beside its tick whatever else stood there; it now takes the row beside the tick, then the rows round it, then over the tick at the plot's right end, the least-covered place
// when none is clear (flowtime/frame.ts). Swept over made-up lines, three card widths, the head at the end and half way, and a reference at every level of the plot. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flowTimeFrame } from '../src/ui/charts/flowtime/frame.ts';
import { flowTimeSeries } from '../src/ui/charts/flowtime/model.ts';
import { measure } from '../src/ui/charts/measure.ts';
import { ctxOf } from './charts-helpers.ts';
import type { TextShape } from '../src/ui/charts/scene.ts';

const trail = (days: number, a: [number, number], b: [number, number]) => Array.from({ length: 61 }, (_, i) => { const t = i / 60, e = t * t * (3 - 2 * t); return [days * t, a[0] + (a[1] - a[0]) * e, b[0] + (b[1] - b[0]) * e]; });
const box = (t: TextShape) => {
  const w = measure(t.s, t.size, t.weight ?? 500), x0 = t.anchor === 'middle' ? t.x - w / 2 : t.anchor === 'end' ? t.x - w : t.x, y0 = t.baseline === 'top' ? t.y : t.y - t.size * 0.8;
  return { x0, y0, x1: x0 + w, y1: y0 + t.size };
};

function overlaps(width: number): string[] {
  const out: string[] = [];
  for (const [a, b] of [[[14, 9], [22, 11]], [[16.4, 12], [6.5, 5]], [[9, 9], [3, 3]]] as [number, number][][]) {
    const ser = flowTimeSeries(trail(180, a!, b!), 'days', ['hvpg', 'varix'])!;
    for (const m of [ser.ax.end, (ser.ax.from + ser.ax.end) / 2]) {
      for (let v = 4; v <= 20; v += 1.5) {
        const f = flowTimeFrame({ ser, clock: 'days', keys: ['hvpg', 'varix'], refs: [{ slot: 'pv', v, text: 'EVL alone' }] }, m, ctxOf('light', width)).frame;
        const words = f.shapes.filter((s): s is TextShape => s.k === 'text');
        const ref = words.find((t) => t.s.startsWith('EVL alone'))!;
        const r = box(ref);
        for (const t of words) {
          if (t === ref) continue;
          const q = box(t), ox = Math.min(r.x1, q.x1) - Math.max(r.x0, q.x0), oy = Math.min(r.y1, q.y1) - Math.max(r.y0, q.y0);
          if (ox > 1 && oy > 2) out.push(`${width}px head ${m.toFixed(0)} ref ${v}: "${ref.s}" over "${t.s}"`);
        }
      }
    }
  }
  return out;
}

test('a reference label stands clear of every other word at a phone\'s width and up', () => {
  assert.deepEqual(overlaps(390), []);
  assert.deepEqual(overlaps(640), []);
});

test('on the narrowest card (300 px) a few references still meet a word; the count only goes down (it was 104 of 198 before)', () => {
  const n = overlaps(300).length;
  assert.ok(n <= 7, `${n} overlaps at 300 px`);
});
