// ONE rule for the column heads of every table in every deck at every width (Mohammad, 27 Nov 2026, slide 13 of Sites and causes, after arrows-only rows made the columns narrow and the heads
// turned upright and staggered: "even on iPhone avoid vertical text; 45 degree if possible, otherwise space or stagger the horizontal text; keep Pressures and Ascites and what every column means").
// The rule (table-heads.ts): flat, else two lines, else 45 degrees, else staggered; never upright; the group band always on. Pinned here over EVERY deck's tables (the specs only, node, no readings needed)
// at the narrowest phone, a phone on its side, a tablet and a Mac, with the 12 px floor.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UI } from '../src/ui/strings.generated.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { pendingRows } from '../src/ui/talk/table-rows.ts';
import { tableModel } from '../src/ui/talk/table-model.ts';
import { VALUE_CH, COL_PAD_PX } from '../src/ui/cards/table-words.ts';
import { slantPitch, slantHeight, groupRuns, showGroups } from '../src/ui/cards/table-heads.ts';
import type { Slide } from '../src/decks/schema.ts';
import { ensureChartsBaked } from './baked-decks.ts';

// (pendingRows reads the decks' baked chart data: a run on its own in a fresh container bakes it first, tests/baked-decks.test.ts)
ensureChartsBaked();

const decks = await Promise.all(UI.decks.map(async ({ id }) => (await loadBuiltin(id))!));
const tables = decks.flatMap((d) => d.slides.filter((s: Slide) => s.table).map((s: Slide) => ({ d, s, name: `${d.id}/${s.id}` })));
const FONT = 12, CH = 0.55 * FONT, ENDS = 0.62 * FONT * 1.02;   // (a character's ink at 12 px; a capital head a little wider)
const heads = (t: (typeof tables)[number]) => tableModel(t.s.table!, pendingRows(t.d, t.s)).cols;

test('every table in every deck is judged: the audit reads them all', () => {
  assert.ok(tables.length >= 35, `${tables.length} tables`);
});

test('a value column is never closer than a slant needs, so 45 degrees is always possible (the stagger is for a column under this and no table has one)', () => {
  const least = VALUE_CH * CH + COL_PAD_PX;
  assert.ok(least >= slantPitch(FONT), `the narrowest column (${least.toFixed(1)} px) is at least the slant's pitch (${slantPitch(FONT).toFixed(1)} px)`);
});

test('every table: its heads fit the rule at the narrowest phone, and the slanted row is a compact height', () => {
  for (const t of tables) {
    const cols = heads(t), widest = Math.max(...cols.map((c) => c.label.length * ENDS));
    // (the tallest a slanted row can be, from the longest head's own width)
    assert.ok(slantHeight(widest, FONT) <= 110, `${t.name}: the slanted heads (${slantHeight(widest, FONT)} px) stay compact`);
    // (the narrowest phone: 320 wide; the name's least and every value column's least must fit with the gutter the last head asks for)
    const n = cols.length, wave = cols.some((c) => c.k === 'wave') ? 72 : 0;
    assert.ok(n <= 9, `${t.name}: ${n} columns`);
    assert.ok(n * (VALUE_CH * CH + COL_PAD_PX) + wave <= 320 - 32 - 90, `${t.name}: the value columns leave the name its room on a 320 px phone`);
    // (one head is one or two words: a wrapped head never needs a third line)
    for (const c of cols) assert.ok(c.label.split(/\s+/).length <= 3, `${t.name}: head "${c.label}" is at most three words`);
  }
});

test('every table that groups two or more columns shows its band, whatever way the heads stand', () => {
  const tsx = readFileSync('src/ui/cards/TableCard.tsx', 'utf8');
  assert.match(tsx, /const runs = useMemo\(\(\) => groupRuns\(model\.cols\.map\(\(c\) => c\.group\)\), \[model\.cols\]\), groups = showGroups\(runs\)/);
  assert.match(tsx, /\{groups \? \(/, 'the band depends on the groups alone, never on the heads\' mode');
  let banded = 0;
  for (const t of tables) {
    const runs = groupRuns(heads(t).map((c) => c.group));
    if (showGroups(runs)) { banded++; assert.ok(runs.some((r) => r.label === 'Pressures' || r.label === 'Ascites'), t.name); }
  }
  assert.ok(banded >= 20, `${banded} tables carry a band`);
});

test('the heads are never upright and never under 12 px, in any sheet, at any width', () => {
  for (const f of ['src/ui/css3d-over-2d.css', 'src/ui/deck-ui.css', 'src/ui/styles/app-04-presenter.css']) {
    const t = readFileSync(f, 'utf8');
    for (const [, sel, body] of t.matchAll(/([^{}]*thead[^{}]*)\{([^}]*)\}/g)) {
      assert.ok(!/writing-mode:\s*vertical|rotate:\s*180deg|rotate\(\s*-?90deg|text-orientation/.test(body!), `${f}: ${sel!.trim()} turns text upright`);
      for (const m of body!.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) assert.ok(+m[1]! >= 12, `${f}: ${sel!.trim()} sets ${m[1]} px`);
    }
  }
  const tsx = readFileSync('src/ui/cards/TableCard.tsx', 'utf8');
  assert.doesNotMatch(tsx, /th-up|'turned'/);
});
