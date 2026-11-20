import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rowWraps } from '../src/ui/cards/ab-short.ts';

// Mohammad, 20 Nov (Sites and causes 10/14): "disgusting teaching card with the buttons". Six choices with their full names wrapped to two-line buttons of ragged widths (2, 2, 1, 1) and made the card so tall it pushed the
// chart card off the screen. 2D's rule (presenter-ladders.js abShort): a row of choices is ONE row; where the full names would wrap, every button that has a compact label takes it, on every screen, at the same size.
test('a row wraps when its buttons stand at more than one top, or it scrolls', () => {
  assert.equal(rowWraps([10, 10, 10, 10], 560, 560), false);
  assert.equal(rowWraps([10, 10, 62, 62, 114], 560, 560), true, 'several rows');
  assert.equal(rowWraps([10.2, 9.8, 10], 560, 560), false, 'a sub-pixel difference is one row');
  assert.equal(rowWraps([10, 10], 640, 560), true, 'overflowing the card');
  assert.equal(rowWraps([10, 10], 560.5, 560), false, 'a half pixel of rounding is not an overflow');
});

test('the compare row measures with the full names, then shows the compact labels only where it wraps (the port had no such step)', () => {
  const src = readFileSync('src/ui/cards/SlideControls.tsx', 'utf8');
  assert.match(src, /fitChoiceRow\(el\)/);
  assert.match(src, /document\.fonts\.ready/, 'again when the fonts arrive');
  assert.match(src, /new ResizeObserver/, 'again when the card\'s width changes');
  assert.match(src, /className="ab-f"[^>]*>\{o\.label\}.*className="ab-s"[^>]*>\{o\.short\}/s, 'both names are in the button; the row picks one');
  assert.match(src, /'aria-label': o\.label/, 'the full name stays the button\'s accessible name');
  const css = readFileSync('src/ui/deck-ui.css', 'utf8');
  assert.match(css, /\.pz-ab\[data-compact\] \.pz-abb \.ab-f \{ display: none; \}/);
  assert.match(css, /\.pz-abb \.ab-s \{ display: none; \}/);
});

test('every choice that is long enough to wrap has a compact label in the decks (Sites and causes)', () => {
  const src = readFileSync('src/decks/rw/copied/sites.ts', 'utf8');
  const i = src.indexOf('"compare": [', src.indexOf('"label": "Portal vein thrombosis"') - 80);
  assert.ok(i > 0);
  const block = src.slice(i, src.indexOf(']', i));
  const opts = [...block.matchAll(/"label": "([^"]+)"(?:,\s*"short": "([^"]+)")?/g)];
  assert.ok(opts.length >= 6);
  for (const [, label, short] of opts) assert.ok(label!.length <= 10 || short, `${label} has no compact label`);
});
