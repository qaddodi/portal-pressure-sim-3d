// The vitals monitor (2D vitals-monitor.js): its frame is a pure function of the cells, the strip and the rails; the numbers are the 2D app's (vital-read: the hold, the cut-offs, the bedside pressure),
// and a slide's tool.show / hold / rail pick what is drawn. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { VITALS_DEFAULT, vitalsShown, vitalsFrame, vitalsLayout, vitalCells, metricsOfFp, printed, railAt, hbAt, RAIL_LO, RAIL_HI, vitalsLabel, type Cell } from '../src/ui/charts/vitals/model.ts';
import { vitalsEntry } from '../src/ui/charts/vitals/entry.ts';
import { CHARTS, chartScore } from '../src/ui/charts/registry.ts';
import { ctxOf, eachLook, judge } from './charts-helpers.ts';
import { paletteOf } from '../src/ui/charts/palette.ts';
import { MAP_BETA_CUT, SBP_BETA_CUT } from '../src/engine/hales/portal/kidney-cuts.js';
import type { TextShape, RectShape } from '../src/ui/charts/scene.ts';

const FP = { map: 88, sbp: 118, dbp: 72, hr: 78, co: 6.2, ra: 5, hb: 12.4, hbTo: 12.4 };
const cellsOf = (ids: string[], fp: Record<string, unknown> = FP, now = 0, running = true) => vitalCells(metricsOfFp(fp), ids, new Map() as never, running, now);
const words = (f: ReturnType<typeof vitalsFrame>) => f.shapes.filter((s): s is TextShape => s.k === 'text').map((s) => s.s);
const BEAT = { x: Array.from({ length: 200 }, (_, i) => i * 0.03), v: Array.from({ length: 200 }, (_, i) => (i % 28 === 0 ? 1 : 0.02)), x1: 6 };

test('a slide asks for up to three of hr, map, co, hb, in its order; the default is hr, map, hb', () => {
  assert.deepEqual(vitalsShown(null), VITALS_DEFAULT);
  assert.deepEqual(vitalsShown({ show: ['map', 'hr'] }), ['map', 'hr']);
  assert.deepEqual(vitalsShown({ show: ['hr', 'hr', 'co', 'hb', 'map'] }), ['hr', 'co', 'hb'], 'duplicates dropped, three at most');
  assert.deepEqual(vitalsShown({ show: ['ra', 'x'] }), VITALS_DEFAULT, 'a vital the monitor does not know is not shown');
});

test('the numbers are the slide\'s own state, the pressure is written as at the bedside, a reading past its cut-off is flagged', () => {
  const c = cellsOf(['hr', 'map', 'hb']);
  assert.deepEqual(c.map((x) => x.v), [78, 88, 12.4]);
  assert.equal(printed(c[1]!).main, '118/72');
  assert.equal(printed(c[1]!).mean, '(88)');
  assert.equal(printed(c[0]!).main, '78');
  assert.equal(printed(c[2]!).main, '12.4');
  assert.ok(c.every((x) => !x.bad));
  const bad = cellsOf(['hr', 'map', 'hb'], { ...FP, hr: 120, map: 60, sbp: 84, dbp: 48, hb: 6.4 }, 0, false);
  assert.deepEqual(bad.map((x) => x.bad), [true, true, true], 'tachycardia over 110, a mean under 65, a hemoglobin under 7');
  assert.equal(printed({ ...c[0]!, v: NaN }).main, '—');
  assert.ok(/Blood pressure 118\/72 \(88\) mmHg/.test(vitalsLabel(c)));
});

test('a sitting patient does not flicker: the alarm is held 1.5 s while the model runs', () => {
  const xs = new Map() as never;
  const at = (map: number, now: number) => vitalCells(metricsOfFp({ ...FP, map, sbp: 118 }), ['map'], xs, true, now)[0]!.bad;
  assert.equal(at(88, 0), false);
  assert.equal(at(60, 100), false, 'the flag waits');
  assert.equal(at(60, 1700), true, 'and comes after 1.5 s');
  assert.equal(at(66, 1800), true, 'clears only a little inside the cut-off (hysteresis 2)');
  assert.equal(at(70, 1900), true, 'held again before it clears');
  assert.equal(at(70, 3500), false);
});

test('the frame: the strip over the numbers, in the monitor\'s black, in every look and width, words at least 12 px', () => {
  eachLook((look) => {
    for (const w of [300, 360, 420, 640]) {
      for (const spec of [
        { ids: ['hr', 'map', 'hb'], hold: false, rail: null },
        { ids: ['map', 'hr'], hold: true, rail: null },
        { ids: ['hr', 'map', 'hb'], hold: false, rail: 'hb' as const },
        { ids: ['hr', 'map', 'co'], hold: false, rail: null },
      ]) {
        const cells = cellsOf(spec.ids);
        const f = vitalsFrame({ ...spec, cells, strip: BEAT, toHb: 11 }, w, paletteOf(look));
        judge(f, look, { onCard: false });
        assert.equal(f.w, w);
        assert.ok(f.shapes.some((s) => s.k === 'path'), 'the strip is drawn');
        assert.deepEqual(words(f).filter((x) => ['HR', 'BP', 'CO', 'Hb'].includes(x)), cells.map((c) => c.k));
      }
    }
  });
});

