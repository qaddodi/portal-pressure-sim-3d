// Every card with Pressure | Velocity tabs follows one rule (Mohammad, 26 Nov, Tests > IR > TIPS): it opens on Pressure with Velocity the other tab, and the tab and the
// figure's lens are one thing, so choosing Velocity puts the figure on the velocity lens and Pressure puts it back. The rule lives in src/scene/lenses/measure.ts and
// src/ui/charts/useMeasureLens.ts; a card that keeps its own copy of the choice is the bug this pins, in every card, procedure and deck.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MEASURE_DEFAULT, MEASURE_TABS, measureOf } from '../src/scene/lenses/measure.ts';
import { DEFAULT_LENS } from '../src/scene/lenses/model.ts';

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
const files = walk('src/ui').filter((f) => /\.tsx?$/.test(f) && !/\.(generated|copied)\./.test(f));

test('the tabs read Pressure, then Velocity, and a card opens on Pressure, the figure\'s own default lens', () => {
  assert.deepEqual(MEASURE_TABS, [['pressure', 'Pressure'], ['velocity', 'Velocity']]);
  assert.equal(MEASURE_DEFAULT, 'pressure');
  assert.equal(MEASURE_DEFAULT, DEFAULT_LENS, 'a fresh figure and a fresh card agree');
  assert.equal(measureOf(DEFAULT_LENS), 'pressure');
});

test('the tab is the figure\'s lens: Velocity only on the velocity lens, Pressure on every other', () => {
  assert.equal(measureOf('velocity'), 'velocity');
  for (const l of ['pressure', 'flow', 'delta', 'heat', 'drop', 'direction', 'oxygen', 'origin', 'firstpass', 'since', 'system']) assert.equal(measureOf(l), 'pressure', l);
});

test('choosing a tab sets the figure\'s lens, and the tab follows a lens set anywhere else (the top bar, the keys, a slide)', async () => {
  const { useLens } = await import('../src/scene/lenses/store.ts');
  const { sceneApi } = await import('../src/scene/api.ts');
  useLens.setState({ lens: DEFAULT_LENS });
  assert.equal(measureOf(useLens.getState().lens), 'pressure', 'opens on Pressure');
  sceneApi.setLens('velocity');
  assert.equal(measureOf(useLens.getState().lens), 'velocity', 'Velocity tab sets the figure to velocity');
  sceneApi.setLens('pressure');
  assert.equal(measureOf(useLens.getState().lens), 'pressure', 'Pressure puts it back');
});

test('no card keeps its own Pressure | Velocity choice: every switch of the two is MEASURE_TABS read through useMeasureLens', () => {
  const own: string[] = [], fixed: string[] = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    // a switch drawn from a hand-written pair, or a state holding the pair, is a copy of the figure's lens
    if (/\[\s*'velocity'\s*,\s*'pressure'\s*\]|\[\s*'pressure'\s*,\s*'velocity'\s*\]|\[\s*\[\s*'(?:velocity|pressure)'\s*,\s*'(?:Velocity|Pressure)'\s*\]/.test(src) && !f.includes('measure')) own.push(f);
    if (/useState<[^>]*'velocity'[^>]*'pressure'|useState<[^>]*'pressure'[^>]*'velocity'/.test(src)) own.push(f);
    if (/MEASURE_TABS/.test(src) && !/useMeasureLens/.test(src)) fixed.push(f);
  }
  assert.deepEqual(own, [], 'a hand-written Velocity | Pressure pair or state: read the tabs from MEASURE_TABS and the choice from useMeasureLens');
  assert.deepEqual(fixed, [], 'a card that draws the tabs also sets the lens through useMeasureLens');
  const users = files.filter((f) => /useMeasureLens\(/.test(readFileSync(f, 'utf8')) && !f.endsWith('useMeasureLens.ts'));
  for (const want of ['src/ui/tests/ir/TipsView.tsx', 'src/ui/charts/stent/StentCard.tsx']) assert.ok(users.includes(want), `${want} drives the figure's lens`);
});

test('Tests > IR keeps no lens of its own: the pane store holds the view, the stent and the sub-view only', () => {
  const store = readFileSync('src/ui/tests/ir/store.ts', 'utf8');
  assert.doesNotMatch(store, /lens\s*:\s*['"]/, 'no stored lens to drift from the figure');
  const tips = readFileSync('src/ui/tests/ir/TipsView.tsx', 'utf8');
  assert.match(tips, /MEASURE_TABS\.map/, 'the tabs are the shared ones, Pressure first');
});
