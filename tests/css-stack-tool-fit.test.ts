import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('a phone\'s only instrument takes the data card\'s fit: the 3D sheet re-applies --pz-fit to .dk-in after the copied zoom: 1', () => {
  const copied = readFileSync('src/ui/css2d/app-05-presenter-cards.css', 'utf8'), own = readFileSync('src/ui/css3d-over-2d.css', 'utf8');
  assert.match(copied, /\.pz\.stack \.pz-data:is\(\.tool-open, \.tool-only\) > :not\(\.pz-tool\) \{ zoom: 1; \}/, 'the copied rule that wins on the wrapper');
  assert.match(own, /\.pz\.stack \.pz-data:is\(\.tool-open, \.tool-only\) > \.dk-in \{ zoom: var\(--pz-fit, 1\); \}/);
});
