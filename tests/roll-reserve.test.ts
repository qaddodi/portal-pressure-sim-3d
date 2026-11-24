// Plan 45: a reading's width is the same for every value it can take, so its arrival, its ticks and a slider never re-wrap the words around it. Node only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reserveOf, SIGNED } from '../src/ui/cards/roll-reserve.ts';
import { valueText, VALUE_PENDING } from '../src/ui/text/tokens.ts';
import { TILE } from '../src/ui/charts/tiles.generated.ts';

test('every value of a reading from 0 to 99.9 reserves the same text, and so does "…" (the unit on)', () => {
  for (const key of ['pv', 'hvpg', 'ppg', 'ivc', 'lsm', 'hb', 'ra', 'pvVel', 'liver', 'clot', 'hr', 'co']) {
    const seen = new Set<string>();
    for (let v = 0; v <= 99.9; v += 0.7) {
      const t = (TILE as Record<string, { x?: number }>)[key]?.x ? valueText(key, { [key]: v / ((TILE as Record<string, { x?: number }>)[key]!.x!) }) : valueText(key, { [key]: v });
      seen.add(reserveOf(t, key));
    }
    seen.add(reserveOf(VALUE_PENDING, key));
    assert.equal(seen.size, 1, `${key}: ${[...seen].join(' | ')}`);
  }
});

test('a value under ten holds a second digit; a decimal part keeps what its tile prints; digits are all zeros', () => {
  assert.equal(reserveOf('9.8 mmHg', 'pv'), '00.0 mmHg');
  assert.equal(reserveOf('10.2 mmHg', 'pv'), '00.0 mmHg');
  assert.equal(reserveOf('7 cm/s', 'pvVel'), '00 cm/s');
  assert.equal(reserveOf('55%', 'liver'), '00%');
  assert.equal(reserveOf(VALUE_PENDING, 'liver'), '00%');
});

test('the readings that can go below zero hold a minus slot, shown or not', () => {
  assert.ok(SIGNED.has('hvpg'));
  assert.equal(reserveOf('4.2 mmHg', 'hvpg'), '−00.0 mmHg');
  assert.equal(reserveOf('−2.1 mmHg', 'hvpg'), '−00.0 mmHg');
  assert.equal(reserveOf(VALUE_PENDING, 'hvpg'), '−00.0 mmHg');
});

test('the blood pressure and the platelets keep three digits', () => {
  assert.equal(reserveOf('98/60 (73) mmHg', 'map'), reserveOf('120/80 (93) mmHg', 'map'));
  assert.equal(reserveOf(VALUE_PENDING, 'map'), reserveOf('120/80 (93) mmHg', 'map'));
  assert.equal(reserveOf('98,000/µL', 'plt'), reserveOf('150,000/µL', 'plt'));
  assert.equal(reserveOf(VALUE_PENDING, 'plt'), reserveOf('150,000/µL', 'plt'));
});

test('Roll sizes its box to the reserve and the line gives it', () => {
  assert.match(readFileSync('src/ui/cards/Roll.tsx', 'utf8'), /\{reserve \?\? \(latest\.prev/);
  assert.match(readFileSync('src/ui/cards/Line.tsx', 'utf8'), /<Roll text=\{text\} reserve=\{reserveOf\(text, p\.key, p\.decimals === 0, still, \{ seen: seen\?\.\(p\.key, p\.decimals === 0\), minus \}\)\} after=\{stop\} \/>/);
  assert.match(readFileSync('src/ui/deck-ui.css', 'utf8'), /\.dk-num \{[^}]*font-variant-numeric: tabular-nums/);
});

import { reserveOf as reserveOf2 } from '../src/ui/cards/roll-reserve.ts';
import { test as test2 } from 'node:test';
import assert2 from 'node:assert/strict';
test2('an index out of 1 holds no second whole digit (no gap after "0.80 /1.")', () => {
  assert2.equal(reserveOf2('0.80 /1', 'he', false, false, { minus: false }), '0.00 /0');
  assert2.equal(reserveOf2('0.80 /1', 'he', false, false, { minus: true }), '0.00 /0');
});
