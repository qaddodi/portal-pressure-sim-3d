// L2 (owner, 27 Nov) made a summary table too tall for its card PAGE by whole rows ("1 of 2"); 28 Nov the owner ruled out card pages altogether ("make it a whole new slide with a new card"). A table too tall for
// its card is now shared out over slides (decks/overlay.ts (amendSplitPages): `table.window`, the rows a slide shows; the title, the line, the columns, the heads and the legend are the whole table's on every slide).
// What is kept from L2: the floor is the table's own smallest lettering (text-floor.ts), so a table is never zoomed under 12 px on the screen; and the legend names each unit once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UI } from '../src/ui/strings.generated.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { tableModel } from '../src/ui/talk/table-model.ts';
import { pendingRows } from '../src/ui/talk/table-rows.ts';
import { floorOf, FLOOR_PX } from '../src/ui/cards/card-fit.ts';
import { smallestOf, NOT_LETTERING_PX } from '../src/ui/cards/text-floor.ts';
import { maxPages, pageSpan } from '../src/ui/cards/pages.ts';
import { ensureChartsBaked } from './baked-decks.ts';
ensureChartsBaked();

const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

async function tables() {
  const out: { deck: string; id: string; i: number; title: string; line: string; rows: ReturnType<typeof tableModel>['rows']; model: ReturnType<typeof tableModel> }[] = [];
  for (const { id } of UI.decks) {
    const d = (await loadBuiltin(id))!;
    d.slides.forEach((s, i) => {
      if (!s.table) return;
      const model = tableModel(s.table, pendingRows(d, s), () => null);
      out.push({ deck: id, id: s.id, i, title: s.title, line: s.line, rows: model.rows, model });
    });
  }
  return out;
}

test('the rows are shared out whole: every row on exactly one slide, in order, no slide empty, slides within one row of each other', () => {
  for (let len = 1; len <= 14; len++) for (let n = 1; n <= len + 3; n++) {
    const list = Array.from({ length: len }, (_, i) => i), parts = Math.min(n, len);
    const got = Array.from({ length: parts }, (_, p) => { const { from, to } = pageSpan(len, n, p); return list.slice(from, to); });
    assert.deepEqual(got.flat(), list, `${len} rows on ${n} slides`);
    for (const g of got) assert.ok(g.length >= 1, `an empty slide: ${len} rows on ${n} slides`);
    assert.ok(Math.max(...got.map((g) => g.length)) - Math.min(...got.map((g) => g.length)) <= 1, `uneven: ${len} on ${n}`);
  }
  // a table never pages: no card kind of a slide asks for a second page
  assert.equal(maxPages('visual', undefined, 9), 1);
  assert.equal(maxPages('visual', 'A line.', 0), 1);
  assert.equal(maxPages('teach', 'One. Two. Three.', 0), 1);
});

test('the floor is the table\'s own smallest lettering: hidden labels are not lettering, and lettering at the floor cannot be zoomed at all', () => {
  assert.equal(smallestOf([]), Infinity);
  assert.equal(smallestOf([16, 12, 13.4]), 12);
  assert.equal(smallestOf([0, 1, NOT_LETTERING_PX - 1, 14]), 14, 'a collapsed kicker (font-size 0) or a visually hidden label judges nothing');
  assert.equal(floorOf(smallestOf([12, 20])), 1, 'a table whose findings are 12 px is never zoomed down');
  assert.ok(floorOf(smallestOf([15.6, 18])) < 1 && 15.6 * floorOf(15.6) >= FLOOR_PX - 0.02, 'a larger table may zoom, but never past 12 px on the screen');
});

test('every table of every deck: its rows are all in the model, a table cut over slides shows every row once across them, and none of its slides has a second page', async () => {
  const ts = await tables();
  assert.ok(ts.length >= 39, `${ts.length} tables`);
  const by = new Map<string, { rows: number; seen: number[] }>();
  for (const t of ts) {
    const d = (await loadBuiltin(t.deck))!, spec = d.slides[t.i]!.table!, at = `${t.deck}/${t.id}`;
    assert.equal(t.rows.length, spec.of.length, `${at}: a table row was lost between the deck and the model`);
    assert.equal(maxPages('visual', d.slides[t.i]!.line, spec.of.length), 1, at);
    if (spec.window) {
      const base = t.id.replace(/-\d+$/, ''), e = by.get(`${t.deck}/${base}`) ?? { rows: spec.of.length, seen: [] };
      for (let r = spec.window[0]; r < spec.window[1]; r++) e.seen.push(r);
      by.set(`${t.deck}/${base}`, e);
    }
  }
  assert.ok(by.size >= 1, 'a table is shared out over slides');
  for (const [k, e] of by) assert.deepEqual(e.seen, Array.from({ length: e.rows }, (_, i) => i), `${k}: every row on exactly one slide, in order`);
});

test('the card code shows a slide\'s window of the whole table\'s grid, and no card says "n of N" for a table', () => {
  const table = src('src/ui/cards/TableCard.tsx'), vis = src('src/ui/cards/VisualCard.tsx');
  assert.match(table, /const shown = win \? model\.rows\.slice\(win\[0\], win\[1\]\) : model\.rows;/);
  assert.match(table, /chars = useMemo\(\(\) => model\.cols\.map\(\(c, j\) => colChars\(model\.rows\.map\(\(r\) => r\.cells\[j\]\)\)\)/, 'the grid is read from every row');
  assert.match(table, /const longest = useMemo\(\(\) => longestWord\(model\.rows\.map/);
  assert.match(table, /waveMaxH\(model\.rows\.length\)/);
  assert.match(table, /\{shown\.map\(\(r, k\) => \{/);
  assert.match(table, /<p className="pz-foot dk-tfoot">\{withArrows\(model\.legend/, 'the legend stands under every slide');
  assert.doesNotMatch(vis, /pageno|of \$\{pages\}/);
  assert.doesNotMatch(table, /pageSpan|pages > 1/);
});
test('a legend names each unit once: a table with both varix columns says "varix diameter in mm" once, with the normal caliber, and keeps every other unit (Gastric varices 12)', async () => {
  const t = (await tables()).find((x) => x.deck === 'gastric-varices' && x.id === 'summary')!;
  const legend = t.model.legend;
  assert.equal(legend.match(/diameter in mm/g)?.length, 1, legend);
  assert.match(legend, /fundal and esophageal varix diameter in mm \(normal vein: about 2 mm\)/);
  for (const u of ['pressures in mmHg', 'hepatic blood flow in % of normal', "HE risk is the model's own index, 0 to 1, not a probability", 'platelets × 10³/µL']) assert.ok(legend.includes(u), `${u} is still defined`);
  assert.ok(legend.length <= 360, `${legend.length} characters (it was 428)`);
  // a table with one varix column keeps its own definition
  const one = (await tables()).find((x) => x.deck === 'recompensation' && x.model.legend.includes('esophageal varix diameter'))!;
  assert.match(one.model.legend, /esophageal varix diameter in mm \(about 2 mm is the normal vein's own caliber, not a varix\)/);
});
