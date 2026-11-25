// The vessel, device and procedure card on a laptop or an iPad on its side is wider and cannot overprint (22 Nov 2026, Mohammad, the TIPS card on a Mac: the header's three readings ran into each other and into
// "Patent", and "Remove" ran into the Doppler icon). Node has no layout engine, so this pins the rules that make an overlap impossible, and checks the widest rows against the card's width with a generous text estimate.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { M, metricVars } from '../src/ui/shell/metrics.ts';

const css = readFileSync(new URL('../src/ui/action/action.css', import.meta.url), 'utf8');

test('the side card\'s width is one token, wider than the old 276 px, and the card reads it', () => {
  assert.equal(M.sideCardW, 340);
  assert.equal(metricVars()['--m-side-card-w'], '340px');
  assert.match(css, /\.ac-card \{[^}]*width: var\(--m-side-card-w, 340px\)/);
  assert.ok(!/\.ac-card \{[^}]*width: 276px/.test(css));
});

test('the header wraps instead of overprinting: the stent readings keep their own width, the state rides right', () => {
  assert.match(css, /\.ac-nr \{ display: flex; flex-wrap: wrap;/);
  assert.match(css, /\.ac-card \.ac-nr > \.tv-keys \{ flex: 1 1 auto; min-width: max-content; max-width: 100%; flex-wrap: wrap;/);
  assert.match(css, /\.ac-card \.ac-nr > \.tv-keys > \.ir-kv \{ flex: none; white-space: nowrap; \}/);
  assert.match(css, /\.ac-card \.ac-nr > \.ac-state \{ margin-left: auto; \}/);
});

test('the actions are a wrapping row of equal columns that are never narrower than their icon and word, and outrank the 2D stent grid', () => {
  assert.match(css, /\.ac-card > \.ac-body > \.ac-as\.ac-acts \{ display: flex; flex-wrap: wrap;/);
  assert.match(css, /\.ac-acts > \.ac-btn \{ flex: 1 1 0; min-width: max-content;/);
  // the 2D rule is (0,3,0) (`.ac-panel:has(> .tv) + .ac-as`); ours is (0,4,0)
  assert.ok(('.ac-card > .ac-body > .ac-as.ac-acts'.match(/\./g) ?? []).length > ('.ac-panel:has(> .tv) + .ac-as'.match(/\./g) ?? []).length);
});

test('at the side card\'s width the widest header line and the widest action row fit with room to spare (a 0.62 em estimate per character, wider than the UI font)', () => {
  const inner = M.sideCardW - 2 * 18 - 2;   // the card's padding and border
  const w = (text: string, px: number) => Math.ceil(text.length * px * 0.62);
  // header line 1: the name with its chevron and the state, with the close button's 30 px
  const line1 = w('TIPS', 17) + 18 + 10 + w('Patent', 13) + 30;
  assert.ok(line1 <= inner, `header line ${line1} <= ${inner}`);
  // header line 2: three readings (PPG 3.0 mmHg · flow 4.5 L/min · peak 107 cm/s) with their gaps
  const keys = w('PPG', 12) + w('3.0', 14) + w('mmHg', 12) + w('4.5', 14) + w('L/min', 12) + w('107', 14) + w('cm/s', 12) + 2 * 8 + 6 * 4;
  assert.ok(keys <= inner, `readings ${keys} <= ${inner}`);
  // the action row: Remove, Doppler, IR, each an 18 px icon, a 5 px gap, its word and 4 px of padding
  const btn = (t: string) => 18 + 5 + w(t, 13) + 4;
  const row = ['Remove', 'Doppler', 'IR'].map(btn).reduce((a, b) => a + b, 0) + 2 * 4;
  assert.ok(row <= inner, `actions ${row} <= ${inner}`);
});
