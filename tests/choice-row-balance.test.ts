// Mohammad, 25 Nov: "in teaching slides make sure the buttons are one row if possible; if two rows, then don't have one button only on row 2, spread them." The general rule, for every row of choices on every
// teaching slide and screen: the fit steps are full names, compact names, closed up and scaled (all ONE row), and only then two balanced rows; a lone button on the last row takes the whole row.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { rowSplit, loneOnLastRow, rowStep } from '../src/ui/cards/ab-short.ts';

test('two rows are balanced for every size of row, and a button left alone on row 2 is spread across it', () => {
  for (let n = 2; n <= 12; n++) {
    const [first, second] = rowSplit(n);
    assert.equal(first + second, n);
    assert.ok(first - second <= 1, `${n}: ${first} + ${second} is balanced`);
    const cols = first, lastRow = n - cols;
    if (cols > 1 && lastRow === 1) assert.ok(loneOnLastRow(n, cols), `${n} choices in ${cols} columns leave one alone: it must be spread`);
    else assert.ok(!loneOnLastRow(n, cols), `${n} in ${cols} columns leave none alone`);
  }
  assert.equal(loneOnLastRow(3, 2), true, 'three in two columns: 2 + 1');
  assert.equal(loneOnLastRow(6, 3), false);
  assert.equal(loneOnLastRow(5, 3), false);
  assert.equal(loneOnLastRow(2, 1), false, 'two stacked are two rows of one, not a lone button');
});

test('one row wins whenever any one-row step fits; two rows only when none does', () => {
  const base = { compactable: true, roomW: 392, floor: 0.8 };
  assert.equal(rowStep({ ...base, fullFits: true, compactFits: false, contentW: 900 }).step, 'full');
  assert.equal(rowStep({ ...base, fullFits: false, compactFits: true, contentW: 900 }).step, 'compact');
  assert.equal(rowStep({ ...base, fullFits: false, compactFits: false, contentW: 440 }).step, 'tight');
  assert.equal(rowStep({ ...base, fullFits: false, compactFits: false, contentW: 700 }).step, 'two');
});

test('every row of choices on a teaching card is fitted by the one hook (the compare chips and the scale pill), and the fit sets data-lone', () => {
  const sc = readFileSync('src/ui/cards/SlideControls.tsx', 'utf8');
  const rows = sc.match(/<div ref=\{row\} className="pz-ab"/g) ?? [], all = sc.match(/className="pz-ab"/g) ?? [];
  assert.equal(rows.length, all.length, 'no pz-ab row is left without the fit');
  assert.equal(sc.match(/useChoiceRowFit</g)?.length, rows.length + 1, 'the hook and one use a row');
  assert.match(readFileSync('src/ui/cards/ab-short.ts', 'utf8'), /setAttribute\('data-lone'/);
  assert.match(readFileSync('src/ui/deck-ui.css', 'utf8'), /\[data-two\]\[data-lone\] > \.pz-abb:last-of-type \{ grid-column: 1 \/ -1;/);
});
