// B13c: the words' {tokens}, terms and step markers read cleanly on every slide of every deck: nothing is a typo for a reading, every @slide names a slide of the deck.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseWords, cutoffText, plainText, valueText, bpText, type Piece } from '../src/decks/rw/numbers.ts';
import { TARGETS_2D } from '../src/decks/rw/copied/plate.ts';
import { TILE } from '../src/ui/charts/tiles.generated.ts';
import { RW_IDS, DECKS, built } from './decks-rw-helpers.ts';

test('tokens: {key} {key:0} {key@slide} {>=10 mmHg} {#2} {6 to 8 g} and a [term](key)', () => {
  const p = parseWords('PPG {ppg} or {hvpg:0}, was {ppg@before}; cut {>=10 mmHg}; step {#2}; {6 to 8 g} of [portal vein](pv).');
  assert.deepEqual(p.filter((x) => x.t !== 'text').map((x) => x.t), ['value', 'value', 'value', 'cutoff', 'step', 'literal', 'term']);
  assert.deepEqual(p.find((x) => x.t === 'value' && x.at), { t: 'value', key: 'ppg', decimals: null, at: 'before' });
  assert.equal(cutoffText('>=10 mmHg'), '≥10 mmHg');
  assert.equal(cutoffText('<5'), '<5');
});

test('a reading prints as its tile prints it: to its decimals with its unit, a true minus, platelets as a count, the blood pressure as the bedside writes it', () => {
  assert.equal(valueText('hvpg', { hvpg: 11.14 }), '11.1 mmHg');
  assert.equal(valueText('hvpg', { hvpg: 11.14 }, true), '11 mmHg');
  assert.equal(valueText('hvpg', { hvpg: -0.04 }), '0.0 mmHg');
  assert.equal(valueText('plt', { plt: 88.2 }), '88,000/µL');
  assert.equal(valueText('hvpg', {}), '…');
  assert.equal(valueText('map', { map: 93, sbp: 120, dbp: 80 }), '120/80 (93) mmHg');
  assert.equal(bpText(undefined, undefined, 93), 'MAP 93');
  assert.equal(plainText(parseWords('now {ppg}, before {ppg@a}'), { ppg: 10 }, (id) => (id === 'a' ? { ppg: 14.26 } : null)), 'now 10.0 mmHg, before 14.3 mmHg');
});

const texts = (s: Record<string, unknown>): string[] => ['line', 'caveat', 'vignette', 'caseQ', 'title', 'kicker', 'notes'].map((f) => s[f]).filter((v): v is string => typeof v === 'string');

for (const id of RW_IDS) {
  test(`${id}: every {token}, term and @slide in its words is one the model or the figure has`, () => {
    const d = built(id), ids = new Set(d.slides.map((s) => s.id));
    const check = (t: string, where: string) => {
      for (const p of parseWords(t) as Piece[]) {
        if (p.t === 'value') { assert.ok(TILE[p.key], `${where}: {${p.key}} is no tile`); if (p.at) assert.ok(ids.has(p.at), `${where}: {${p.key}@${p.at}} names no slide of the deck`); }
        else if (p.t === 'literal') assert.ok(!/^[a-z]\w*$/i.test(p.text) || /\s/.test(p.text), `${where}: {${p.text}} looks like a reading that is not one (a typo?)`);
        else if (p.t === 'term') assert.ok(TARGETS_2D[p.term], `${where}: [${p.label}](${p.term}) points at no term`);
      }
    };
    for (const s of DECKS[id]!.slides) for (const t of texts(s)) check(t, `${id}/${s.id}`);
    for (const [q, a] of DECKS[id]!.checks) { check(q, `${id} check`); check(a, `${id} check`); }
    for (const s of d.slides) if (s.words.line) assert.ok(s.words.pieces.length, 'a line has pieces');
  });
}
