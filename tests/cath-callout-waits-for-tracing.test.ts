// Mohammad, 21 Nov (iPhone, HVPG talk 3/15): the FHVP callout came before the monitor's tracing had settled. Root cause: the callout was gated on the catheter's TIP having arrived (advance 1), not on the reading
// being taken. The deck's catheter clock now says when the free reading is taken (the tracing card's own STEP_T.free) and the figure's callouts wait for it; the WHVP's wait for the wedge plateau (the column).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { T } from '../src/scene/procedures/copied/hvpg-clock.js';
import { readTaken, FREE_T, targetT } from '../src/ui/deck/cath-clock.ts';
import { STEP_T } from '../src/ui/talk/hvpg-plan.ts';
import { sceneSource } from './helpers/scene-source.ts';

test('the free reading is taken at the tracing card\'s own time, and not when the tip arrives', () => {
  assert.equal(FREE_T, STEP_T.free);
  assert.equal(readTaken(T.travel1), false, 'the tip has arrived: nothing read yet');
  assert.equal(readTaken(FREE_T - 1), false);
  assert.equal(readTaken(FREE_T), true);
  assert.equal(readTaken(targetT('wedge')), true);
  assert.equal(readTaken(targetT('route')), false);
});

test('the figure\'s callouts ask for it: the catheter reads as not there to the labels until the reading is taken', () => {
  const layer = readFileSync('src/scene/labels/LabelLayer.tsx', 'utf8'), link = readFileSync('src/ui/deck/scene-link.ts', 'utf8'), scene = sceneSource();
  assert.match(layer, /if \(!cel\.catheterRead\) return 0;/);
  assert.match(link, /read: rd/);
  assert.match(scene, /this\.catheterRead = s\.read \?\? true;/);
});
