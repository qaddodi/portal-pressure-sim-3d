// Owner's ruling L6 (27 Nov 2026, review 3531bdfa A-D15), pinned as rules over EVERY deck's tables (the baked readings, node only):
//   1. A gradient (HVPG, PPG) that moved less than 10% of its baseline reads "unchanged" (the level dash), so 16.4 to 15.2 (07.11) is not a "better"; a move of 10% or more keeps its arrow.
//   2. (reversed by the owner, 27 Nov 2026) A compared cell is its arrow and nothing else; only the reference row (Healthy, or a baseline row) prints numbers. Its number stays in the hover and for a screen reader.
//   3. The legend names the baseline the arrows are against, and the 10% rule it uses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UI } from '../src/ui/strings.generated.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { pendingRows } from '../src/ui/talk/table-rows.ts';
import { tableModel, dirAgainst, UNCHANGED_UNDER } from '../src/ui/talk/table-model.ts';
import { colChars, printsValue, VALUE_CH } from '../src/ui/cards/table-words.ts';
import { STEP_REL, atShown, fpv } from '../src/ui/deck/from2d/table-marks.js';
import type { Slide } from '../src/decks/schema.ts';
import { ensureChartsBaked } from './baked-decks.ts';
ensureChartsBaked();

const decks = await Promise.all(UI.decks.map(async ({ id }) => (await loadBuiltin(id))!));
const tables = decks.flatMap((d) => d.slides.filter((s: Slide) => s.table).map((s: Slide) => ({ d, s, name: `${d.id}/${s.id}` })));

test('a gradient under 10% of its baseline is level, 10% or more keeps its arrow; the other columns keep the 2D steps', () => {
  assert.deepEqual(UNCHANGED_UNDER, { hvpg: 0.1, ppg: 0.1 });
  assert.equal(dirAgainst('hvpg', { hvpg: 15.2 }, { hvpg: 16.4 }), 0, '07.11: 16.4 to 15.2 is a drift');
  assert.equal(dirAgainst('hvpg', { hvpg: 17.6 }, { hvpg: 16.4 }), 0, 'and 16.4 to 17.6 (7%) is too');
  assert.equal(dirAgainst('ppg', { ppg: 16 }, { ppg: 17.3 }), 0);
  assert.equal(dirAgainst('hvpg', { hvpg: 14.7 }, { hvpg: 16.4 }), -1, '10.4% down is a fall');
  assert.equal(dirAgainst('hvpg', { hvpg: 18.1 }, { hvpg: 16.4 }), 1, '10.4% up is a rise');
  assert.equal(dirAgainst('hvpg', { hvpg: 8 }, { hvpg: 16.4 }), -2, 'a halving keeps its double arrow');
  assert.equal(dirAgainst('hvpg', { hvpg: 1 }, { hvpg: 0 }), 2, 'from nothing every change shows');
  assert.equal(dirAgainst('hr', { hr: 74 }, { hr: 70 }), 1, 'a heart rate keeps the 2D step (2 per min)');
});

/** The row a row's arrows are against, as the model finds it. */
const baseOf = (rows: ReturnType<typeof pendingRows>, n: number) => {
  const r = rows[n]!, vs = r.spec.vs;
  return vs ? rows.find((x) => x.spec.key === vs || (x.spec.id && x.spec.id === vs)) ?? null : rows[0]!;
};

test('every table in every deck: a HVPG or PPG cell is level exactly when it moved under 10% of its baseline (recomputed from the slide\'s own readings)', () => {
  assert.ok(tables.length >= 30, `${tables.length} tables`);
  let seen = 0, level = 0;
  for (const { d, s, name } of tables) {
    const rows = pendingRows(d, s), m = tableModel(s.table!, rows);
    if (!m.rel) continue;
    m.rows.forEach((r, n) => {
      if (r.ref) return;
      const base = baseOf(rows, n);
      r.cells.forEach((c) => {
        if (c.kind !== 'dir' || !(c.k in UNCHANGED_UNDER) || !rows[n]!.f || !base?.f) return;
        const a = atShown(c.k, fpv(c.k, rows[n]!.f)), b = atShown(c.k, fpv(c.k, base.f));
        if (a == null || b == null || (c.k === 'hvpg' && Number.isFinite(rows[n]!.f!.tipsFlow))) return;
        const under = Math.abs(a - b) < UNCHANGED_UNDER[c.k]! * Math.max(Math.abs(b), 1e-6);
        seen++;
        if (under) { assert.equal(c.arrow, 0, `${name} "${r.title}" ${c.k}: ${b} to ${a} is under 10%, so it is level`); level++; }
        else if (Math.abs(a - b) >= STEP_REL[c.k as 'hvpg']) assert.notEqual(c.arrow, 0, `${name} "${r.title}" ${c.k}: ${b} to ${a} is 10% or more (and past the 2D app's own half-mmHg step), so it keeps its arrow`);
      });
    });
  }
  assert.ok(seen >= 10, `${seen} gradient cells checked`);
  assert.ok(level >= 1, `${level} level cells (07.11's 15.3 among them)`);
});

