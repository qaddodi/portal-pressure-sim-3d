// A turned chart word turns about its anchor (the Pressure chart's 30° station names end under their point): the span's transform origin is its own top-left corner, not
// the browser's default centre, which swung the turned words down and left and cut the beginnings off ("tal venule", "hepatic vein").
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('chart words turn about their anchor', () => {
  const src = readFileSync(new URL('../src/ui/charts/text-layer.ts', import.meta.url), 'utf8');
  assert.match(src, /transform-origin:0 0;/);
  assert.match(src, /rotate\(\$\{[^}]*\}deg\) translate\(/);
});

test('the shell resets never outrank a lifted 2D control rule', () => {
  const css = readFileSync(new URL('../src/ui/shell/shell.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /^\.sh-root (?::where\()?button\b/m);
  assert.match(css, /:where\(\.sh-root button\)/);
});
