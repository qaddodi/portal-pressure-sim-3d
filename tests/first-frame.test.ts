// First frame (atlas look plan 9): the context's own black is never shown. The canvas starts transparent over the page's ground (index.html paints --bg on html and body) and comes in with its first drawn frame.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('the canvas starts at opacity 0 and is shown by the first drawn frame, at once under reduced motion', () => {
  const s = readFileSync(new URL('../src/scene/Stage.tsx', import.meta.url), 'utf8');
  assert.match(s, /style\.opacity = '0'/);
  assert.match(s, /cel\.render\(gl\)\);[\s\S]{0,800}style\.opacity = '1'/);
  assert.match(s, /prefers-reduced-motion: reduce[\s\S]{0,120}'none'/);
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /html, body \{ margin: 0; background: #F1EBE0; \}/);
  assert.match(html, /prefers-color-scheme: dark\) \{ html, body \{ background: #1A1917; \} \}/);
});