test('07.11: the EVL row\'s 16.4 to 15.3 is level, not a green "better" against the words', () => {
  const t = tables.find((x) => x.name === 'next-bleed/summary')!;
  const m = tableModel(t.s.table!, pendingRows(t.d, t.s));
  const hv = m.rows.map((r) => r.cells.find((c) => c.k === 'hvpg')!);
  assert.equal(hv[0]!.text, '16.4');
  const at = m.rows.findIndex((r) => /^EVL, 10 months later/.test(r.title));   // (15.2 until engine 4f4e49f moved the junction table, 28 Nov; the row is found by its title, not its number)
  assert.ok(at > 0, 'the EVL row is still in the table');
  const evl = hv[at]!;
  assert.equal(evl.text, '15.3');
  assert.equal(evl.arrow, 0);
  assert.equal(evl.eff, null, 'no green "better" on a drift');
});

test('arrows only (owner, 27 Nov 2026): a compared cell prints no number in any table of any deck; the reference row keeps its numbers; the number stays in the hover and for a screen reader', () => {
  let dirs = 0, refs = 0;
  for (const { d, s, name } of tables) {
    const m = tableModel(s.table!, pendingRows(d, s));
    m.rows.forEach((r) => r.cells.forEach((c) => {
      if (c.kind === 'dir') {
        assert.equal(printsValue(c), false, `${name} "${r.title}" ${c.k}: a cell that compares prints its arrow only`);
        assert.ok(c.text && c.sr.includes(c.text), `${name} "${r.title}" ${c.k}: but its number is still its hover and its screen-reader words`);
        dirs++;
      } else if (c.kind === 'ref') { assert.equal(printsValue(c), true, `${name} "${r.title}" ${c.k}: the reference row keeps its number`); refs++; }
      else assert.equal(printsValue(c), false);
    }));
    // (so a column is as wide as its reference number needs, or an arrow's room: an arrow-only column never asks for a value's width)
    m.cols.forEach((col, j) => {
      const cells = m.rows.map((r) => r.cells[j]);
      const ref = Math.max(0, ...cells.map((c) => (c?.kind === 'ref' ? Math.max(...c.text.split(/\s+/).map((w) => w.length)) : 0)));
      const small = cells.every((c) => !c || c.kind === 'dir' || c.kind === 'wave' || c.kind === 'pend' || c.kind === 'blank');
      if (small) assert.equal(colChars(cells), VALUE_CH, `${name} ${col.k}: no reference number, so the column is the arrows' room`);
      else if (ref) assert.ok(colChars(cells) >= ref, `${name} ${col.k}: the reference number fits`);
    });
  }
  assert.ok(dirs > 100 && refs > 30, `${dirs} compared cells, ${refs} reference cells`);
  const tsx = readFileSync(new URL('../src/ui/cards/TableCard.tsx', import.meta.url), 'utf8');
  const dir = tsx.slice(tsx.indexOf('default: {'), tsx.indexOf('export function headOver'));
  assert.match(dir, /<Arrow n=\{c\.arrow\} \/><span className="sr-only">/, 'the card draws the arrow');
  assert.doesNotMatch(dir, /dk-cv|bpBreaks|\{c\.text\}</, 'and no number beside it (only the hover title says it)');
});

test('the legend still reads right with arrows only: the arrow key is as it was, and the units line (the reference row\'s numbers) stays only where a reference row prints numbers', () => {
  for (const { d, s, name } of tables) {
    const rows = pendingRows(d, s), m = tableModel(s.table!, rows);
    if (!m.rows.some((r) => r.ref)) assert.doesNotMatch(m.legend, /Units:/, `${name}: no row prints a number, so there are no units to give`);
    assert.doesNotMatch(m.legend, /value in|each cell prints/i, `${name}: the legend promises no number in a cell`);
  }
  const t = tables.find((x) => /^The HVPG rises only with sinusoidal/.test(x.s.title ?? ''));
  assert.ok(t, 'the Sites and causes summary table (the one Mohammad captured)');
  assert.match(tableModel(t.s.table!, pendingRows(t.d, t.s)).legend, /past the red cut-off; • within normal(\. ○ [^.]+)?\. Units: pressures in mmHg/);
});

test('every table\'s legend names its baseline and, where a gradient is shown, the 10% rule', () => {
  for (const { d, s, name } of tables) {
    const rows = pendingRows(d, s), m = tableModel(s.table!, rows), gradient = (s.table!.cols ?? ['pv', 'hvpg', 'ppg']).some((k) => k in UNCHANGED_UNDER);
    if (m.rel) {
      assert.match(m.legend, /lower than \S/, `${name}: names what the arrows are against`);
      if (gradient) assert.match(m.legend, /unchanged \(a pressure within 10%\)/, `${name}: says what level means`);
    } else assert.match(m.legend, /above normal/, `${name}: arrows are against normal`);
  }
});
