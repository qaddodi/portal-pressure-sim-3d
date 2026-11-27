// The "Pressure so far" chart (external review of capture 3531bdfa, F-D19 and F-D20; owner ruling W13). Two rules, held on every slide of every deck that draws it:
//   1. Every state shows its free hepatic pressure: where there is no FHVP line (one state) the legend row at the right has its mark, a small neutral dot.
//   2. Every HVPG the words cite (`{hvpg@id}`, and the slide's own) is printed under the plot at the widths of a phone, the readings row giving up its PV - WHVP line to hold them.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { traceFrame } from '../src/ui/charts/trace/frame.ts';
import { chainFor, citedHvpg } from '../src/ui/charts/trace/data.ts';
import { rowPlaces, keepClear } from '../src/ui/charts/trace/model.ts';
import { f1 } from '../src/ui/charts/trace/model.ts';
import { tokensOf } from '../src/ui/text/tokens.ts';
import { ctxOf } from './charts-helpers.ts';
import { copiedDecks, resultsOf, stateOfSlides } from './helpers-deck-chain.ts';
import type { CircleShape, TextShape } from '../src/ui/charts/scene.ts';

test('rowPlaces: with one line and nothing cited it is keepClear; the latest is always kept; cited readings come before the rest', () => {
  const xs = [10, 30, 60, 90], ws = [40, 40, 40, 40];
  const kept = (a: number[]) => new Set(a.flatMap((l, i) => (l >= 0 ? [i] : [])));
  assert.deepEqual([...kept(rowPlaces(xs, ws, 120, 1))].sort(), [...keepClear(xs, ws, 120)].sort());
  const far = [100, 120, 200], w = [28, 28, 28];
  assert.deepEqual(rowPlaces(far, w, 300, 1), [-1, 0, 0], 'no priority: right to left, as keepClear');
  assert.deepEqual(rowPlaces(far, w, 300, 1, [0]), [0, -1, 0], 'a cited reading takes the place of the uncited one beside it');
  assert.deepEqual(rowPlaces(far, w, 300, 2).map((l) => l >= 0), [true, true, true], 'two lines hold neighbours that crowd one');
});

test('one state: the FHVP legend row has its mark, a neutral dot at the FHVP', async () => {
  for (const look of ['light', 'dark'] as const) {
    const f = traceFrame({ pts: [{ n: 1, title: 'A', tick: 'A', when: 'Day 0', day: 'Day 0', fp: { pv: 23, whvp: 22.3, fhvp: 6.6, hvpg: 15.7 } }] }, ctxOf(look, 330, 'phone-portrait'));
    const dots = f.shapes.filter((s): s is CircleShape => s.k === 'circle');
    const low = dots.filter((d) => d.r === 3);
    assert.equal(low.length, 1, `${look}: one small dot for the FHVP`);
    const wh = dots.find((d) => d.r === 4.5 && d !== low[0])!;
    assert.ok(low[0]!.cy > wh.cy + 20, `${look}: the dot stands at the FHVP, well under the WHVP`);
  }
});

test('every trace slide of every deck prints each HVPG its words cite, at phone widths', async () => {
  let slidesChecked = 0, cites = 0;
  for (const d of await copiedDecks()) {
    const idx = d.slides.flatMap((s, i) => (((s.tool ?? {}) as { kind?: string; range?: string; style?: string }).kind === 'trace' && (s.tool as { range?: string }).range === 'talk' && (s.tool as { style?: string }).style !== 'milestones' && tokensOf(s.line ?? '').some(({ token }) => token.kind === 'value' && token.key === 'hvpg') ? [i] : []));
    if (!idx.length) continue;
    const results = await resultsOf(d, idx.at(-1)), stateOf = stateOfSlides(d.slides as never);
    for (const i of idx) {
      const s = d.slides[i] as { id: string; line?: string; tool: Record<string, unknown> };
      const chain = chainFor(d.slides as never, stateOf, results.map((r) => r && { fp: r.fp as never, params: r.params }), i, s.tool as never);
      const cited = citedHvpg(d.slides as never, stateOf, s.line);
      const owned = tokensOf(s.line ?? '').some(({ token }) => token.kind === 'value' && token.key === 'hvpg');
      if (!chain.length || !(cited.length || owned)) continue;
      slidesChecked++;
      for (const w of [330, 358, 390]) {
        const f = traceFrame({ pts: chain, bands: s.tool.bands as never, gap: s.tool.gap as never, cited }, ctxOf('light', w, 'phone-portrait'));
        const said = f.shapes.filter((x): x is TextShape => x.k === 'text').map((x) => x.s);
        const want = [...cited.map((id) => chain.find((p) => p.id === id)), ...(owned ? [chain.at(-1)] : [])].filter((p) => p != null);
        const hasRow = said.includes('HVPG') && f.shapes.some((x) => x.k === 'text' && x.s === 'HVPG' && x.anchor !== 'middle');
        for (const p of want) { cites++; if (hasRow) assert.ok(said.includes(f1(p!.fp.hvpg)), `${d.id}/${s.id} at ${w}: HVPG ${f1(p!.fp.hvpg)} of "${p!.id}" is cited and not printed`); }
      }
    }
  }
  assert.ok(slidesChecked >= 4 && cites >= 12, `${slidesChecked} slides, ${cites} citations checked`);
});
