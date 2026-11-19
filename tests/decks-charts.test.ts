// A slide's chart tool or visual reaches the data card: the kinds charts.ts lists are the ones ToolCard draws, and the presenter gives such a slide a data card.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { UI } from '../src/ui/strings.generated.ts';
import { loadBuiltin } from '../src/decks/registry.ts';
import { CHART_TOOLS, INSTRUMENT_TOOLS, CHART_VISUALS, hasChart, hasToolChart } from '../src/decks/charts.ts';
import { stopsOf, viewAt } from '../src/ui/deck/presenter-machine.ts';

const src = readFileSync(new URL('../src/ui/talk/ToolCardBody.tsx', import.meta.url), 'utf8');

test('every chart kind in charts.ts has a case in ToolCard', () => {
  for (const k of [...CHART_TOOLS, ...INSTRUMENT_TOOLS]) assert.ok(src.includes(`case '${k}'`), `tool ${k}`);
  for (const k of CHART_VISUALS) assert.ok(src.includes(`case 'visual:${k}'`), `visual ${k}`);
});

test('slides with a chart tool or visual get a data card; the count of chart slides is what the 2D decks have', async () => {
  let charts = 0;
  for (const { id } of UI.decks) {
    const d = (await loadBuiltin(id))!;
    const stops = stopsOf(d);
    d.slides.forEach((s, i) => {
      if (!hasChart(s)) return;
      charts++;
      const pos = { stop: i + 1, beat: s.vignette || s.question ? 1 : 0 };
      const v = viewAt(stops, pos);
      assert.ok(v.data, `${id}/${s.id} has a data card`);
      assert.equal(v.data, hasToolChart(s) ? 'ladder' : 'table', `${id}/${s.id}`);
    });
  }
  assert.ok(charts >= 340, `chart slides (${charts})`);
});
