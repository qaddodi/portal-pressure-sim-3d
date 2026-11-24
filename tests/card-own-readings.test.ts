// A card draws the numbers it was let in with (Ascites 12 to 13, 24 Nov 2026: "the numbers on the teaching slide change when I go to the next slide"). Root cause: CardLayer snapshotted a card's slide and
// its sizes (Plan 43 D) but handed every card, the one leaving included, the CURRENT readings, so the moment the next slide's readings were set the leaving card's pills turned into the next slide's
// numbers while it went (a card's words are in one place for every deck, so this holds for every slide transition). The Stiffness 3 bug (65b76644) was the same family on an instrument.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../src/ui/cards/CardLayer.tsx', import.meta.url), 'utf8');
const content = src.slice(src.indexOf('const content = (e: Entry)'), src.indexOf('const labelOf'));

test('a card\'s snapshot holds its readings, taken while it is the current card', () => {
  assert.match(src, /interface Snap \{[^\n]*readings: Readings \}/);
  assert.match(src, /const now: Snap = \{[^\n]*, readings \};/);
  assert.match(content, /if \(e\.phase === 'in' && \(e\.key === wordsKey \|\| e\.key === dataKey\)\) snaps\[e\.key\] = now;/);
});

test('no card is drawn from the live readings: its words, ladder and visual read the snapshot\'s', () => {
  assert.match(content, /const own = sn\.readings, readOwn = /);
  assert.doesNotMatch(content, /read=\{read\}|fp=\{readings\}|readings=\{readings\}/);
  assert.match(content, /<TeachingCard [^>]*read=\{readOwn\} fp=\{own\}/);
  assert.match(content, /<VisualCard [^>]*read=\{readOwn\} fp=\{own\}/);
  assert.match(content, /<LadderCard [^>]*readings=\{own\}/);
});
