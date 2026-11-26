// The note, the zoom pill and the figure's names stand above a docked action card (23 Nov, Mohammad: the note covered the card's rows). ROOT CAUSE: `--bot-occ` is the dock and the view pill only, and the docked card
// also rests on it, so everything anchored to `--bot-occ` landed on the card. The card's height (its own resize observer, action-room.ts) is published as `--card-occ` and the three ride above it by a transform that glides, never by `bottom`.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p: string): string => readFileSync(new URL(`../src/ui/${p}`, import.meta.url), 'utf8');

test('the shell publishes the docked card\'s height as --card-occ, from the card\'s own observer', () => {
  const shell = read('shell/Shell.tsx');
  assert.match(shell, /useActionRoom\(\(s\) => s\.h\)/);
  assert.match(shell, /setProperty\('--card-occ', px\(cardH\)\)/);
});

test('the note rides above the card by `translate` (it glides with the card), its transition names translate and never bottom, and its rect for the figure\'s names includes the lift', () => {
  const css = read('shell/shell.css'), rule = /\.sh-toast \{[^}]*\}/.exec(css)![0];
  assert.match(rule, /translate: 0 calc\(-1 \* var\(--card-occ, 0px\)\)/);
  const tr = /transition: ([^;]*);/.exec(rule)![1]!;
  assert.match(tr, /translate var\(--d-small\)/);
  assert.doesNotMatch(tr, /bottom/);
  assert.match(read('shell/Toast.tsx'), /offsetTop - useActionRoom\.getState\(\)\.h/);
});

test('the zoom pill rides above the card as it does above a Tests sheet', () => {
  assert.match(read('css3d-over-2d.css'), /\.zoom-pill \{ translate: 0 calc\(-1 \* \(var\(--sheet-h, 0px\) \+ var\(--card-occ, 0px\)( \+ var\(--case-lift, 0px\))?\)\); \}/);
});
