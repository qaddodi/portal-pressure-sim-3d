// A chart laid out on time is never blended with the frame before it (beat-chart plan, B). blend() pairs the shapes by their place in the list; the EKG paper's upright lines are laid on time, so when a line
// leaves the left edge every line is paired with its neighbour and glides to the right, against the way the paper moves.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SampleFeed, CHANNELS } from '../src/ui/tests/feed.ts';
import { paletteOf } from '../src/ui/charts/palette.ts';
import { blend } from '../src/ui/charts/morph.ts';
import { glides } from '../src/ui/charts/painter.ts';
import type { Frame, LineShape } from '../src/ui/charts/scene.ts';
import { beatFrame } from '../src/ui/tests/slide/beat-frame.ts';
import { traceFrame } from '../src/ui/tests/trace/model.ts';
import { DopplerModel } from '../src/ui/tests/doppler/model.ts';
import { vitalsFrame } from '../src/ui/charts/vitals/model.ts';

function recorded(secs: number): SampleFeed {
  const f = new SampleFeed(), o: Record<string, number[]> = { t: [] };
  for (const k of CHANNELS) o[k] = [];
  const lv: Record<string, number> = { whvp: 20, RHV: 8, CONF: 21, hvpg: 12 };
  for (let i = 0; i < secs * 100; i++) {
    const t = i / 100, ph = (t / 0.8) % 1, b = Math.sin(2 * Math.PI * ph);
    o.t!.push(t); o.ph!.push(ph);
    for (const k of CHANNELS) if (k !== 'ph') o[k]!.push(k in lv ? lv[k]! + (k === 'hvpg' ? 0 : b) : 0);
  }
  f.adopt({ jump: false, samples: o } as never);
  return f;
}
const asRec = (f: SampleFeed) => ({ t: f.t, ch: f.ch, binT: f.binT, bin: f.bin, beats: f.beat.times, days: f.days, calm: (k: string) => f.calmOf(k) });
const NOW = { whvp: 20, fhvp: 8, pv: 21, hr: 72, hvpg: 12 };
const pal = paletteOf('light');
const beat = (f: SampleFeed, head: number, w = 356, h = 223): Frame => beatFrame({ rec: asRec(f) as never, head, now: NOW, before: null, ekg: true, noPv: false, headed: true }, { w, h, pal }).frame;

test('every frame laid out on time says so, and a frame that says so is never glided to', () => {
  const f = recorded(30);
  const frames: Record<string, Frame> = {
    beats: beat(f, 20),
    overTime: traceFrame(asRec(f) as never, { range: 'beats', chosen: new Set(['CONF', 'whvp', 'RHV'] as const), smooth: false, ekg: false, lane: true, head: 20, ends: {}, hvpg: 12, hr: 72 }, { w: 460, h: 250, pal, fs: 13 }).frame,
    minutes: traceFrame(asRec(f) as never, { range: 'minutes' as never, chosen: new Set(['CONF', 'whvp', 'RHV'] as const), smooth: false, ekg: false, lane: true, head: 20, ends: {}, hvpg: 12, hr: 72 }, { w: 460, h: 250, pal, fs: 13 }).frame,
    doppler: new DopplerModel().frameFor(400, 190, 1000, 'x'),
    vitals: vitalsFrame({ ids: ['hr'], cells: [{ id: 'hr', k: 'hr', title: 'HR', u: '/min', d: 0, v: 72, s: NaN, dia: NaN, bad: false } as never], strip: null }, 360, pal),
  };
  for (const [name, fr] of Object.entries(frames)) {
    assert.equal(fr.scrolls, true, `${name} frame carries scrolls`);
    assert.equal(glides(fr, fr, true, false), false, `${name}: no glide`);
  }
  // a frame that does not scroll glides as before, unless motion is reduced or nothing is shown yet
  const still: Frame = { w: 10, h: 10, shapes: [], label: '' };
  assert.equal(glides(still, still, true, false), true);
  assert.equal(glides(still, still, true, true), false);
  assert.equal(glides(null, still, true, false), false);
  assert.equal(glides(still, still, false, false), false);
});

test('the fault: blended by list position, the paper glides to the right when a line leaves at the left', () => {
  const f = recorded(30);
  let proved = 0;
  for (let head = 20; head < 20.6 && !proved; head += 0.01) {
    const a = beat(f, head), b = beat(f, head + 0.1);
    const lines = (fr: Frame) => fr.shapes.map((s, i) => ({ s, i })).filter(({ s }) => s.k === 'line' && String((s as LineShape).key ?? '').startsWith('pv-f-')) as { s: LineShape; i: number }[];
    const la = lines(a), lb = lines(b);
    if (!la.length || la[0]!.s.key === lb[0]!.s.key || a.shapes.length !== b.shapes.length) continue;
    const mid = blend(a, b, 0.5);
    const first = la[0]!.i, x0 = (a.shapes[first] as LineShape).x1, xm = (mid.shapes[first] as LineShape).x1;
    // the paper moves left by 4 px in these 0.1 s; the glide carried this line to the right
    assert.ok(xm > x0, `a line of the paper glided right: ${x0} -> ${xm}`);
    proved++;
  }
  assert.equal(proved, 1, 'a crossing was found where the list shifts');
});
