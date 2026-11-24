// Capture 572259fd, varices 7 and 7.3: "Left portal vein22.4" (no gap, the name's last letter under the number's halo). The solver's third form is the full name with its reading bare (unit and badge dropped),
// and the layer wrote the form's INDEX to data-form, so labels.css `[data-form="2"]` (the number alone: no gap before the number) zeroed its gap. Only a label with no name is form 2.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('a label wears data-form 2 only when it has no name, never by the solver\'s form index', () => {
  const layer = readFileSync(new URL('../src/scene/labels/LabelLayer.tsx', import.meta.url), 'utf8');
  assert.doesNotMatch(layer, /dataset\.form = word \? String\(d\.form\)/);
  assert.match(layer, /el\.dataset\.form = word \? '0' : '2'/);
  const css = readFileSync(new URL('../src/scene/labels/labels.css', import.meta.url), 'utf8');
  assert.match(css, /\.lb\[data-form="2"\] \.lb-val \{ margin-left: 0; \}/, 'the rule this guards: the number alone has no gap');
});

test('a callout keeps the station names\' air off every card, not the card\'s bare edge (the GE junction label stood flush under the patient card)', async () => {
  const { cardKeepOut, placeCards } = await import('../src/scene/labels/figure-cards.ts');
  const { AIR_BLOCKER } = await import('../src/scene/labels/solver.ts');
  const card = { x0: 0, y0: 0, x1: 400, y1: 100 };
  const view = { x0: 0, y0: 0, x1: 400, y1: 800 };
  const keep = cardKeepOut([card]);
  assert.deepEqual(keep[0], { x0: -AIR_BLOCKER, y0: -AIR_BLOCKER, x1: 400 + AIR_BLOCKER, y1: 100 + AIR_BLOCKER });
  // a point just under the card, its label wanting to stand above it: with the bare edge it stands 2 px under the card; with the air it clears 6
  const at = { id: 'gej', x: 200, y: 112, w: 120, h: 16, below: false };
  const o = placeCards([at], view, keep)[0]!;
  assert.ok(o.box.y0 >= 100 + AIR_BLOCKER || o.box.y1 <= -AIR_BLOCKER, `box ${JSON.stringify(o.box)} keeps ${AIR_BLOCKER} px off the card`);
  const layer = readFileSync(new URL('../src/scene/labels/figure-cards.ts', import.meta.url), 'utf8');
  assert.match(layer, /const blockers = cardKeepOut\(d\.blockers\(\)\)/);
});
