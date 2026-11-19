// The live controls of a slide (compare buttons, response, what-if, scale pill) come from the copied 2D fields, none typed per slide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { controlsOf, patchOf, valueAt, NSBB_LEVELS } from '../src/decks/controls.ts';
import { UI } from '../src/ui/strings.generated.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { copiedOf } from '../src/decks/hp/deck.ts';

const slide = (o: Record<string, unknown>) => ({ id: 'x', kicker: '', title: '', line: '', notes: '', ask: ['', ''] as [string, string], ...o }) as never;

test('a treatment compare keeps its labels, parameters and own button', () => {
  const c = controlsOf(slide({ compare: [{ label: 'No albumin', short: 'None', params: { albumin: 2.7 } }, { label: 'Long-term albumin', short: 'Albumin', own: true, params: { albumin: 3.6 } }] }))!;
  assert.equal(c.compare!.opts.length, 2);
  assert.equal(c.compare!.opts[1]!.own, true);
  assert.deepEqual(c.compare!.opts[0]!.params, { albumin: 2.7 });
  assert.match(c.compare!.name, /treatment/);
});

test('the response control is three gains, the slide\'s own marked (usual unless it sets another)', () => {
  const usual = controlsOf(slide({ response: true }))!.compare!;
  assert.deepEqual(usual.opts.map((o) => (o.params as { nsbbGain: number }).nsbbGain), NSBB_LEVELS.map((l) => l.gain));
  assert.deepEqual(usual.opts.map((o) => !!o.own), [false, true, false]);
  const strong = controlsOf(slide({ response: true, params: { nsbbGain: 1.6 } }))!.compare!;
  assert.deepEqual(strong.opts.map((o) => !!o.own), [false, false, true]);
});

test('a compare that moves an instrument (gate, tool) is left to the Tests cards', () => {
  assert.equal(controlsOf(slide({ compare: [{ label: 'Hepatic', gate: 'a' }, { label: 'Portal', gate: 'b', own: true }] })), undefined);
  assert.equal(controlsOf(slide({ whatIf: { label: 'Air', tool: 'air', min: 0, max: 1 } })), undefined);
});

test('a what-if slider reads its paths, and a value patches every path', () => {
  const w = controlsOf(slide({ whatIf: { label: 'Stent width', param: 'tips.d', min: 6, max: 12, step: 1, unit: 'mm' } }))!.whatIf!;
  assert.deepEqual([w.paths, w.min, w.max, w.step, w.unit], [['tips.d'], 6, 12, 1, 'mm']);
  assert.deepEqual(patchOf(['tips.d'], 8), { tips: { d: 8 } });
  assert.deepEqual(patchOf(['fibrosis.a', 'fibrosis.b', 'x'], 0.5), { fibrosis: { a: 0.5, b: 0.5 }, x: 0.5 });
  assert.equal(valueAt({ tips: { d: 10 } }, 'tips.d'), 10);
  assert.equal(valueAt({ tips: { d: 10 } }, 'tips.z'), undefined);
});

test('the scale pill lists the slide\'s own scale first, then the others with where they land', () => {
  const c = controlsOf(slide({ cam: 'sinusoid', scales: { lobule: { glow: ['x'] }, anatomy: { cam: 'fit' } } }))!.scales!;
  assert.deepEqual(c.list, ['sinusoid', 'lobule', 'anatomy']);
  assert.equal(c.cam.anatomy, 'fit');
  const l = controlsOf(slide({ cam: 'liver', scales: ['lobule', 'sinusoid'] }))!.scales!;
  assert.deepEqual(l.list, ['anatomy', 'lobule', 'sinusoid']);
});

test('every deck: the controls of every slide come over, and the counts match the 2D fields', async () => {
  let compare = 0, whatIf = 0, scales = 0;
  for (const { id } of UI.decks) {
    const d = (await loadBuiltin(id))!, c = copiedOf(id);
    if (!c) continue;
    d.slides.forEach((s, i) => {
      const src = c.slides[i]!;
      if (src.compare || src.response === true) { compare += s.controls?.compare ? 1 : 0; }
      if (src.whatIf && !(src.whatIf as { tool?: string }).tool) { whatIf++; assert.ok(s.controls?.whatIf, `${id}/${s.id}`); }
      if (src.scales) { if (s.controls?.scales) scales++; }
    });
  }
  assert.ok(compare >= 45, `compare groups (${compare})`);
  assert.ok(whatIf >= 15, `what-if sliders (${whatIf})`);
  assert.ok(scales >= 8, `scale pills (${scales})`);
});

import { lapseText, playsLapse } from '../src/decks/hp/lapse.ts';

test('a time-lapse slide carries its days and counter words, and plays only from a state of the slide before', async () => {
  assert.equal(lapseText({ lapse: {} }, 12.4, 60, false), 'Day 12 of 60');
  assert.equal(lapseText({ lapse: {} }, 60, 60, true), '2 months later');
  assert.equal(lapseText({ lapse: {} }, 60, 45, true), '45 days later');
  assert.equal(lapseText({ lapse: { from: 'Compensated', to: 'Decompensated' } }, 3, 60, false), 'Compensated → Decompensated');
  assert.equal(lapseText({ lapse: { from: 'a', to: 'b' } }, 60, 60, true), 'b');
  const s = (o: object) => ({ id: 'x', days: 30, lapse: { seconds: 8 }, ...o }) as never;
  assert.equal(playsLapse(s({}), 3), true);
  assert.equal(playsLapse(s({ preset: 'csph' }), 3), false, 'a patient of its own is loaded, not aged');
  assert.equal(playsLapse(s({}), 0), false, 'the first slide has no state before it');
  let n = 0;
  for (const { id } of UI.decks) { const d = (await loadBuiltin(id))!; for (const sl of d.slides) if (sl.lapse) { n++; assert.ok(sl.lapse.days > 0, `${id}/${sl.id}`); } }
  assert.ok(n >= 40, `time-lapse slides (${n})`);
});
