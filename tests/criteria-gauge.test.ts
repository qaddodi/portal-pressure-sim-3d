// R2 (owner, 27 Nov): "a criterion with a number draws its line on that reading's gauge". Every criteria row of every deck that names a reading and a numeric cut-off
// draws a gauge on that reading's own scale (its tile's, ratings.ts scaleOf): the cut-off as a line, the side that does not meet it shaded, the patient's dot at the live value.
// Every other row (a plain rule, a case's note, a fixed "met") draws none. The gauge is one rule in one place (charts/criteria/rows.ts criteriaGauge), never typed per slide.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { SOURCE_IDS, loadSource } from '../src/decks/source.ts';
import { criteriaGauge, criteriaMet, criteriaRows, type Row } from '../src/ui/charts/criteria/rows.ts';
import { createServer } from 'vite';
import { scaleOf } from '../src/ui/cards/ratings.ts';
import { tile } from '../src/ui/charts/fmt.ts';

type Slide = { id: string; tool?: { kind?: string; rows?: unknown } };

async function everyCriteriaSlide(): Promise<{ where: string; tool: { rows?: unknown }; rows: Row[] }[]> {
  const out: { where: string; tool: { rows?: unknown }; rows: Row[] }[] = [];
  for (const id of SOURCE_IDS) {
    const d = await loadSource(id);
    (d.slides as Slide[]).forEach((s, i) => { if (s.tool?.kind === 'criteria') out.push({ where: `${id}/${s.id} (slide ${i + 2})`, tool: s.tool, rows: criteriaRows(s.tool) }); });
  }
  return out;
}

const pos = (key: string, shownV: number) => {
  const s = scaleOf(key)!;
  return Math.min(100, Math.max(0, ((shownV - s[0]) / (s[1] - s[0])) * 100));
};
/** A model reading (the engine's units) that the tile prints as `shownV`. */
const model = (key: string, shownV: number) => shownV / (tile(key)?.x ?? 1);

test('every criteria row with a reading and a numeric cut-off draws its gauge: the cut-off on the reading\'s scale, the failing side shaded, the dot at the live value', async () => {
  const slides = await everyCriteriaSlide();
  const gauged = new Set<string>();
  let rows = 0;
  for (const { where, rows: rs } of slides) for (const r of rs) {
    const numeric = !!r.key && r.op != null && r.value != null && Number.isFinite(r.value);
    if (!numeric) {
      assert.equal(criteriaGauge(r, { hvpg: 12, map: 70 }), null, `${where}: "${r.text}" names no reading and cut-off, so it draws no gauge`);
      continue;
    }
    const s = scaleOf(r.key!);
    if (!s) { assert.equal(criteriaGauge(r, {}), null, `${where}: ${r.key} has no scale, so no gauge`); continue; }
    rows++; gauged.add(where);
    const cut = pos(r.key!, r.value!), span = s[1] - s[0];
    const up = r.op === '>=' || r.op === '>';
    // a reading on each side of the line, a tenth of the scale away (held inside the scale)
    for (const side of [-1, 1]) {
      const v = Math.min(s[1], Math.max(s[0], r.value! + side * span * 0.1));
      const fp = { [r.key!]: model(r.key!, v) };
      const g = criteriaGauge(r, fp);
      assert.ok(g, `${where}: "${r.text}" draws a gauge`);
      assert.ok(Math.abs(g.cut - cut) < 1e-9, `${where}: the line stands at ${r.op}${r.value} on ${r.key}'s scale (${g.cut} vs ${cut})`);
      assert.ok(g.now != null && Math.abs(g.now - pos(r.key!, v)) < 1e-6, `${where}: the dot stands at the live ${r.key} ${v} (${g.now})`);
      // the shaded side is the side that does not meet the row, and it runs from the line to the scale's end
      assert.deepEqual(g.fail, up ? { left: 0, width: cut } : { left: cut, width: 100 - cut }, `${where}: the shade is the side that does not meet ${r.op}${r.value}`);
      const met = criteriaMet(r, fp);
      assert.equal(g.met, met);
      if (v !== r.value) assert.equal(g.now! >= g.fail.left && g.now! <= g.fail.left + g.fail.width, !met, `${where}: the dot is in the shade exactly when the row is not met`);
    }
    // no reading: the gauge stands (its line too), the dot has no place
    const none = criteriaGauge(r, {});
    assert.ok(none && none.now == null && none.met == null, `${where}: with no reading the line stays and the dot leaves`);
  }
  // the slides the rule reaches today (Tipping 6, 7 and 10, Kidney 8, Landmark trials 2 and 8, Pregnancy 7, Recompensation 7): every one of them draws its gauges
  for (const w of ['tipping/surgery', 'tipping/nocsph', 'tipping/antibiotic-card', 'kidney/hold', 'landmark-trials/predesci', 'landmark-trials/who-tips', 'pregnancy/delivery', 'recompensation/recomp']) {
    assert.ok([...gauged].some((g) => g.startsWith(`${w} `)), `${w} draws a gauge`);
  }
  assert.ok(rows >= 11, `the rule reached ${rows} rows`);
});

// (the card rendered for real, no browser: Vite's own transform loads it, react-dom/server renders it, as tests/deck-interact.test.ts does)
test('the card draws one gauge per numeric row and none for its other rows; the dot moves with the reading (Tipping 7, the Cirrhosis slider moves the HVPG across 16)', { timeout: 120_000 }, async (t) => {
  const root = new URL('..', import.meta.url).pathname;
  const server = await createServer({ configFile: false, root, logLevel: 'error', appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, hmr: false, ws: false, watch: null } });
  t.after(() => server.close());
  const { CriteriaCard } = await server.ssrLoadModule('/src/ui/charts/criteria/CriteriaCard.tsx');
  const slides = await everyCriteriaSlide();
  for (const { where, tool, rows } of slides) {
    const want = rows.filter((r) => r.key && scaleOf(r.key)).length;
    const html = renderToStaticMarkup(createElement(CriteriaCard, { tool, fp: { hvpg: 12, map: 70, sbp: 100, tp: 1, plt: 80, asc: 500, varix: 3 } }));
    assert.equal((html.match(/class="pzt-bar pzc-g"/g) ?? []).length, want, `${where}: ${want} gauges`);
  }
  const surgery = slides.find((s) => s.where.startsWith('tipping/surgery '))!;
  const at = (hvpg: number) => /pzc-g" data-met="(\w+)".*?pzb-now"[^>]*translate:clamp\(6px, ([\d.]+)%/.exec(renderToStaticMarkup(createElement(CriteriaCard, { tool: surgery.tool, fp: { hvpg } }))) ?? [];
  const [, below, x1] = at(14), [, above, x2] = at(18);
  assert.equal(below, 'no');
  assert.equal(above, 'yes');
  assert.ok(+x1! < pos('hvpg', 16) && +x2! > pos('hvpg', 16), `the dot crosses the 16 line (${x1}% to ${x2}%)`);
});
