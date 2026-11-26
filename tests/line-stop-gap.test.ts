// Outflow review items 2, 3 and 5 (23 Nov 2026): a stop (. , ; : or a bracket) sits right after the word or reading it follows, and a card has one tag. Node only, static.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reserveOf } from '../src/ui/cards/roll-reserve.ts';
import { parseLine } from '../src/ui/text/line.ts';
import { DECK as OUTFLOW } from '../src/decks/hp/data/outflow.copied.ts';

const roll = readFileSync('src/ui/cards/Roll.tsx', 'utf8'), line = readFileSync('src/ui/cards/Line.tsx', 'utf8'), css = readFileSync('src/ui/deck-ui.css', 'utf8');

test('the reserve is wider than a short reading (the root of "2.3 mmHg   ."): so the stop is set inside the reading box, after its digits', () => {
  assert.ok(reserveOf('2.3 mmHg', 'hvpg').length > '2.3 mmHg'.length, 'a reading under ten holds a minus slot and a second digit');
  assert.match(roll, /\{reserve \?\? [^}]*\}\{after\}<\/span>/, 'the sizer holds the reserve AND the stop, so the box does not change width');
  assert.match(roll, /dk-roll-in' : 'dk-roll-now'\}>\{latest\.cur\}\{after && <span className="dk-roll-stop">/, 'the shown number carries the stop right after it');
  assert.match(line, /<Roll [^>]*after=\{stop\} \/><\/span><\/span>, '', i, open, before\)/, 'the line gives the stop to the Roll and sets none outside it');
});

test('a term or a bracket keeps no pill padding beside its stop (the pills are gone: "central veins ," and "( 59.4 kPa")', () => {
  assert.match(css, /\.pz-stop > :is\(\.pz-val, \.pz-term\) \{ padding-inline-end: 0; margin-inline-end: 0; \}/);
  assert.match(css, /\.pz-open > :is\(\.pz-val, \.pz-term\), \.pz-open > \.pz-nw > \.pz-val \{ padding-inline-start: 0; \}/);
  assert.doesNotMatch(css, /padding-inline-end: \.2em/);
});

test('the SOS wedge slide says its cut-off once, in words, after the reading', () => {
  const s = OUTFLOW.slides.find((x) => x.id === 'soswedge')!;
  assert.doesNotMatch(s.line as string, /\{hvpg\}, \{>=/);
  assert.match(s.line as string, /HVPG is \{hvpg\}, above the \{10 mmHg\} cut-off\./);
  const kinds = parseLine(s.line as string).map((p) => p.t);
  assert.ok(kinds.includes('value') && kinds.includes('literal'));
});

test('a card carries one tag: the deck tab steps aside where a level tab shows', () => {
  assert.match(css, /\.pz-tabname:has\(~ \.pz-sitetab:not\(\[data-rail\]\)\) \{ display: none; \}/);
  assert.match(css, /\.pz-shade\.stack \.pz-tabname:has\(~ \.pz-sitetab\[data-rail\]\) \{ display: none; \}/);
  const card = readFileSync('src/ui/cards/TeachingCard.tsx', 'utf8');
  assert.ok(card.indexOf('<NameTab deck={deck} />') < card.indexOf('className="pz-sitetab"'), 'the deck tab comes before the level tab in the DOM, which the sibling selector needs');
});

// Audit af1c51a0 (Circuit 8, every device): "the PPG falls from 17.1 mmHg      without a stent to 9.0 mmHg": a reading taken at another slide ({ppg@parallel}) wore the live reading's reserve (a minus slot and a
// padded digit, because the slide has a stent-width slider) although nothing on this slide can move it. A fixed reading holds only its own width, wherever it stands in a deck.
test('a reading taken at another slide holds only its own width, never the slider\'s reserve', () => {
  assert.match(line, /const stillHere = still \|\| !!p\.at;/);
  assert.match(line, /reserve=\{reserveOf\(text, p\.key, p\.decimals === 0, stillHere, \{ seen: p\.at \? undefined/);
  assert.match(line, /alts=\{altsOf\(text, stillHere, \{ seen: p\.at \? undefined/);
  assert.equal(reserveOf('17.1 mmHg', 'ppg', false, true), '17.1 mmHg', 'still: the reading\'s own text');
  assert.ok(reserveOf('17.1 mmHg', 'ppg', false, false).length > '17.1 mmHg'.length, 'a live reading under a slider keeps its minus slot');
  const s = parseLine('the PPG falls from {ppg@parallel} without a stent to {ppg}.').filter((x) => x.t === 'value');
  assert.deepEqual(s.map((x) => ('at' in x ? x.at : undefined)), ['parallel', undefined]);
});
