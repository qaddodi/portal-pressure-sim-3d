// No instrument text under the 12 px floor (docs/approved/type.md; capture 3531bdfa C-D11: "Instrument text in several cards is under the floor", the 07.3 / 07.7 flowcharts about 11 px on a Mac).
// Judged on every chart kind's specimens (the gallery's) at three card widths and, for the guideline path chart, under the card's fit zoom: a chart is drawn at its own width and the card's `zoom: var(--pz-fit)` then
// scales it, so the words' size ON THE SCREEN is their size here times the fit; the path chart lays out at the screen's width and scales back up (path/frame.ts) so it holds 12. Node only; the words that are DOM
// text in a card (not a chart frame) and the sizes a CSS `em` gives them need a browser (the debug audit's `small-text` scan, src/ui/debug/audit/scan-judge.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHARTS } from '../src/ui/charts/registry.ts';
import { PATHS, patientOf } from '../src/ui/charts/path/model.ts';
import { pathFrame } from '../src/ui/charts/path/frame.ts';
import type { TextShape } from '../src/ui/charts/scene.ts';
import { ctxOf } from './charts-helpers.ts';

const textOf = (f: { shapes: readonly { k: string }[] }) => f.shapes.filter((s): s is TextShape => s.k === 'text');

test('every chart specimen, three widths, two looks: no word under 12 px', () => {
  let words = 0;
  for (const c of CHARTS) for (const s of c.specimens) for (const w of [300, 420, 640]) for (const look of ['light', 'dark'] as const) {
    const f = s.build(ctxOf(look, w));
    for (const t of textOf(f)) { words++; assert.ok(t.size >= 12, `${c.kind}/${s.id} at ${w}: "${t.s}" is ${t.size} px`); }
  }
  assert.ok(words > 500, `${words} words judged`);
});

test('the guideline path chart holds 12 px on the screen under every card fit, every path, every width', () => {
  let n = 0;
  for (const of of Object.keys(PATHS)) for (const w of [330, 520, 760]) for (const fit of [1, 0.85, 0.7, 0.55]) {
    const f = pathFrame({ of, patient: patientOf(of, {}, null) }, { ...ctxOf('light', w), fit } as never);
    for (const t of textOf(f)) { n++; assert.ok(t.size * fit >= 11.99, `${of} at ${w}, fit ${fit}: "${t.s}" is ${(t.size * fit).toFixed(1)} px on the screen`); }
  }
  assert.ok(n > 1000);
});
