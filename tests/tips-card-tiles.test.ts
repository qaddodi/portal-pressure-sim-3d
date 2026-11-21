// The TIPS card (21 Nov 2026, play-test): its three tiles sat at different heights (a tile's words were centred in a stretched box, so a tile with a shorter small line floated lower), the
// numbers line lost its last unit at the card's edge, and the actions ran in two ragged rows. Root cause of the tiles: content centred in a box the grid stretches. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const plate = readFileSync(new URL('../src/ui/css2d/app-06-plate.css', import.meta.url), 'utf8');
const cards = readFileSync(new URL('../src/ui/css2d/app-08-cards.css', import.meta.url), 'utf8');
const panel = readFileSync(new URL('../src/ui/action/stent/StentPanel.tsx', import.meta.url), 'utf8');
const rule = (css: string, sel: string): string => css.split('\n').find((l) => l.startsWith(sel + ' {')) ?? '';

test('a choice tile starts its words at the top, never centred in the stretched box', () => {
  const r = rule(plate, '.stent-editor .se-row');
  assert.ok(r && /justify-content: flex-start/.test(r) && !/justify-content: center/.test(r));
  assert.match(rule(cards, '.ab-tile'), /align-content: start/);
});
test('the numbers line shares its slack between the readings and never clips', () => {
  const r = rule(plate, '.tv-keys');
  assert.match(r, /justify-content: space-between/);
  assert.match(r, /overflow: visible/);
});
test('the actions under the tiles sit in equal columns', () => {
  assert.match(plate, /\.ac-panel:has\(> \.tv\) \+ \.ac-as \{[^}]*display: grid; grid-template-columns: repeat\(auto-fit, minmax\(104px, 1fr\)\)/);
});
test('the vessel card draws the stent figure with its brackets and numbers, without the chart', () => {
  assert.match(panel, /tipsFigureFrame\(.*\{ lens: 'velocity', labels: true, chart: false/);
  assert.match(panel, /\{stent && <CardFigure id=\{id\} \/>\}/);
});
