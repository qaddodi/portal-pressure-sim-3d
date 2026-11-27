import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Capture 187c7e53, slide 13 (iPhone): the upright column heads rendered as one upright letter a line in reverse order, because writing-mode + rotate was not trusted.
// The heads now lie by an ordinary transform on an inner word, and "No ascites" is sized to its two columns.
const css = readFileSync('src/ui/css3d-over-2d.css', 'utf8');
const tsx = readFileSync('src/ui/cards/TableCard.tsx', 'utf8');

test('no table head ever stands upright: no vertical writing mode and no quarter turn on a head, anywhere in the styles', () => {
  const sheets = ['src/ui/css3d-over-2d.css', 'src/ui/deck-ui.css', 'src/ui/styles/app-04-presenter.css'];
  for (const f of sheets) {
    const t = readFileSync(f, 'utf8');
    for (const [, rule] of t.matchAll(/([^{}]*thead[^{}]*)\{([^}]*)\}/g)) assert.ok(!/writing-mode:\s*vertical|rotate:\s*180deg|rotate\(\s*-?90deg/.test(rule!), `${f}: a head rule turns text upright: ${rule}`);
    assert.doesNotMatch(t, /th-up/, `${f} has no upright class`);
  }
  assert.match(css, /th-sl th\.num > \.hd \{[^}]*transform: rotate\(45deg\)/, 'the slant is 45 degrees');
  assert.match(tsx, /<span className="hd">\{c\.label\}<\/span>/);
});

test('"No ascites" cell stays inside its columns', () => {
  // (audit 1161e159, iPhone 440 px, Where is the resistance 12: the table's name column keeps the room of its longest word, "Schistosomiasis" 15 letters, 0.62 em each + 20 px = about 169 px; the card is 424 px wide less its
  //  padding, so nine value columns share about 227 px: 25 px each, 50 px for the two "No ascites" spans. The one line at 12 px is about 58 px: 8 px past the cell, cut. It stands on two lines instead.)
  const rule = /td\.num\.none \{([^}]*)\}/.exec(css)![1];
  assert.match(rule, /white-space: normal/);
  assert.doesNotMatch(rule, /nowrap/);
  assert.match(rule, /text-wrap: balance/);
  assert.match(rule, /font-size: 12px/, 'the type keeps its size');
  assert.match(rule, /overflow: clip/);
  // the longest word of the two lines must fit the two columns at the phone's narrowest table
  const name = 15 * 0.62 * 16 + 20, table = 424 - 28, cols = 9, span = ((table - name) / cols) * 2;
  assert.ok(span >= 7 * 6 + 2, `"ascites" (7 letters of about 6 px) fits ${Math.round(span)} px`);
  assert.ok(span < 58, 'and the one-line form did not: that is why it wraps');
});

test('a signed change is proportional, and an equation sign is infix (slides 9.2 and 3, 187c7e53)', () => {
  assert.match(readFileSync('src/scene/labels/labels.css', 'utf8'), /\.lb \.lb-val, \.lb \.lb-delta, \.lb \.lb-alert \{ font-variant-numeric: proportional-nums/);
  assert.match(readFileSync('src/ui/cards/TeachingCard.tsx', 'utf8'), /<mspace width=\{SIGN_GAP\} \/><mo form="infix" lspace="0" rspace="0">/);
});

test('a tile reading, its rating words and a callout label are proportional (no gap after a 1: "1 00", "Below 1 2", "21 .2", capture cfd1b272)', () => {
  const css = readFileSync('src/ui/css3d-over-2d.css', 'utf8');
  assert.match(css, /\.pzt-v, \.pzt-r, \.pzt-d, \.pzt-bar\) \* \{ font-variant-numeric: lining-nums proportional-nums !important; \}/);
  assert.match(css, /\.cl\.cl, \.cl\.cl \* \{ font-variant-numeric: lining-nums proportional-nums !important; \}/);
});
