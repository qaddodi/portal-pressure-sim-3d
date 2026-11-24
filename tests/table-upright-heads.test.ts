import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Capture 187c7e53, slide 13 (iPhone): the upright column heads rendered as one upright letter a line in reverse order, because writing-mode + rotate was not trusted.
// The heads now lie by an ordinary transform on an inner word, and "No ascites" is sized to its two columns.
const css = readFileSync('src/ui/css3d-over-2d.css', 'utf8');
const tsx = readFileSync('src/ui/cards/TableCard.tsx', 'utf8');

test('upright table heads turn by transform, not writing-mode', () => {
  assert.match(css, /th-up th\.num \{[^}]*writing-mode: horizontal-tb/);
  assert.match(css, /th\.num > \.hd \{[^}]*transform: rotate\(-90deg\)/);
  assert.match(tsx, /<span className="hd">\{c\.label\}<\/span>/);
  assert.match(tsx, /'--hl' as string/);
});

test('"No ascites" cell stays inside its columns', () => {
  assert.match(css, /td\.none \{[^}]*white-space: nowrap[^}]*overflow: clip/);
});

test('a signed change is proportional, and an equation sign is infix (slides 9.2 and 3, 187c7e53)', () => {
  assert.match(readFileSync('src/scene/labels/labels.css', 'utf8'), /\.lb \.lb-val, \.lb \.lb-delta, \.lb \.lb-alert \{ font-variant-numeric: proportional-nums/);
  assert.match(readFileSync('src/ui/cards/TeachingCard.tsx', 'utf8'), /<mspace width=\{SIGN_GAP\} \/><mo form="infix" lspace="0" rspace="0">/);
});