test('the numbers stand in a box of the widest they can be: a reading changing does not move its unit or its name', () => {
  const pal = paletteOf('light');
  const place = (hr: number) => { const f = vitalsFrame({ ids: ['hr'], cells: cellsOf(['hr'], { ...FP, hr }), strip: null }, 360, pal); const t = f.shapes.filter((s): s is TextShape => s.k === 'text'); return { name: t.find((x) => x.s === 'HR')!.x, unit: t.find((x) => x.s === '/min')!.x, num: t.find((x) => x.s === String(hr))!.x }; };
  const a = place(99), b = place(100);
  assert.equal(a.name, b.name); assert.equal(a.unit, b.unit);
  assert.ok(a.num > b.num, 'a longer number grows to the left, its right edge fixed');
});

test('an alarm is red digits and a red unit on the dark screen, with no filled box behind them (owner, 27 Nov, L5)', () => {
  const pal = paletteOf('light'), cells = cellsOf(['hr'], { ...FP, hr: 130 }, 0, false);
  const f = vitalsFrame({ ids: ['hr'], cells, strip: null }, 360, pal);
  assert.ok(!f.shapes.some((s) => s.k === 'rect' && /^box-/.test(s.key ?? '')), 'no alarm box');
  const text = (key: string) => f.shapes.find((s): s is TextShape => s.k === 'text' && s.key === key)!;
  assert.deepEqual(text('v-hr').color, pal.tok('mon-alarm'));
  assert.deepEqual(text('u-hr').color, pal.tok('mon-alarm'));
  assert.deepEqual(text('k-hr').color, pal.tok('mon-alarm'));
});

// (L5, owner 27 Nov: the general rule, over every monitor any deck puts up: each slide's own vitals and rail options, every vital past its cut-off at once, every look and width)
test('no monitor in any deck paints a filled box behind a reading: an alarm is ink on the dark screen', async () => {
  const { AG_IDS, loadAgDeck } = await import('../src/decks/ag/index.ts');
  const { HP_IDS, loadHpDeck } = await import('../src/decks/hp/index.ts');
  const { RW_IDS } = await import('../src/decks/rw/copied/index.ts');
  const { loadSource } = await import('../src/decks/source.ts');
  type Sl = { id: string; tool?: Record<string, unknown> };
  const decks: { id: string; slides: Sl[] }[] = [];
  for (const id of AG_IDS) decks.push({ id, slides: (await loadAgDeck(id)).slides as Sl[] });
  for (const id of HP_IDS) decks.push({ id, slides: (await loadHpDeck(id)).slides as Sl[] });
  for (const id of RW_IDS) decks.push({ id, slides: (await loadSource(id)).slides as Sl[] });
  const monitors = decks.flatMap((d) => d.slides.filter((s) => s.tool?.kind === 'vitals').map((s) => ({ at: `${d.id}/${s.id}`, tool: s.tool! })));
  assert.ok(monitors.length >= 3, `vitals slides (${monitors.length})`);
  const bad = { ...FP, hr: 130, map: 55, sbp: 80, dbp: 40, co: 3, hb: 6 };
  for (const m of monitors) {
    const ids = vitalsShown(m.tool as { show?: unknown });
    eachLook((look) => {
      for (const w of [300, 360, 420, 640]) {
        const cells = cellsOf(ids, bad, 0, false).map((c) => ({ ...c, bad: true }));
        const f = vitalsFrame({ ids, cells, hold: m.tool.hold === true, rail: m.tool.rail === 'hb' ? 'hb' : null, toHb: 5, strip: BEAT }, w, paletteOf(look));
        const texts = f.shapes.filter((s): s is TextShape => s.k === 'text' && /^(v|m|u)-/.test(s.key ?? ''));
        assert.ok(texts.length >= ids.length * 2, `${m.at}: readings and units are drawn`);
        const rects = f.shapes.filter((s): s is RectShape => s.k === 'rect' && s.key !== 'monitor');
        for (const t of texts) {
          assert.deepEqual(t.color, paletteOf(look).tok('mon-alarm'), `${m.at}: ${t.key} is in the alarm ink`);
          for (const r of rects) {
            const clear = r.x >= t.x + 60 || r.x + r.w <= t.x || r.y >= t.y + 6 || r.y + r.h <= t.y - t.size;
            assert.ok(clear || r.h <= 2 || r.w <= 2, `${m.at} ${look} ${w}: the ${r.key} rect sits behind ${t.key}`);
          }
        }
      }
    });
  }
});

