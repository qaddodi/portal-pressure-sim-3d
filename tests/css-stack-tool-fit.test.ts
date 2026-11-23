import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('a phone\'s only instrument takes the data card\'s fit: the 3D sheet re-applies --pz-fit to .dk-in after the copied zoom: 1', () => {
  const copied = readFileSync('src/ui/css2d/app-05-presenter-cards.css', 'utf8'), own = readFileSync('src/ui/css3d-over-2d.css', 'utf8');
  assert.match(copied, /\.pz\.stack \.pz-data:is\(\.tool-open, \.tool-only\) > :not\(\.pz-tool\) \{ zoom: 1; \}/, 'the copied rule that wins on the wrapper');
  assert.match(own, /\.pz\.stack \.pz-data:is\(\.tool-open, \.tool-only\) > \.dk-in \{ zoom: var\(--pz-fit, 1\); \}/);
});

test('the room kept for the © line on a phone on its side does not shrink with the card\'s fit', () => {
  const css = readFileSync('src/ui/deck-ui.css', 'utf8');
  assert.match(css, /\[data-sideways\] \.dk-card:has\(\.pz-cred\) \.dk-in \{ padding-bottom: calc\(var\(--pad-y\) \+ 20px \/ var\(--pz-fit, 1\)\); \}/);
  // 20 px / fit, zoomed by fit, is 20 px on the screen at any fit from 0.5 to 1
  for (const fit of [0.5, 0.7, 1]) assert.ok(Math.abs((20 / fit) * fit - 20) < 1e-9);
});
