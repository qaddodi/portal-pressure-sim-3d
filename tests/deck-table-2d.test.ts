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
  assert.match(src, /className=\{`pz-table/, '2D\'s own table rules (src/ui/styles)');
});

// (owner, 27 Nov 2026: arrows without numbers on each row, the reference row keeps its numbers; this reversed L6's value in every cell. tests/table-arrows-unchanged.test.ts holds the rule over every deck.)
test('a cell that compares draws its arrow only, and says its words to a screen reader', () => {
  const dir = src.slice(src.indexOf('default: {'), src.indexOf('export function TableCard'));
  assert.match(dir, /<Arrow n=\{c\.arrow\} \/><span className="sr-only">\{c\.sr\}<\/span>/);
  assert.doesNotMatch(dir, /dk-cv/, 'arrows only: no number beside the arrow (owner, 27 Nov 2026)');
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

// Eyes on 7ac0595 (20 Nov): on an iPhone "CENTRAL VEINS" took two lines, "Sinusoidal obstruction syndrome" three, and every patient was a block of three or four lines. Root cause: the site stood over the name
// inside the name's own narrow column. On a phone the site is a heading row, once over its group; the name has its column to itself, wider the fewer value columns there are.
test('a phone\'s table: no group heading rows, the finding is a line under the name (approved layout A, 23 Nov), the name has the column to itself', async () => {
  const { readFileSync } = await import('node:fs');
  const tsx = readFileSync(new URL('../src/ui/cards/TableCard.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/ui/deck-ui.css', import.meta.url), 'utf8');
  assert.doesNotMatch(tsx, /dk-tgroup|dk-tnrow/, 'no heading row and no row of its own for a finding: one line per case');
  assert.match(tsx, /className="vs dk-tfind"/, 'the finding sits under the name');
  assert.match(css, /--dk-name: max\(calc\(14\.5rem - var\(--nc\) \* 1\.1rem\)/, 'the name column follows the value columns');
  assert.match(css, /tbody tr th\[scope="row"\] \.pz-kick \{ display: none; \}/, 'the site is not in the patient\'s row on a phone');
});

// Night sweep on 8d3d25b (20 Nov): on an 8-column table the heads were clipped (WHV, FHV, HVP) and the first head said LEVEL. Heads that do not fit stand upright as in 2D (fitHeads, `tr.th-up`), the name's column
// takes the room they give back, and the row head is 2D's ("Level" unless the slide names its own).
test('the table fits its heads: upright when they do not fit, the name column follows; the row head is 2D\'s', async () => {
  const { readFileSync } = await import('node:fs');
  const tsx = readFileSync(new URL('../src/ui/cards/TableCard.tsx', import.meta.url), 'utf8');
  const css = readFileSync(new URL('../src/ui/deck-ui.css', import.meta.url), 'utf8');
  const model = readFileSync(new URL('../src/ui/talk/table-model.ts', import.meta.url), 'utf8');
  assert.match(tsx, /scrollWidth > t\.clientWidth \+ 1/, 'measured, not guessed');
  assert.match(tsx, /className=\{mode === 'turned' \? 'th-up' : mode === 'stagger' \? 'th-st' : undefined\}/);
  assert.match(css, /\.pz-table\.dk-pztable\.dk-up \{ --dk-name: max\(calc\(20\.5rem - var\(--nc\) \* 1\.75rem\)/);
  assert.match(model, /rowHead: spec\.rowHead \|\| 'Level'/, '2D words 1:1 (presenter.js summaryTable)');
});