test('the hold rail: a scale from 40 to 150 mmHg with Baveno VIII 4.6\'s two lines, the mean at 65 and the systolic at 90, and the pressure as a bar and a dot', () => {
  assert.equal(MAP_BETA_CUT, 65); assert.equal(SBP_BETA_CUT, 90);
  assert.equal(railAt(RAIL_LO), 0); assert.equal(railAt(RAIL_HI), 1);
  const pal = paletteOf('dark'), cells = cellsOf(['map', 'hr']);
  const f = vitalsFrame({ ids: ['map', 'hr'], cells, hold: true, strip: null }, 420, pal);
  const lines = ['cut-map', 'cut-sbp', 'rail-bar', 'rail-dot'].map((k) => f.shapes.find((s) => (s as RectShape).key === k) as RectShape | undefined);
  assert.ok(lines.every(Boolean), 'both hold lines, the bar and the dot');
  assert.ok(lines[0]!.x < lines[1]!.x, 'the mean\'s cut-off lies below the systolic\'s');
  assert.ok(words(f).includes('MAP <65') && words(f).includes('Sys <90'));
  const plain = vitalsFrame({ ids: ['map', 'hr'], cells, strip: null }, 420, pal);
  assert.ok(f.h > plain.h, 'the rail takes its own room under the numbers');
  assert.ok(!words(plain).includes('MAP <65'));
});

test('the hemoglobin rail: the 7 to 8 g/dL target of Baveno VIII 5.4 shaded, one word for where the number stands, a ring where it is heading', () => {
  const pal = paletteOf('light');
  const spec = (hb: number, to?: number) => vitalsFrame({ ids: ['hr', 'map', 'hb'], cells: cellsOf(['hr', 'map', 'hb'], { ...FP, hb }, 0, false), rail: 'hb', toHb: to, strip: null }, 420, pal);
  assert.ok(words(spec(6.5)).includes('Below 7'));
  assert.ok(words(spec(7.5)).includes('In target'));
  assert.ok(words(spec(10)).includes('Above target'));
  assert.ok(spec(7.5).shapes.some((s) => (s as RectShape).key === 'target'));
  assert.ok(spec(9, 6).shapes.some((s) => (s as RectShape).key === 'heading'), 'a ring where it is going once the plasma has refilled');
  assert.ok(!spec(9, 9.05).shapes.some((s) => (s as RectShape).key === 'heading'), 'none where it is there already');
  assert.ok(hbAt(7) > 0 && hbAt(7) < hbAt(8));
  const hold = vitalsFrame({ ids: ['map', 'hb'], cells: cellsOf(['map', 'hb']), hold: true, rail: 'hb', strip: null }, 420, pal);
  assert.ok(words(hold).includes('MAP <65') && !words(hold).includes('In target'), 'the hold rail wins where a slide sets both');
});

test('the layout: three numbers fit the width at one size, a phone gets a shorter strip, the card is never taller than the strip, the numbers and the rail', () => {
  for (const w of [300, 360, 420, 640]) {
    const L = vitalsLayout(w, cellsOf(['hr', 'map', 'co']), false);
    assert.ok(L.big >= 14 && L.big <= 46);
    assert.ok(L.cols.every((x, i) => i === 0 || x > L.cols[i - 1]!));
    assert.ok(L.h <= 14 + 110 + 12 + 18 + 46 + 14, `the card is at most 214 px: ${L.h}`);
  }
  assert.ok(vitalsLayout(300, cellsOf(['hr']), false).eh < vitalsLayout(420, cellsOf(['hr']), false).eh);
});

test('registered and done: the gallery has its specimens and the plan\'s tool kind is a chart', () => {
  assert.ok(CHARTS.some((c) => c.kind === 'vitals' && c.status === 'done'));
  assert.ok(chartScore().done >= 1);
  eachLook((look) => { for (const sp of vitalsEntry.specimens) judge(sp.build(ctxOf(look, 360)), look, { onCard: false }); });
});

// Albumin 10 (23 Nov multi-size review): a healthy pressure (MAP 90) was printed in the arterial-line red on the monitor while the sentence beside it set the same 127/72 (90) in green. Red is the alarm alone.
test('a pressure inside its cut-off is not drawn in red; past it, the alarm ink is', () => {
  const pal = paletteOf('dark' as never), ok = pal.tok('mon-ok');
  const calm = vitalsFrame({ ids: ['hr', 'map', 'hb'], cells: cellsOf(['hr', 'map', 'hb'], { ...FP, map: 90, sbp: 127, dbp: 72 }), strip: null }, 360, pal);
  const v = calm.shapes.find((s) => s.k === 'text' && s.key === 'v-map') as TextShape;
  assert.deepEqual(v.color, ok, 'in the monitor\'s ok ink');
  assert.notDeepEqual(v.color, pal.tok('mon-art'));
  assert.notDeepEqual(v.color, pal.tok('mon-alarm'));
});
