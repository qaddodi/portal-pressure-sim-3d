// Leaving a talk used to mount the whole Tests dock (TestsLayer: panes, observers, a dozen effects) in the same commit that unmounts the deck's UI and un-inerts the app:
// one 51-68 ms frame gap on every `<talk>:leave` while the scene's own work was 1-30 ms. The dock stays mounted for the whole session, hidden and roomless in a talk.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (f: string) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

test('the shell never mounts or unmounts the Tests dock on a mode change', () => {
  const shell = read('src/ui/shell/Shell.tsx');
  assert.ok(!/mode === '(free|deck)' && <TestsLayer/.test(shell), 'TestsLayer is not conditional on the mode');
  assert.match(shell, /<TestsLayer away=\{mode === 'deck'\} \/>/);
});
test('in a talk the dock is hidden and keeps no room for the figure', () => {
  assert.match(read('src/ui/tests/tests.css'), /\.t-pos\[data-away="true"\]\s*\{[^}]*visibility: hidden/);
  const layer = read('src/ui/tests/TestsLayer.tsx');
  assert.match(layer, /place: open && !away \? place : null/);
  assert.match(layer, /open && !away && side \? place\.rect\.w : null/);
});
