// The summary table is 2D's (Mohammad, 20 Nov: "just arrows, and the table elegant"): ONE heading row for the whole table, a row per patient, an arrow and no number in each cell that compares
// (the numbers are the reference row's), and no separate "Patient" line above it. (The page's components are not run in node: the card's source is read, the cells it draws come from table-model.ts.)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UI } from '../src/ui/strings.generated.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { tableModel } from '../src/ui/talk/table-model.ts';

const src = readFileSync(new URL('../src/ui/cards/TableCard.tsx', import.meta.url), 'utf8');

test('the card draws one table with one heading row, a row per patient, and no per-row heading grid or "Patient" line', () => {
  assert.equal((src.match(/<thead>/g) ?? []).length, 1);
  assert.equal((src.match(/<table>/g) ?? []).length, 1);
  assert.ok(!/dk-trow|dk-tcell|dk-tbl-head|dk-kicker/.test(src));
  assert.match(src, /<th>\{model\.rowHead\}<\/th>/, 'the row-name heading is the table\'s first heading, not a line of its own');
  assert.match(src, /className=\{`pz-table/, '2D\'s own table rules (css2d)');
});

test('a cell that compares draws its arrow only: its number is in the words a screen reader hears, never on the screen', () => {
  const dir = src.slice(src.indexOf('default: return ('), src.indexOf('export function TableCard'));
  assert.match(dir, /<Arrow n=\{c\.arrow\} \/>/);
  assert.ok(!/>\s*\{c\.text\}\s*</.test(dir), 'the dir cell prints no number (its title, a hover word, may)');
  assert.match(dir, /sr-only/);
});

test('every deck table has compared cells with a direction, and a reference row that keeps its numbers', async () => {
  let tables = 0, compared = 0;
  for (const { id } of UI.decks) {
    const d = (await loadBuiltin(id))!;
    for (const s of d.slides) {
      if (!s.table) continue;
      tables++;
      const m = tableModel(s.table, [], () => null);
      assert.ok(m.cols.length > 0 && m.rowHead, `${id}/${s.id}`);
      compared += m.cols.length;
    }
  }
  assert.ok(tables >= 10 && compared > 0, `${tables} tables`);
});
